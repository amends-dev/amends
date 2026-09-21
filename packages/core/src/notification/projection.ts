import { DateTime, Effect, Option, Schema } from "effect";
import { Projection } from "../journal/projection.ts";
import { Identity } from "../identity/identity.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";
const sameIdentity = Schema.toEquivalence(Identity.MemberReference);
/** Activity is the sole input for notification lifecycle changes and generation. Replay preserves recorded recipients. */
export const definition = Projection.make("notifications", { version: 1 }).on(
  ThreadActivityFacts.Recorded,
  Effect.fn("NotificationProjection.activity")(function* (event) {
    const notifications = yield* NotificationStore.Service;
    const participations = yield* ThreadParticipationStore.Service;
    const { activity, recipients } = event.payload;
    if (
      [notifications.workspaceId, participations.workspaceId].some(
        (id) => id !== activity.workspaceId,
      )
    )
      return yield* new NotificationStore.Conflict({
        operation: "project",
        message: "Activity belongs to another workspace",
      });
    // Settlement is driven by the activity itself, even when no new recipients are selected.
    if (activity.kind === "ParticipationEnded") {
      const found = yield* participations.get(activity.participationId);
      if (Option.isNone(found))
        return yield* new NotificationStore.Conflict({
          operation: "project",
          message: "Ending activity participation is missing",
        });
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        found.value,
      );
      if (
        participant.id !== activity.participationId ||
        participant.workspaceId !== activity.workspaceId ||
        participant.threadId !== activity.threadId ||
        participant.joinedAtSequence >= activity.sequence ||
        participant.status !== "ended" ||
        participant.endedAt === null ||
        DateTime.formatIso(participant.endedAt) !== DateTime.formatIso(activity.occurredAt)
      )
        return yield* new NotificationStore.Conflict({
          operation: "project",
          message: "Ending activity participation is inconsistent",
        });
      if (participant.identity._tag === "Agent")
        yield* notifications.discardPendingForParticipation(participant.id);
    }
    for (const recipient of recipients) {
      const found = yield* participations.get(recipient.participationId);
      if (Option.isNone(found))
        return yield* new NotificationStore.Conflict({
          operation: "project",
          message: "Recipient participation is missing",
        });
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        found.value,
      );
      if (
        participant.id !== recipient.participationId ||
        participant.workspaceId !== activity.workspaceId ||
        participant.threadId !== activity.threadId ||
        participant.joinedAtSequence > activity.sequence ||
        !sameIdentity(participant.identity, recipient.identity)
      )
        return yield* new NotificationStore.Conflict({
          operation: "project",
          message: "Recipient participation is inconsistent",
        });
      yield* notifications.insert({
        id: Notification.Id.make(JSON.stringify([event.logId, event.id, participant.id])),
        workspaceId: activity.workspaceId,
        source: { logId: event.logId, entryId: event.id },
        participationId: participant.id,
        recipient: recipient.identity,
        recordedAt: event.recordedAt,
        state: { _tag: "Pending" },
      });
    }
  }),
);
export * as NotificationProjection from "./projection.ts";
