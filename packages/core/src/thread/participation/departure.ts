import { Context, Effect, Layer } from "effect";
import type { DateTime } from "effect";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";
import type { Thread } from "../thread.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { ThreadActivityPublisher } from "../activity/publisher.ts";
import { ThreadParticipationActivity } from "./activity.ts";
import { ThreadParticipation } from "./participation.ts";
import { ThreadParticipationFacts } from "./facts.ts";

export type Error = ThreadActivityPublisher.Error | Log.WriteError | Projection.Error;
export interface Interface {
  readonly workspaceId: ThreadParticipation.Record["workspaceId"];
  /**
   * End one active participation because its member unfollowed the thread, with a quiet ending
   * in its timeline. Leaving or being removed from the group ends participations with the
   * departure instead, all together and without thread activity.
   */
  readonly end: (
    participant: ThreadParticipation.Record,
    thread: Thread.Record,
    occurredAt: DateTime.Utc,
  ) => Effect.Effect<void, Error, Store.Transaction | Publication.Service>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/participation/departure/Service",
) {}
export const make = Effect.fn("ThreadParticipationDeparture.make")(function* () {
  const publisher = yield* ThreadActivityPublisher.Service;
  const journal = yield* Journal.Service;
  const workspaceId = publisher.workspaceId;
  const end = Effect.fn("ThreadParticipationDeparture.end")(function* (
    participant: ThreadParticipation.Record,
    thread: Thread.Record,
    occurredAt: DateTime.Utc,
  ) {
    const reason: ThreadParticipation.EndReason = "unfollowed";
    yield* Store.Transaction;
    yield* publisher.publish({
      thread,
      occurredAt,
      step: () =>
        Effect.map(
          journal
            .publish(ThreadParticipationFacts.Ended, {
              workspaceId,
              threadId: thread.id,
              participationId: participant.id,
              groupId: thread.groupId,
              reason,
            })
            .pipe(Publication.withOccurredAt(occurredAt)),
          (ended) => ({
            value: undefined,
            kind: ThreadParticipationActivity.Ended,
            details: { participationId: participant.id, reason },
            recipients: [],
            cause: ended,
          }),
        ),
    });
  });
  return Service.of({ workspaceId, end });
});
export const layer = Layer.effect(Service, make());
export * as ThreadParticipationDeparture from "./departure.ts";
