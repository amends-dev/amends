import { Effect } from "effect";
import { Projection } from "../journal/projection.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";
/**
 * Activity generates notifications and settles departure; human Seen is private state, outside the
 * journal. Everything comes from the recorded activity and this read model's own notifications, so
 * it rebuilds without reading other read models: recipients were selected when the activity was
 * recorded.
 */
export const definition = Projection.make("notifications", { version: 1 }).on(
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
    if (activity.kind === "ParticipationEnded")
      yield* notifications.discardPendingForParticipation(activity.participationId);
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
);
export * as NotificationProjection from "./projection.ts";
