/**
 * Turns on Effect Cluster. Each turn is its own entity, so turns run side by side while each runs
 * once at a time: the commit that creates a turn stores a request to run it, and the runner that
 * owns the entity runs it when the request arrives. Cluster redelivers a request whose run was
 * cut short, so a turn continues from its log after a restart.
 */
import { Store } from "@amends/core/journal";
import { Turn } from "@amends/core/turn";
import { TurnDispatch } from "@amends/core/turn";
import { Workspace } from "@amends/core/workspace";
import { WorkspaceTurns } from "@amends/gateway";
import { Cause, DateTime, Duration, Effect, Exit, Layer, Option, PrimaryKey, Schema } from "effect";
import { ClusterSchema, DeliverAt, Entity } from "effect/unstable/cluster";
import { Rpc } from "effect/unstable/rpc";
import { TurnRunner } from "./runner.ts";

/**
 * A request to run a workspace's turn at `at`. Its key identifies it among the turn's requests:
 * Cluster keeps one per key, so a commit's retry asks once.
 */
export class Run extends Schema.Class<Run>("amends/turn/Run")({
  workspaceId: Workspace.Id,
  turnId: Turn.Id,
  key: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  /** Failed runs before this one, for its backoff. */
  attempt: Schema.Int,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/** One turn: its runs take turns, and its requests survive the runner. */
export const TurnEntity = Entity.make("amends/Turn", [
  Rpc.make("Run", { payload: Run }).annotate(ClusterSchema.Persisted, true),
]);

/** The entity for a workspace's turn. */
export const entityId = (workspaceId: Workspace.Id, turnId: Turn.Id) =>
  JSON.stringify([workspaceId, turnId]);

/** How long a turn waits after failed runs before it runs again: doubling, up to five minutes. */
export const backoff = (attempt: number) =>
  Duration.seconds(Math.min(300, 2 ** Math.min(attempt, 9)));

/** A turn whose runs keep failing is given up after this many. */
export const attempts = 8;

/**
 * Requests stored by Cluster. Sent inside the commit that created the turn, a request shares its
 * transaction when Cluster's message storage uses the same SQL client as the workspace's storage,
 * so it commits or rolls back with the turn; the host composing them owns that.
 *
 * @category layers
 */
export const layerDispatch = Layer.effect(
  WorkspaceTurns.Service,
  Effect.gen(function* () {
    const clientFor = yield* TurnEntity.client;
    return WorkspaceTurns.Service.of({
      forWorkspace: (workspaceId) =>
        TurnDispatch.Service.of({
          workspaceId,
          request: Effect.fnUntraced(function* (turnId) {
            yield* Store.Transaction;
            const at = yield* DateTime.now;
            yield* clientFor(entityId(workspaceId, turnId))
              .Run(new Run({ workspaceId, turnId, key: "created", at, attempt: 0 }), {
                discard: true,
              })
              .pipe(
                Effect.mapError((cause) => new Store.Failure({ operation: "dispatch", cause })),
              );
          }),
        }),
    });
  }),
);

/**
 * Run each turn when its request arrives. A run that fails before the turn finishes asks to run
 * again after a backoff, and after too many failures gives the turn up as failed. Until that
 * failure is recorded, the turn keeps asking to record it, without running again, so it never
 * stays active with nothing to run it. A turn whose workspace is gone is dropped.
 *
 * @category layers
 */
export const layerWorker = TurnEntity.toLayer(
  Effect.gen(function* () {
    const runner = yield* TurnRunner.Service;
    const clientFor = yield* TurnEntity.client;
    return TurnEntity.of({
      Run: ({ payload: request }) =>
        Effect.gen(function* () {
          const where = { workspaceId: request.workspaceId, turnId: request.turnId };
          /** Try again after the backoff for `attempt`, which gives up from `attempts` on. */
          const later = Effect.fnUntraced(function* (attempt: number) {
            const now = yield* DateTime.now;
            yield* clientFor(entityId(request.workspaceId, request.turnId))
              .Run(
                new Run({
                  workspaceId: request.workspaceId,
                  turnId: request.turnId,
                  key: `retry:${attempt}`,
                  at: DateTime.addDuration(now, backoff(attempt)),
                  attempt,
                }),
                { discard: true },
              )
              .pipe(Effect.orDie);
          });
          const exit = yield* Effect.exit(
            request.attempt >= attempts
              ? runner.abandon(request.workspaceId, request.turnId)
              : runner.run(request.workspaceId, request.turnId),
          );
          if (Exit.isSuccess(exit)) return;
          const failure = Option.map(Cause.findErrorOption(exit.cause), (error) => error._tag);
          if (Option.contains(failure, "Gateway.WorkspaceNotFound")) {
            yield* Effect.logError("Turn dropped: its workspace was not found", where);
            return;
          }
          const attempt = request.attempt + 1;
          if (request.attempt >= attempts) {
            yield* Effect.logError("Turn could not be marked failed; trying again later", {
              ...where,
              attempt,
              cause: exit.cause,
            });
            return yield* later(attempt);
          }
          if (attempt >= attempts) {
            yield* Effect.logError("Turn given up after failed runs", { ...where, attempt });
            const abandoned = yield* Effect.exit(
              runner.abandon(request.workspaceId, request.turnId),
            );
            if (Exit.isSuccess(abandoned)) return;
            yield* Effect.logError("Turn could not be marked failed; trying again later", {
              ...where,
              attempt,
              cause: abandoned.cause,
            });
            return yield* later(attempt);
          }
          yield* Effect.logWarning("Turn run failed; running it again later", {
            ...where,
            attempt,
            cause: exit.cause,
          });
          yield* later(attempt);
        }),
    });
  }),
  { maxIdleTime: "1 minute" },
);

/** Stored requests and the worker that runs them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerDispatch);

export * as ClusterTurns from "./cluster-turns.ts";
