/**
 * Keeps the notification read model, `NotificationStore`, from the journal: it generates the
 * notifications each recorded thread activity selected recipients for, and settles them as
 * participations end, members leave groups, turns accept agents' notifications, deliveries accept
 * contacts', and people see theirs or read the threads they came from.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as DeliveryFacts from "../channel/DeliveryFacts.ts"
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts"
import * as Projection from "../journal/Projection.ts"
import * as ReadStateFacts from "../read-state/ReadStateFacts.ts"
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts"
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts"
import * as ThreadParticipationActivity from "../thread/ThreadParticipationActivity.ts"
import * as TurnFacts from "../turn/TurnFacts.ts"
import * as Notification from "./Notification.ts"
import * as NotificationFacts from "./NotificationFacts.ts"
import * as NotificationStore from "./NotificationStore.ts"

/**
 * Activity generates notifications, and an unfollow's ending settles an agent's pending input
 * from that participation; leaving a group settles what a member had pending from it. Everything
 * comes from the recorded facts and this read model's own notifications, so it rebuilds without
 * reading other read models: recipients were selected when the activity was recorded. A turn
 * accepting an agent's notifications settles them as accepted into it, and a delivery a contact's.
 * A person seeing a notification, or reading its thread through it, settles it as seen then.
 *
 * @category projections
 * @since 0.1.0
 */
export const definition = Projection.make("notifications", { version: 5 })
  .on(
    ThreadActivityFacts.Recorded,
    Effect.fn("NotificationProjection.activity")(function* (event) {
      const notificationStore = yield* NotificationStore.NotificationStore
      const { activity, recipients } = event.payload
      // Settlement is driven by the activity itself, even when no new recipients are selected. The
      // store settles only an agent's notifications, which it recognizes by their recipient.
      if (ThreadActivityKind.is(ThreadParticipationActivity.Ended)(activity)) {
        const ended = yield* ThreadActivityKind.decode(ThreadParticipationActivity.Ended, activity)
        yield* notificationStore.discardPendingForParticipation(ended.details.participationId)
      }
      yield* notificationStore.insertMany(
        recipients.map((recipient) =>
          Notification.fromActivity(event, Object.assign({ groupId: event.payload.groupId }, activity), recipient)
        )
      )
    })
  )
  // Someone who leaves a group, or is removed from it or the workspace, can no longer open its
  // threads, and takes part in none of them, so what they had pending from it stops waiting for
  // them. Journals from before recorded each participation's ending after this as well, which
  // then finds nothing left pending.
  .on(
    GroupMembershipFacts.Removed,
    Effect.fn("NotificationProjection.departure")(function* (event) {
      const notificationStore = yield* NotificationStore.NotificationStore
      const { memberId, groupId } = event.payload
      yield* notificationStore.discardPendingForGroup(memberId, groupId)
    })
  )
  .on(
    TurnFacts.Created,
    Effect.fn("NotificationProjection.turnCreated")(function* ({ payload }) {
      // A turn's acceptance settles the notifications it took, in the same commit.
      const notificationStore = yield* NotificationStore.NotificationStore
      yield* notificationStore.accept(
        payload.notificationIds,
        Notification.AcceptedBy.cases.Turn.make({ turnId: payload.id }),
        payload.createdAt
      )
    })
  )
  .on(
    NotificationFacts.Seen,
    Effect.fn("NotificationProjection.seen")(function* ({ payload, provenance }) {
      const notificationStore = yield* NotificationStore.NotificationStore
      yield* notificationStore.markSeen([payload.notificationId], provenance.occurredAt)
    })
  )
  .on(
    ReadStateFacts.ThreadRead,
    Effect.fn("NotificationProjection.threadRead")(function* ({ payload, provenance }) {
      // Reading a thread through a position settles what the person had pending from it up to there.
      const notificationStore = yield* NotificationStore.NotificationStore
      yield* notificationStore.markSeenInThread(payload, provenance.occurredAt)
    })
  )
  .on(
    DeliveryFacts.Created,
    Effect.fn("NotificationProjection.deliveryCreated")(function* ({ payload }) {
      // A delivery's acceptance settles the contact notifications it carries, in the same commit.
      const notificationStore = yield* NotificationStore.NotificationStore
      yield* notificationStore.accept(
        payload.notificationIds,
        Notification.AcceptedBy.cases.Delivery.make({ deliveryId: payload.id }),
        payload.requestedAt
      )
    })
  )
