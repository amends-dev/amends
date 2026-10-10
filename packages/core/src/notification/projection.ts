import { Effect } from "effect";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import { Projection } from "../journal/projection.ts";
import { ThreadActivityFacts } from "../thread/ThreadActivityFacts.ts";
import { ThreadActivityKind } from "../thread/ThreadActivityKind.ts";
import { ThreadParticipationActivity } from "../thread/ThreadParticipationActivity.ts";
import { TurnFacts } from "../turn/facts.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";
/**
 * Activity generates notifications, and an unfollow's ending settles an agent's pending input
 * from that participation; leaving a group settles what a member had pending from it; human Seen
 * is private state, outside the journal. Everything comes from the
 * recorded facts and this read model's own notifications, so it rebuilds without reading other
 * read models: recipients were selected when the activity was recorded. A turn accepting an
 * agent's notifications settles them as accepted into it.
 */
export const definition = Projection.make("notifications", { version: 3 })
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("NotificationProjection.activity")(function* (event) {
      const notificationStore = yield* NotificationStore.Service;
      const { activity, recipients } = event.payload;
      // Settlement is driven by the activity itself, even when no new recipients are selected. The
      // store settles only an agent's notifications, which it recognizes by their recipient.
      if (ThreadActivityKind.is(ThreadParticipationActivity.Ended)(activity)) {
        const ended = yield* ThreadActivityKind.decode(ThreadParticipationActivity.Ended, activity);
        yield* notificationStore.discardPendingForParticipation(ended.details.participationId);
      }
      yield* notificationStore.insertMany(
        recipients.map((recipient) =>
          Notification.fromActivity(
            event,
            Object.assign({ groupId: event.payload.groupId }, activity),
            recipient,
          ),
        ),
      );
    }),
  )
  // Someone who leaves a group, or is removed from it or the workspace, can no longer open its
  // threads, and takes part in none of them, so what they had pending from it stops waiting for
  // them. Journals from before recorded each participation's ending after this as well, which
  // then finds nothing left pending.
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("NotificationProjection.departure")(function* (event) {
      const notificationStore = yield* NotificationStore.Service;
      const { memberId, groupId } = event.payload;
      yield* notificationStore.discardPendingForGroup(memberId, groupId);
    }),
  )
  .on(
    TurnFacts.Created,
    Effect.fn("NotificationProjection.turnCreated")(function* ({ payload }) {
      // A turn's acceptance settles the notifications it took, in the same commit.
      const notificationStore = yield* NotificationStore.Service;
      yield* notificationStore.accept(payload.notificationIds, payload.id, payload.createdAt);
    }),
  );
export * as NotificationProjection from "./projection.ts";
