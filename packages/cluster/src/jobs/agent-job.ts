/**
 * Agent jobs on Effect Cluster: one per agent, named by its membership, an entity whose persisted
 * requests ask it to accept the work asked of the agent, or to stop its turns where it no longer
 * takes part. A commit stores a request with itself, and the runner that owns the entity does the
 * work through the gateway when the request arrives. Cluster keeps an entity on one runner at a time
 * and redelivers a request whose run was cut short, so an agent's work is done one request at a
 * time and resumes after a restart.
 */
import { Store } from "@amends/core/journal";
import { AgentJobs, AgentWork } from "@amends/core/turn";
import { Member, Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Cause, Crypto, DateTime, Effect, Exit, Layer, Option, PrimaryKey, Schema } from "effect";
import { ClusterSchema, DeliverAt, Entity, Sharding } from "effect/cluster";
import { Rpc } from "effect/rpc";
import { JobRetry } from "./retry.ts";

/**
 * A request for the agent to accept its pending work at `at`. Its key identifies it among the
 * job's requests: Cluster keeps one request per key, so a commit that asks twice stores one.
 */
export class AcceptWork extends Schema.Class<AcceptWork>("amends/AgentJob/AcceptWork")({
  workspaceId: Workspace.Id,
  memberId: Member.Id,
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

/** A request for the member's turns to stop where it no longer takes part. Keyed as AcceptWork is. */
export class StopDepartedTurns extends Schema.Class<StopDepartedTurns>(
  "amends/AgentJob/StopDepartedTurns",
)({
  workspaceId: Workspace.Id,
  memberId: Member.Id,
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

/** One agent: its requests take turns, and survive the runner. */
export const entity = Entity.make("amends/AgentJob", [
  Rpc.make("AcceptWork", { payload: AcceptWork }).annotate(ClusterSchema.Persisted, true),
  Rpc.make("StopDepartedTurns", { payload: StopDepartedTurns }).annotate(
    ClusterSchema.Persisted,
    true,
  ),
]);

/** The entity for a workspace's agent. */
export const entityId = (workspaceId: Workspace.Id, memberId: Member.Id) =>
  JSON.stringify([workspaceId, memberId]);

/**
 * Requests stored by Cluster. Sent inside a commit, a request shares its transaction when Cluster's
 * message storage uses the same SQL client as the workspace's storage, so it commits or rolls back
 * with the commit; the host composing them owns that. Cluster looks for the request as it stores
 * it, before the commit can show it, so once the commit is done the runner reads storage again
 * rather than finding the request at its next poll.
 *
 * @category layers
 */
export const layerRequests = Layer.effect(
  AgentJobs.Service,
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding;
    const agentJobClient = yield* entity.client;
    const failure = (cause: unknown) =>
      new Store.Failure({ operation: "request agent job", cause });
    return AgentJobs.Service.of({
      requestAcceptWork: Effect.fnUntraced(function* (request) {
        const storeTransaction = yield* Store.Transaction;
        const key = `commit:${storeTransaction.id}`;
        yield* agentJobClient(entityId(request.workspaceId, request.memberId))
          .AcceptWork(new AcceptWork({ ...request, key, at: yield* DateTime.now, attempt: 0 }), {
            discard: true,
          })
          .pipe(Effect.mapError(failure));
        yield* storeTransaction.afterCommit(sharding.pollStorage);
      }),
      requestStopDepartedTurns: Effect.fnUntraced(function* (request) {
        const storeTransaction = yield* Store.Transaction;
        const key = `commit:${storeTransaction.id}`;
        yield* agentJobClient(entityId(request.workspaceId, request.memberId))
          .StopDepartedTurns(
            new StopDepartedTurns({ ...request, key, at: yield* DateTime.now, attempt: 0 }),
            { discard: true },
          )
          .pipe(Effect.mapError(failure));
        yield* storeTransaction.afterCommit(sharding.pollStorage);
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
 * Do each request's work for its agent when it arrives, through the gateway. A run that fails asks
 * to run again after a delay; an agent whose workspace is gone is dropped.
 *
 * @category layers
 */
export const layerWorker = entity.toLayer(
  Effect.gen(function* () {
    const gateway = yield* Gateway.Service;
    const agentJobClient = yield* entity.client;
    const crypto = yield* Crypto.Crypto;
    /**
     * Do a request's work through the gateway. When it fails, ask for it again after the delay for
     * its failures, under a key no other request has.
     */
    const runOrRetry = Effect.fnUntraced(function* (
      request: AcceptWork | StopDepartedTurns,
      work: (agentWork: AgentWork.Interface) => Effect.Effect<void, unknown>,
      requestRetry: (retry: {
        readonly workspaceId: Workspace.Id;
        readonly memberId: Member.Id;
        readonly key: string;
        readonly at: DateTime.Utc;
        readonly attempt: number;
      }) => Effect.Effect<void, unknown>,
    ) {
      const exit = yield* Effect.exit(
        Effect.scoped(
          gateway.inWorkspace(request.workspaceId, Effect.flatMap(AgentWork.Service, work)),
        ),
      );
      if (Exit.isSuccess(exit)) return;
      const fields = { workspaceId: request.workspaceId, memberId: request.memberId };
      if (isWorkspaceNotFound(exit.cause))
        return yield* Effect.logError("Agent job dropped: its workspace was not found", fields);
      const attempt = request.attempt + 1;
      yield* Effect.logWarning("Agent job failed; running it again later", {
        ...fields,
        attempt,
        cause: exit.cause,
      });
      yield* requestRetry({
        ...fields,
        key: `retry:${yield* Effect.orDie(crypto.randomUUIDv4)}`,
        at: DateTime.addDuration(yield* DateTime.now, JobRetry.delay(attempt)),
        attempt,
      }).pipe(Effect.orDie);
    });
    return entity.of({
      AcceptWork: ({ payload: request }) =>
        runOrRetry(
          request,
          (agentWork) => agentWork.acceptWork(request.memberId),
          (retry) =>
            agentJobClient(entityId(retry.workspaceId, retry.memberId)).AcceptWork(
              new AcceptWork(retry),
              { discard: true },
            ),
        ),
      StopDepartedTurns: ({ payload: request }) =>
        runOrRetry(
          request,
          (agentWork) => agentWork.stopDepartedTurns(request.memberId),
          (retry) =>
            agentJobClient(entityId(retry.workspaceId, retry.memberId)).StopDepartedTurns(
              new StopDepartedTurns(retry),
              { discard: true },
            ),
        ),
    });
  }),
  { maxIdleTime: "1 minute" },
);

/** Stored requests and the worker that runs them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerRequests);

export * as AgentJob from "./agent-job.ts";
