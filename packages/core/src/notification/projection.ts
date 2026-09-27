import { Effect } from "effect";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import { Projection } from "../journal/projection.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { ThreadActivityKind } from "../thread/activity/kind.ts";
import { ThreadParticipationActivity } from "../thread/participation/activity.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";
/**
 * Activity generates notifications and settles departure; leaving a group settles what a person
 * had pending from it; human Seen is private state, outside the journal. Everything comes from the
 * recorded facts and this read model's own notifications, so it rebuilds without reading other
 * read models: recipients were selected when the activity was recorded.
 */
export const definition = Projection.make("notifications", { version: 2 })
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("NotificationProjection.activity")(function* (event) {
      const notifications = yield* NotificationStore.Service;
      const { activity, recipients } = event.payload;
      if (notifications.workspaceId !== activity.workspaceId)
        return yield* new NotificationStore.Conflict({
          operation: "project",
          message: "Activity belongs to another workspace",
        });
      // Settlement is driven by the activity itself, even when no new recipients are selected. The
      // store settles only an agent's notifications, which it recognizes by their recipient.
      if (ThreadActivityKind.is(ThreadParticipationActivity.Ended)(activity)) {
        const ended = yield* ThreadActivityKind.decode(ThreadParticipationActivity.Ended, activity);
        yield* notifications.discardPendingForParticipation(ended.details.participationId);
      }
      yield* notifications.insertMany(
        recipients.map((recipient) =>
          Notification.generated(
            event,
            Object.assign({ groupId: event.payload.groupId }, activity),
            recipient,
          ),
        ),
      );
    }),
  )
  // Someone who leaves a group, or is removed from it or the workspace, can no longer open its
  // threads, so what they had pending from it stops waiting for them.
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("NotificationProjection.departure")(function* (event) {
      const notifications = yield* NotificationStore.Service;
      const { workspaceId, memberId, groupId } = event.payload;
      if (notifications.workspaceId !== workspaceId)
        return yield* new NotificationStore.Conflict({
          operation: "project",
          message: "Departure belongs to another workspace",
        });
      yield* notifications.discardPendingForGroup(memberId, groupId);
    }),
  );
export * as NotificationProjection from "./projection.ts";
