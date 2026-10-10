/**
 * The delivery runner carries one bound thread's messages to the external conversation it came
 * from, for its delivery job: it accepts what the thread's contacts were told into deliveries
 * through the workspace, and for each, in order, readies it, posts it through the channel's
 * transport, built from the connection's integration with its key, and records how the post went.
 * A system that cannot be reached now fails the run, for the job to try again; one that refuses
 * the message, or the connection, fails the delivery there and then.
 */
import { Integrations } from "@amends/connection";
import type { Delivery, DeliveryJobs } from "@amends/core/channel";
import { DeliveryExecution } from "@amends/core/channel";
import { Gateway } from "@amends/gateway";
import { Data, Effect, Predicate, Ref, Result } from "effect";

/** A run of the job failed before it had posted every delivery; `deliveryId` names the one it was on. */
export class RunFailed extends Data.TaggedError("DeliveryRunner.RunFailed")<{
  readonly deliveryId: Delivery.Id | undefined;
  readonly cause: unknown;
}> {}

/** Why a post failed, as the delivery records it. */
const describe = (error: unknown): string =>
  Predicate.hasProperty(error, "message") &&
  typeof error.message === "string" &&
  error.message !== ""
    ? error.message
    : "The channel's system refused the message.";

/** Whether a post may succeed if tried again: its system could not be reached. */
const isRetryable = (error: unknown) =>
  Predicate.isTagged(error, "TransportError") &&
  Predicate.hasProperty(error, "isRetryable") &&
  error.isRetryable === true;

/** @category constructors */
export const make = Effect.fnUntraced(function* (job: DeliveryJobs.Job) {
  const gateway = yield* Gateway.Service;
  const integrations = yield* Integrations.Integrations;
  /** How many times this runner tried to post each delivery it has not finished with. */
  const tries = yield* Ref.make(new Map<Delivery.Id, number>());
  /** Ask `call` of the workspace's delivery execution, holding the workspace only while it runs. */
  const deliveryExecution = <A, E>(
    call: (deliveryExecution: DeliveryExecution.Interface) => Effect.Effect<A, E>,
  ) =>
    Effect.scoped(
      gateway.inWorkspace(job.workspaceId, Effect.flatMap(DeliveryExecution.Service, call)),
    );

  /** Post what `ready` says through the channel's transport. */
  const post = (ready: Extract<DeliveryExecution.Start, { readonly _tag: "Ready" }>) =>
    Effect.gen(function* () {
      const integration = yield* integrations.find(ready.access.connection.integration);
      const transport = yield* integration.channelTransport(
        ready.access.connection,
        ready.access.credential ?? undefined,
      );
      return yield* transport.post(ready.conversation, ready.outgoing);
    });

  /** Ready, post, and record one delivery; a retryable failure to post fails the run. */
  const deliverOne = Effect.fnUntraced(function* (delivery: Delivery.Record) {
    const start = yield* deliveryExecution((deliveryExecution) =>
      deliveryExecution.start(delivery.id),
    );
    if (DeliveryExecution.Start.isAnyOf(["Idle"])(start)) return;
    const attempts = yield* Ref.modify(tries, (counts) => {
      const attempts = (counts.get(delivery.id) ?? 0) + 1;
      return [attempts, new Map(counts).set(delivery.id, attempts)] as const;
    });
    const posted = yield* Effect.result(post(start));
    if (Result.isSuccess(posted)) {
      yield* deliveryExecution((deliveryExecution) =>
        deliveryExecution.recordSent(delivery.id, {
          externalMessageId: posted.success.messageId,
          attempts,
        }),
      );
    } else if (isRetryable(posted.failure)) {
      return yield* new RunFailed({ deliveryId: delivery.id, cause: posted.failure });
    } else {
      yield* deliveryExecution((deliveryExecution) =>
        deliveryExecution.recordFailed(delivery.id, {
          reason: describe(posted.failure),
          attempts,
        }),
      );
    }
    yield* Ref.update(tries, (counts) => {
      const remaining = new Map(counts);
      remaining.delete(delivery.id);
      return remaining;
    });
  });

  return {
    /**
     * Deliver what the thread's contacts were told: accept it into deliveries, then post each
     * still requested, in the order of their messages.
     */
    deliver: Effect.gen(function* () {
      const deliveries = yield* deliveryExecution((deliveryExecution) =>
        deliveryExecution.accept(job.threadId),
      ).pipe(Effect.mapError((cause) => new RunFailed({ deliveryId: undefined, cause })));
      for (const delivery of deliveries)
        yield* deliverOne(delivery).pipe(
          Effect.catchIf(
            (error) => !(error instanceof RunFailed),
            (cause) => new RunFailed({ deliveryId: delivery.id, cause }),
          ),
        );
    }),
    /** Fail the delivery the job could not post, after as many tries as this runner made. */
    giveUp: (deliveryId: Delivery.Id, reason: string) =>
      Effect.gen(function* () {
        const attempts = (yield* Ref.get(tries)).get(deliveryId) ?? 0;
        yield* deliveryExecution((deliveryExecution) =>
          deliveryExecution.recordFailed(deliveryId, { reason, attempts }),
        );
        yield* Ref.update(tries, (counts) => {
          const remaining = new Map(counts);
          remaining.delete(deliveryId);
          return remaining;
        });
      }),
  };
});

export type DeliveryRunner = Effect.Success<ReturnType<typeof make>>;

export * as DeliveryRunner from "./runner.ts";
