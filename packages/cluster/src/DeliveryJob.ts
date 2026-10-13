/**
 * Delivery jobs on Effect Cluster: one for each bound thread, an entity whose persisted requests
 * ask it to deliver what the thread's contacts were told. A commit stores a request with itself,
 * and the runner that owns the entity handles it when it arrives, one request at a time, so a
 * thread's messages reach its conversation in order. Cluster keeps an entity on one runner at a
 * time and redelivers a request whose handling was cut short. A request that fails is tried again
 * where it is, as `JobRequests` says; then the delivery the job could not post is given up.
 * `layerRequests` gives core's `DeliveryJobs.DeliveryJobs` to commits, and `layerWorker` handles
 * each job's requests through its `DeliveryRunner`.
 *
 * @since 0.1.0
 */

import { DeliveryJobs } from "@amends-dev/core/channel"
import { Store, StoreError } from "@amends-dev/core/journal"
import { ThreadId } from "@amends-dev/core/thread"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as ClusterSchema from "effect/cluster/ClusterSchema"
import * as Entity from "effect/cluster/Entity"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PrimaryKey from "effect/PrimaryKey"
import * as Rpc from "effect/rpc/Rpc"
import * as Schema from "effect/Schema"
import * as DeliveryRunner from "./DeliveryRunner.ts"
import * as JobRequests from "./JobRequests.ts"

/**
 * A request to deliver what the thread's contacts were told, keyed by the commit that stored it;
 * Cluster keeps one per key.
 *
 * @category schemas
 * @since 0.1.0
 */
export class Deliver extends Schema.Class<Deliver>("amends/DeliveryJob/Deliver")({
  ...DeliveryJobs.Job.fields,
  key: Schema.String
}) {
  [PrimaryKey.symbol]() {
    return this.key
  }
}

/**
 * The `amends/DeliveryJob` entity: one bound thread's deliveries, addressed by `entityId`. Its
 * `Deliver` requests are persisted, so they survive the runner.
 *
 * @category services
 * @since 0.1.0
 */
export const entity = Entity.make("amends/DeliveryJob", [
  Rpc.make("Deliver", { payload: Deliver }).annotate(ClusterSchema.Persisted, true)
])

/**
 * The ID of `job`'s entity: its workspace and thread as a JSON array, which the worker reads back
 * into the job.
 *
 * @category utils
 * @since 0.1.0
 */
export const entityId = (job: DeliveryJobs.Job) => encodeEntityId([job.workspaceId, job.threadId])

/** An entity's ID, written and read back by the one codec. */
const EntityId = Schema.fromJsonString(Schema.Tuple([WorkspaceId.WorkspaceId, ThreadId.ThreadId]))
const encodeEntityId = Schema.encodeSync(EntityId)
const decodeEntityId = Schema.decodeUnknownSync(EntityId)

/** The job an entity is. */
const jobOf = (entityId: string): DeliveryJobs.Job => {
  const [workspaceId, threadId] = decodeEntityId(entityId)
  return { workspaceId, threadId }
}

/**
 * Provides core's `DeliveryJobs.DeliveryJobs`, whose requests Cluster stores, each keyed by the
 * commit that asks for it: in the commit's transaction when Cluster's message storage shares the
 * workspace storage's SQL client, and read at once through `JobRequests.Wakeup`, as `TurnJob`'s
 * are.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerRequests = Layer.effect(
  DeliveryJobs.DeliveryJobs,
  Effect.gen(function* () {
    const wakeup = yield* JobRequests.Wakeup
    const deliveryJobClient = yield* entity.client
    return DeliveryJobs.DeliveryJobs.of({
      requestDeliver: Effect.fnUntraced(function* ({ workspaceId, threadId }) {
        const storeTransaction = yield* Store.Transaction
        const deliver = new Deliver({
          workspaceId,
          threadId,
          key: `deliver:${storeTransaction.id}`
        })
        yield* deliveryJobClient(entityId(deliver))
          .Deliver(deliver, { discard: true })
          .pipe(Effect.mapError(StoreError.failed("Store", "request delivery job")))
        yield* wakeup.afterCommit
      })
    })
  })
)

/**
 * Handle each request when it arrives, through the job's delivery runner, one at a time. A request
 * that fails is tried again until it holds or has failed `JobRequests.maxFailures` times; then the
 * delivery its runs could not post is given up, which fails it and is tried until it holds, so a
 * delivery never stays requested with nothing to post it, and the request is dropped otherwise.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerWorker = entity.toLayer(
  Effect.gen(function* () {
    const job = jobOf((yield* Entity.CurrentAddress).entityId)
    const { workspaceId, threadId } = job
    const deliveryRunner = yield* DeliveryRunner.make(job)
    /** What a log says of `request`: its job and key. */
    const named = (request: Deliver) => ({ workspaceId, threadId, request: request.key })
    const deliver = Effect.fnUntraced(function* (request: Deliver) {
      yield* JobRequests.retrying(
        "Delivery job",
        named(request),
        deliveryRunner.deliver,
        JobRequests.maxFailures - 1
      ).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (error) {
            const deliveryId = error instanceof DeliveryRunner.RunFailed ? error.deliveryId : undefined
            if (deliveryId === undefined || JobRequests.isWorkspaceNotFound(error))
              return yield* JobRequests.drop("Delivery job", named(request), error)
            yield* JobRequests.retrying(
              "Delivery job",
              named(request),
              deliveryRunner.giveUp(deliveryId, "Its delivery job could not reach the channel.")
            ).pipe(Effect.catch((error) => JobRequests.drop("Delivery job", named(request), error)))
          })
        )
      )
    })
    return entity.of({ Deliver: ({ payload }) => deliver(payload) })
  }),
  { concurrency: 1, maxIdleTime: "1 minute" }
)

/**
 * Both `layerRequests` and `layerWorker`, over the host's Cluster: the requests commits store, and
 * the worker that handles them.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.merge(layerWorker, layerRequests)
