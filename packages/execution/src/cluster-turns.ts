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
import { ClusterRetry, WorkspaceTurnDispatch } from "@amends/gateway";
import { Cause, DateTime, Effect, Exit, Layer, Option, PrimaryKey, Schema } from "effect";
import { ClusterSchema, DeliverAt, Entity, Sharding } from "effect/unstable/cluster";
import { Rpc } from "effect/unstable/rpc";
import { TurnRunner } from "./runner.ts";

/**
 * A request to run a workspace's turn at `at`. Its key identifies it among the turn's requests:
 * Cluster keeps one per key, so a worker that runs again after a crash asks for its retry once.
 */
export class Run extends Schema.Class<Run>("amends/turn/Run")({
  workspaceId: Workspace.Id,
  turnId: Turn.Id,
  key: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  /** Failed runs before this one, for its delay. */
  attempt: Schema.Int,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/**
 * A request to give up a turn whose runs kept failing, recording it as failed at `at`. Keyed as a
 * run is.
 */
export class Abandon extends Schema.Class<Abandon>("amends/turn/Abandon")({
  workspaceId: Workspace.Id,
  turnId: Turn.Id,
  key: Schema.String,
  at: Schema.DateTimeUtcFromMillis,
  /** Failed attempts to record it before this one, for its delay. */
  attempt: Schema.Int,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
  [DeliverAt.symbol]() {
    return this.at;
  }
}

/** One turn: asked to run, or to give up, one request at a time; its requests survive the runner. */
export const TurnEntity = Entity.make("amends/Turn", [
  Rpc.make("Run", { payload: Run }).annotate(ClusterSchema.Persisted, true),
  Rpc.make("Abandon", { payload: Abandon }).annotate(ClusterSchema.Persisted, true),
]);

/** The entity for a workspace's turn. */
export const entityId = (workspaceId: Workspace.Id, turnId: Turn.Id) =>
  JSON.stringify([workspaceId, turnId]);

/** A turn whose runs keep failing is given up after this many. */
export const maxFailedRuns = 8;

/**
 * Requests stored by Cluster. Sent inside the commit that created the turn, a request shares its
 * transaction when Cluster's message storage uses the same SQL client as the workspace's storage,
 * so it commits or rolls back with the turn; the host composing them owns that. Cluster looks for
 * the request as it stores it, before the commit can show it, so once the commit is done the
 * runner reads storage again rather than finding the request at its next poll.
 *
 * @category layers
 */
export const layerDispatch = Layer.effect(
  WorkspaceTurnDispatch.Service,
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding;
    const turnClient = yield* TurnEntity.client;
    return WorkspaceTurnDispatch.Service.of({
      forWorkspace: (workspaceId) =>
        TurnDispatch.Service.of({
          request: Effect.fnUntraced(function* (turnId) {
            const storeTransaction = yield* Store.Transaction;
            const at = yield* DateTime.now;
            yield* turnClient(entityId(workspaceId, turnId))
              .Run(new Run({ workspaceId, turnId, key: "created", at, attempt: 0 }), {
                discard: true,
              })
              .pipe(
                Effect.mapError((cause) => new Store.Failure({ operation: "dispatch", cause })),
              );
            yield* storeTransaction.afterCommit(sharding.pollStorage);
          }),
        }),
    });
  }),
);

/** Whether a run failed because its workspace was never created. */
const isWorkspaceNotFound = (cause: Cause.Cause<{ readonly _tag: string }>) =>
  Option.contains(
    Option.map(Cause.findErrorOption(cause), (error) => error._tag),
    "Gateway.WorkspaceNotFound",
  );

/**
 * Run each turn when its request arrives. A run that fails before the turn finishes asks to run
 * again after a delay; after `maxFailedRuns` it asks to give the turn up instead. Giving up
 * records the turn as failed, and asks again after a delay until that is recorded, so a turn
 * never stays active with nothing to run it. A turn whose workspace is gone is dropped.
 *
 * @category layers
 */
export const layerWorker = TurnEntity.toLayer(
  Effect.gen(function* () {
    const turnRunner = yield* TurnRunner.Service;
    const turnClient = yield* TurnEntity.client;
    /** The fields that name a request's turn in the logs. */
    const turnFields = (request: Run | Abandon) => ({
      workspaceId: request.workspaceId,
      turnId: request.turnId,
    });
    /** Ask to run the turn again once the delay for `failures` failed runs has passed. */
    const retryRun = Effect.fnUntraced(function* (request: Run, failures: number) {
      const at = DateTime.addDuration(yield* DateTime.now, ClusterRetry.delay(failures));
      yield* turnClient(entityId(request.workspaceId, request.turnId))
        .Run(new Run({ ...turnFields(request), key: `retry:${failures}`, at, attempt: failures }), {
          discard: true,
        })
        .pipe(Effect.orDie);
    });
    /** Ask to give the turn up: at once at first, then after the delay for `failures` failures. */
    const requestAbandon = Effect.fnUntraced(function* (request: Run | Abandon, failures: number) {
      const now = yield* DateTime.now;
      const at = failures === 0 ? now : DateTime.addDuration(now, ClusterRetry.delay(failures));
      yield* turnClient(entityId(request.workspaceId, request.turnId))
        .Abandon(
          new Abandon({
            ...turnFields(request),
            key: `abandon:${failures}`,
            at,
            attempt: failures,
          }),
          { discard: true },
        )
        .pipe(Effect.orDie);
    });
    return TurnEntity.of({
      Run: ({ payload: run }) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(turnRunner.run(run.workspaceId, run.turnId));
          if (Exit.isSuccess(exit)) return;
          if (isWorkspaceNotFound(exit.cause))
            return yield* Effect.logError(
              "Turn dropped: its workspace was not found",
              turnFields(run),
            );
          const failedRuns = run.attempt + 1;
          if (failedRuns >= maxFailedRuns) {
            yield* Effect.logError("Turn given up after failed runs", {
              ...turnFields(run),
              failedRuns,
              cause: exit.cause,
            });
            return yield* requestAbandon(run, 0);
          }
          yield* Effect.logWarning("Turn run failed; running it again later", {
            ...turnFields(run),
            failedRuns,
            cause: exit.cause,
          });
          yield* retryRun(run, failedRuns);
        }),
      Abandon: ({ payload: abandon }) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(turnRunner.abandon(abandon.workspaceId, abandon.turnId));
          if (Exit.isSuccess(exit)) return;
          if (isWorkspaceNotFound(exit.cause))
            return yield* Effect.logError(
              "Turn dropped: its workspace was not found",
              turnFields(abandon),
            );
          const failures = abandon.attempt + 1;
          yield* Effect.logError("Turn could not be marked failed; trying again later", {
            ...turnFields(abandon),
            failures,
            cause: exit.cause,
          });
          yield* requestAbandon(abandon, failures);
        }),
    });
  }),
  { maxIdleTime: "1 minute" },
);

/** Stored requests and the worker that runs them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerDispatch);

export * as ClusterTurns from "./cluster-turns.ts";
