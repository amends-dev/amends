/**
 * Turn jobs on Effect Cluster: one for each agent in each thread, an entity whose persisted
 * requests ask it to run the agent's work there or to stop its turn. A commit stores a request
 * with itself, and the runner that owns the entity handles it when it arrives. Cluster keeps an
 * entity on one runner at a time and redelivers a request whose handling was cut short, so a turn
 * cut short runs again. A request that fails is tried again where it is, as `JobRequests` says;
 * then a run that accepted a turn gives the turn up. The job's runs take turns, while a stop
 * reaches the run in progress. `layerRequests` gives core's `TurnJobs.TurnJobs` to commits, and
 * `layerWorker` handles each job's requests through its `TurnRunner`.
 *
 * @since 0.1.0
 */

import { Store, StoreError } from "@amends-dev/core/journal"
import { ThreadId } from "@amends-dev/core/thread"
import { TurnJobs, TurnId } from "@amends-dev/core/turn"
import { WorkspaceId, MemberId } from "@amends-dev/core/workspace"
import * as ClusterSchema from "effect/cluster/ClusterSchema"
import * as Entity from "effect/cluster/Entity"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PrimaryKey from "effect/PrimaryKey"
import * as Ref from "effect/Ref"
import * as Rpc from "effect/rpc/Rpc"
import * as Schema from "effect/Schema"
import * as JobRequests from "./JobRequests.ts"
import * as TurnRunner from "./TurnRunner.ts"

/**
 * Which request this is among the job's: Cluster keeps one request per key, so a commit that asks
 * twice stores one.
 */
const keyed = { key: Schema.String }

/**
 * A request to run the agent's next turn in the thread, keyed by the commit that stored it.
 *
 * @category schemas
 * @since 0.1.0
 */
export class Run extends Schema.Class<Run>("amends/TurnJob/Run")({
  ...TurnJobs.Job.fields,
  ...keyed
}) {
  [PrimaryKey.symbol]() {
    return this.key
  }
}

/**
 * A request to stop the turn `turnId`, which was asked to stop or whose agent no longer takes part,
 * keyed by the turn and the commit that stored it.
 *
 * @category schemas
 * @since 0.1.0
 */
export class Stop extends Schema.Class<Stop>("amends/TurnJob/Stop")({
  ...TurnJobs.Job.fields,
  ...keyed,
  turnId: TurnId.TurnId
}) {
  [PrimaryKey.symbol]() {
    return this.key
  }
}

/**
 * The `amends/TurnJob` entity: an agent's work in one thread, addressed by `entityId`. Its `Run`
 * and `Stop` requests are persisted, so they survive the runner.
 *
 * @category services
 * @since 0.1.0
 */
export const entity = Entity.make("amends/TurnJob", [
  Rpc.make("Run", { payload: Run }).annotate(ClusterSchema.Persisted, true),
  Rpc.make("Stop", { payload: Stop }).annotate(ClusterSchema.Persisted, true)
])

/**
 * The ID of `job`'s entity: its workspace, membership, and thread as a JSON array, which the
 * worker reads back into the job.
 *
 * @category utils
 * @since 0.1.0
 */
export const entityId = (job: TurnJobs.Job) => encodeEntityId([job.workspaceId, job.memberId, job.threadId])

/** An entity's ID, written and read back by the one codec. */
const EntityId = Schema.fromJsonString(Schema.Tuple([WorkspaceId.WorkspaceId, MemberId.MemberId, ThreadId.ThreadId]))
const encodeEntityId = Schema.encodeSync(EntityId)
const decodeEntityId = Schema.decodeUnknownSync(EntityId)

/** The job an entity is. */
const jobOf = (entityId: string): TurnJobs.Job => {
  const [workspaceId, memberId, threadId] = decodeEntityId(entityId)
  return { workspaceId, memberId, threadId }
}

/**
 * A request the job handles: a `Run` or a `Stop`.
 *
 * @category models
 * @since 0.1.0
 */
export type Request = Run | Stop

/**
 * Provides core's `TurnJobs.TurnJobs`, whose requests Cluster stores, each keyed by the commit that
 * asks for it. Sent inside a commit, a request shares its transaction when Cluster's message
 * storage uses the same SQL client as the workspace's storage, so it commits or rolls back with the
 * commit; the host composing them owns that. Once the commit is done, the host's
 * `JobRequests.Wakeup` wakes the runners, so the one that owns the job reads the request at once.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerRequests = Layer.effect(
  TurnJobs.TurnJobs,
  Effect.gen(function* () {
    const wakeup = yield* JobRequests.Wakeup
    const turnJobClient = yield* entity.client
    const failure = StoreError.failed("Store", "request turn job")
    return TurnJobs.TurnJobs.of({
      requestRun: Effect.fnUntraced(function* ({ workspaceId, memberId, threadId }) {
        const storeTransaction = yield* Store.Transaction
        const run = new Run({ workspaceId, memberId, threadId, key: `run:${storeTransaction.id}` })
        yield* turnJobClient(entityId(run)).Run(run, { discard: true }).pipe(Effect.mapError(failure))
        yield* wakeup.afterCommit
      }),
      requestStop: Effect.fnUntraced(function* ({ workspaceId, memberId, threadId, turnId }) {
        const storeTransaction = yield* Store.Transaction
        const stop = new Stop({
          workspaceId,
          memberId,
          threadId,
          turnId,
          key: `stop:${turnId}:${storeTransaction.id}`
        })
        yield* turnJobClient(entityId(stop)).Stop(stop, { discard: true }).pipe(Effect.mapError(failure))
        yield* wakeup.afterCommit
      })
    })
  })
)

/**
 * Handle each request when it arrives, through the job's turn runner: run the agent's next turn,
 * or stop its turn. A request that fails is tried again until it holds or has failed
 * `JobRequests.maxFailures` times; then a run that accepted a turn gives the turn up, which is
 * tried until it holds, so a turn never stays active with nothing to run it, and any other request
 * is dropped.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerWorker = entity.toLayer(
  Effect.gen(function* () {
    const job = jobOf((yield* Entity.CurrentAddress).entityId)
    const { workspaceId, memberId, threadId } = job
    const turnRunner = yield* TurnRunner.make(job)
    /** What a log says of `request`: its job and key. */
    const named = (request: Request) => ({ workspaceId, memberId, threadId, request: request.key })

    const retrying = <A, E, R>(request: Request, work: Effect.Effect<A, E, R>, times?: number) =>
      JobRequests.retrying("Turn job", named(request), work, times)
    const drop = (request: Request, error: unknown) => JobRequests.drop("Turn job", named(request), error)

    /** Give the turn up, as the request's runs kept failing to run it, trying until it holds. */
    const giveUp = (request: Run, turnId: TurnId.TurnId) =>
      retrying(request, turnRunner.giveUp(turnId, "Its turn job kept failing to run it.")).pipe(
        Effect.catch((error) => drop(request, error))
      )

    /**
     * Run the agent's next turn, trying again after each failed run until `JobRequests.maxFailures`. Then the
     * turn a run accepted, if one did, is given up, and otherwise the request is dropped.
     */
    const runNextTurn = Effect.fnUntraced(function* (request: Run) {
      /** The turn the runs accepted, once one did; a later run may fail before finding it again. */
      const accepted = yield* Ref.make<TurnId.TurnId | undefined>(undefined)
      const run = turnRunner.runNextTurn.pipe(
        Effect.tapError((error) => Ref.update(accepted, (turnId) => error.turnId ?? turnId))
      )
      yield* retrying(request, run, JobRequests.maxFailures - 1).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (error) {
            const turnId = yield* Ref.get(accepted)
            if (turnId === undefined || JobRequests.isWorkspaceNotFound(error)) return yield* drop(request, error)
            yield* giveUp(request, turnId)
          })
        )
      )
    })

    /** Stop the turn, trying again after each failure until `JobRequests.maxFailures`; then it is dropped. */
    const stopTurn = (request: Stop) =>
      retrying(request, turnRunner.stopTurn(request.turnId), JobRequests.maxFailures - 1).pipe(
        Effect.catch((error) => drop(request, error))
      )

    return entity.of({
      Run: ({ payload: run }) => runNextTurn(run),
      Stop: ({ payload: stop }) => stopTurn(stop)
    })
  }),
  { concurrency: "unbounded", maxIdleTime: "1 minute" }
)

/**
 * Both `layerRequests` and `layerWorker`, over the host's Cluster: the requests commits store, and
 * the worker that handles them.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.merge(layerWorker, layerRequests)
