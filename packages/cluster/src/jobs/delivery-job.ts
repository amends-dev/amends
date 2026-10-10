/**
 * Delivery jobs on Effect Cluster: one for each bound thread, an entity whose persisted requests
 * ask it to deliver what the thread's contacts were told. A commit stores a request with itself,
 * and the runner that owns the entity handles it when it arrives, one request at a time, so a
 * thread's messages reach its conversation in order. Cluster keeps an entity on one runner at a
 * time and redelivers a request whose handling was cut short. A request that fails is tried again
 * where it is, as `JobRequests` says; then the delivery the job could not post is given up.
 */
import { DeliveryJobs } from "@amends/core/channel";
import { Store } from "@amends/core/journal";
import { ThreadId } from "@amends/core/thread";
import { Workspace } from "@amends/core/workspace";
import { Effect, Layer, PrimaryKey, Schema } from "effect";
import { ClusterSchema, Entity, Sharding } from "effect/cluster";
import { Rpc } from "effect/rpc";
import { DeliveryRunner } from "../deliveries/runner.ts";
import { JobRequests } from "./requests.ts";

/** A request to deliver what the thread's contacts were told; Cluster keeps one per key. */
export class Deliver extends Schema.Class<Deliver>("amends/DeliveryJob/Deliver")({
  ...DeliveryJobs.Job.fields,
  key: Schema.String,
}) {
  [PrimaryKey.symbol]() {
    return this.key;
  }
}

/** One bound thread's deliveries; its requests survive the runner. */
export const entity = Entity.make("amends/DeliveryJob", [
  Rpc.make("Deliver", { payload: Deliver }).annotate(ClusterSchema.Persisted, true),
]);

/** The entity of a job. */
export const entityId = (job: DeliveryJobs.Job) => JSON.stringify([job.workspaceId, job.threadId]);

const decodeEntityId = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Tuple([Workspace.Id, ThreadId.Id])),
);
/** The job an entity is. */
const jobOf = (entityId: string): DeliveryJobs.Job => {
  const [workspaceId, threadId] = decodeEntityId(entityId);
  return { workspaceId, threadId };
};

/**
 * Requests stored by Cluster, in the commit's transaction when Cluster's message storage shares
 * the workspace storage's SQL client, and read again once the commit is done, as `TurnJob`'s are.
 *
 * @category layers
 */
export const layerRequests = Layer.effect(
  DeliveryJobs.Service,
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding;
    const deliveryJobClient = yield* entity.client;
    return DeliveryJobs.Service.of({
      requestDeliver: Effect.fnUntraced(function* ({ workspaceId, threadId }) {
        const storeTransaction = yield* Store.Transaction;
        const deliver = new Deliver({
          workspaceId,
          threadId,
          key: `deliver:${storeTransaction.id}`,
        });
        yield* deliveryJobClient(entityId(deliver))
          .Deliver(deliver, { discard: true })
          .pipe(
            Effect.mapError(
              (cause) => new Store.Failure({ operation: "request delivery job", cause }),
            ),
          );
        yield* storeTransaction.afterCommit(sharding.pollStorage);
      }),
    });
  }),
);

/**
 * Handle each request when it arrives, through the job's delivery runner, one at a time. A request
 * that fails is tried again until it holds or has failed `JobRequests.maxFailures` times; then the
 * delivery its runs could not post is given up, which fails it and is tried until it holds, so a
 * delivery never stays requested with nothing to post it, and the request is dropped otherwise.
 *
 * @category layers
 */
export const layerWorker = entity.toLayer(
  Effect.gen(function* () {
    const job = jobOf((yield* Entity.CurrentAddress).entityId);
    const { workspaceId, threadId } = job;
    const deliveryRunner = yield* DeliveryRunner.make(job);
    /** What a log says of `request`: its job and key. */
    const named = (request: Deliver) => ({ workspaceId, threadId, request: request.key });
    const deliver = Effect.fnUntraced(function* (request: Deliver) {
      yield* JobRequests.retrying(
        "Delivery job",
        named(request),
        deliveryRunner.deliver,
        JobRequests.maxFailures - 1,
      ).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (error) {
            const deliveryId =
              error instanceof DeliveryRunner.RunFailed ? error.deliveryId : undefined;
            if (deliveryId === undefined || JobRequests.isWorkspaceNotFound(error))
              return yield* JobRequests.drop("Delivery job", named(request), error);
            yield* JobRequests.retrying(
              "Delivery job",
              named(request),
              deliveryRunner.giveUp(deliveryId, "Its delivery job could not reach the channel."),
            ).pipe(
              Effect.catch((error) => JobRequests.drop("Delivery job", named(request), error)),
            );
          }),
        ),
      );
    });
    return entity.of({ Deliver: ({ payload }) => deliver(payload) });
  }),
  { concurrency: 1, maxIdleTime: "1 minute" },
);

/** Stored requests and the worker that handles them, over the host's Cluster. @category layers */
export const layer = Layer.merge(layerWorker, layerRequests);

export * as DeliveryJob from "./delivery-job.ts";
