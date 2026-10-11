/**
 * Delivery jobs: one for each bound thread, which carries the thread's messages to the external
 * conversation it came from, as `TurnJobs` run agents' turns. Activity that tells a contact
 * something requests the job in the commit that records it; the job accepts the contacts' pending
 * notifications into deliveries and posts them through `DeliveryExecution`. Hosts supply the
 * service and deliver each request to whatever runs delivery jobs; a host that runs none accepts
 * requests and runs nothing, so what contacts were told waits.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Schema } from "effect";
import type * as Event from "../journal/Event.ts";
import type * as Reaction from "../journal/Reaction.ts";
import type * as Store from "../journal/Store.ts";
import * as Notification from "../notification/Notification.ts";
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * A delivery job: the deliveries of one bound thread.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Job = Schema.Struct({ workspaceId: WorkspaceId.Id, threadId: ThreadId.Id });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Job extends Schema.Schema.Type<typeof Job> {}

/**
 * The delivery jobs, a host service shared by every workspace.
 *
 * @effect-expect-leaking Transaction
 *
 * The delivery jobs a host runs.
 *
 * @category services
 * @since 0.1.0
 */
export class DeliveryJobs extends Context.Service<
  DeliveryJobs,
  {
    /**
     * Request, as part of the caller's commit, that the job deliver what the thread's contacts were
     * told: the request is stored with the commit and discarded if it rolls back. Asking again before
     * it runs asks once.
     */
    readonly requestDeliver: (job: Job) => Effect.Effect<void, Store.Failure, Store.Transaction>;
  }
>()("@amends-dev/core/channel/DeliveryJobs") {}

/**
 * For a host that runs no delivery jobs: requests are accepted and nothing runs.
 *
 * @category constructors
 * @since 0.1.0
 */
export const noRunner: DeliveryJobs["Service"] = DeliveryJobs.of({
  requestDeliver: () => Effect.void,
});

/**
 * @category layers
 * @since 0.1.0
 */
export const layerNoRunner = Layer.succeed(DeliveryJobs, noRunner);

const decodeRecorded = Schema.decodeUnknownSync(
  Schema.Struct({
    activity: Schema.Struct({
      threadId: ThreadActivityFacts.Recorded.payload.fields.activity.fields.threadId,
    }),
    recipients: ThreadActivityFacts.Recorded.payload.fields.recipients,
  }),
);

/** Activity that tells a contact something has the thread's job deliver it. */
const deliverToContacts = Effect.fnUntraced(function* (event: Event.Record) {
  const { activity, recipients } = decodeRecorded(event.payload);
  if (!recipients.some(({ recipient }) => Notification.Recipient.isAnyOf(["Contact"])(recipient)))
    return;
  yield* (yield* DeliveryJobs).requestDeliver({
    workspaceId: event.provenance.workspaceId,
    threadId: activity.threadId,
  });
});

/**
 * The facts that give a contact something to deliver request the thread's job, in the commit that
 * publishes them.
 *
 * @category constructors
 * @since 0.1.0
 */
export const reactions: ReadonlyArray<Reaction.Definition<DeliveryJobs>> = [
  { fact: ThreadActivityFacts.Recorded.name, react: deliverToContacts },
];
