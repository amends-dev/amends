/**
 * What a delivery job asks of the workspace: commands and queries over data, which a job could call
 * from elsewhere. It accepts what a bound thread's contacts were told into deliveries, one for each
 * message, settling their notifications; readies each delivery with what to post and how to reach
 * the channel's system; and records how the post went. The job posts; nothing here reaches the
 * external system. Each change is its own commit, attributed to delivery itself. The job is
 * trusted: no actor's permissions are checked.
 *
 * @since 0.1.0
 */

import { ChannelTransport } from "@amends-dev/channel"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Connection from "../connection/Connection.ts"
import type * as CoreError from "../error/CoreError.ts"
import * as Performer from "../identity/Performer.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Store from "../journal/Store.ts"
import * as Notification from "../notification/Notification.ts"
import * as NotificationStore from "../notification/NotificationStore.ts"
import * as Operation from "../operation/Operation.ts"
import * as Request from "../request/Request.ts"
import type * as Thread from "../thread/Thread.ts"
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts"
import * as ThreadActivityStore from "../thread/ThreadActivityStore.ts"
import type * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadMessage from "../thread/ThreadMessage.ts"
import * as ThreadMessageActivity from "../thread/ThreadMessageActivity.ts"
import type * as ThreadMessageId from "../thread/ThreadMessageId.ts"
import * as ThreadMessageStore from "../thread/ThreadMessageStore.ts"
import * as ThreadParticipation from "../thread/ThreadParticipation.ts"
import * as ThreadQuery from "../thread/ThreadQuery.ts"
import * as ThreadStore from "../thread/ThreadStore.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import type * as Channel from "./Channel.ts"
import type * as ChannelBinding from "./ChannelBinding.ts"
import * as ChannelBindingStore from "./ChannelBindingStore.ts"
import * as ChannelQuery from "./ChannelQuery.ts"
import * as ChannelStore from "./ChannelStore.ts"
import * as Delivery from "./Delivery.ts"
import * as DeliveryFacts from "./DeliveryFacts.ts"
import * as DeliveryId from "./DeliveryId.ts"
import * as DeliveryStore from "./DeliveryStore.ts"

/**
 * What a delivery's job posts: nothing, since the delivery is no longer requested or was failed as
 * it stood; or the message, ready to post in the conversation through the channel's connection.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Start = Schema.TaggedUnion({
  Idle: {},
  Ready: {
    delivery: Delivery.Delivery,
    /** The external conversation the thread is bound to, as the transport needs it. */
    conversation: ChannelTransport.Conversation,
    /** The message's text, and what its author is called. */
    outgoing: ChannelTransport.Outgoing,
    /** The channel's connection as its integration takes it, with its key. */
    access: Connection.Access
  }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Start = typeof Start.Type

/**
 * What a post the job made says: the id the external system gave the message, after how many tries.
 *
 * @category options
 * @since 0.1.0
 */
export interface SentInput {
  readonly externalMessageId: ChannelTransport.ExternalId
  readonly attempts: number
}

/**
 * Why the job gave a delivery up, after how many tries.
 *
 * @category options
 * @since 0.1.0
 */
export interface FailedInput {
  readonly reason: string
  readonly attempts: number
}

/**
 * What accepting can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type AcceptError = CoreError.Invalid | CoreError.Unavailable | CoreError.Uncertain

/**
 * What readying a delivery can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type StartError = CoreError.Invalid | CoreError.Unavailable | CoreError.Uncertain

/**
 * What recording a delivery's end can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type RecordError = CoreError.Invalid | CoreError.Unavailable | CoreError.Uncertain

/**
 * What the job asks of the workspace, one of `Core.JobServices`.
 *
 * What the job asks.
 *
 * @category services
 * @since 0.1.0
 */
export class DeliveryExecution extends Context.Service<
  DeliveryExecution,
  {
    /**
     * Accept what the thread's contacts were told and have not been delivered into deliveries, one
     * for each message, settling their notifications, in one commit; then the thread's deliveries
     * still requested, in the order of their messages. A thread bound to no conversation has none.
     */
    readonly accept: (threadId: ThreadId.ThreadId) => Effect.Effect<ReadonlyArray<Delivery.Delivery>, AcceptError>
    /**
     * Ready the delivery: `Ready` with what to post and how to reach the system, or `Idle` for a
     * delivery no longer requested, or one failed here and now because its message was deleted
     * before it was sent, its channel was removed, or the channel's system cannot be reached as the
     * channel stands.
     */
    readonly start: (deliveryId: DeliveryId.DeliveryId) => Effect.Effect<Start, StartError>
    /** Record that the message was posted; a delivery no longer requested is left as it is. */
    readonly recordSent: (deliveryId: DeliveryId.DeliveryId, sent: SentInput) => Effect.Effect<void, RecordError>
    /** Record that the job gave the delivery up; one no longer requested is left as it is. */
    readonly recordFailed: (deliveryId: DeliveryId.DeliveryId, failed: FailedInput) => Effect.Effect<void, RecordError>
  }
>()("@amends-dev/core/channel/DeliveryExecution") {}

/** How many activities one read takes; reads go on until the range is done. */
const pageSize = 100

/** Delivery acts as itself: no member performs it. */
const performer = Performer.Reference.cases.System.make({
  id: Performer.SystemId.make("channel-delivery")
})

/**
 * Capture the stores, the shared reads, and the journal.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const channelStore = yield* ChannelStore.ChannelStore
  const channelBindingStore = yield* ChannelBindingStore.ChannelBindingStore
  const deliveryStore = yield* DeliveryStore.DeliveryStore
  const notificationStore = yield* NotificationStore.NotificationStore
  const threadStore = yield* ThreadStore.ThreadStore
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore
  const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore
  const memberStore = yield* MemberStore.MemberStore
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const channelQuery = yield* ChannelQuery.ChannelQuery
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const { workspaceId } = yield* Store.Store

  /** Run `step` in its own commit, as delivery itself. */
  const asDelivery = <A, E, R>(step: Effect.Effect<A, E, R>) =>
    Effect.flatMap(Publication.make(workspaceId, performer), (provenance) =>
      step.pipe(Effect.provideService(Publication.Publication, provenance))
    ).pipe(Effect.provideService(Crypto.Crypto, crypto), journal.commit)

  /** The messages published at these positions of the thread, by position. */
  const readPublished = Effect.fnUntraced(function* (threadId: ThreadId.ThreadId, sequences: ReadonlyArray<number>) {
    const published = new Map<number, ThreadMessageId.ThreadMessageId>()
    if (sequences.length === 0) return published
    const through = Math.max(...sequences)
    let after = Math.min(...sequences) - 1
    for (;;) {
      const page = yield* threadActivityStore.readPage(threadId, {
        afterSequence: after,
        beforeSequence: through + 1,
        from: "oldest",
        limit: pageSize
      })
      for (const activity of page)
        if (ThreadActivityKind.is(ThreadMessageActivity.Published)(activity)) {
          const message = yield* Effect.orDie(ThreadActivityKind.decode(ThreadMessageActivity.Published, activity))
          published.set(activity.sequence, message.details.messageId)
        }
      const last = page.at(-1)
      if (last === undefined || page.length < pageSize || last.sequence >= through) break
      after = last.sequence
    }
    return published
  })

  /**
   * Accept the thread's pending contact notifications into deliveries, one for each message they
   * point to, in the caller's commit. A message delivered already is accepted again into nothing.
   */
  const acceptPending = Effect.fnUntraced(function* (
    thread: Thread.Thread,
    binding: ChannelBinding.ChannelBinding,
    channel: Channel.Channel
  ) {
    const participants = yield* threadQuery.currentParticipants(thread)
    const pending: Array<{ readonly id: Notification.NotificationId; readonly sequence: number }> = []
    for (const { participant } of participants) {
      if (!ThreadParticipation.Participant.isAnyOf(["Contact"])(participant)) continue
      const records = yield* notificationStore.listPendingByThread(
        Notification.Recipient.cases.Contact.make({ id: participant.contactId }),
        thread.id,
        Number.MAX_SAFE_INTEGER
      )
      for (const record of records)
        if (record.thread !== undefined) pending.push({ id: record.id, sequence: record.thread.sequence })
    }
    if (pending.length === 0) return
    const messages = yield* readPublished(
      thread.id,
      pending.map(({ sequence }) => sequence)
    )
    const byMessage = new Map<
      ThreadMessageId.ThreadMessageId,
      { readonly sequence: number; readonly notificationIds: Array<Notification.NotificationId> }
    >()
    for (const { id, sequence } of pending) {
      const messageId = messages.get(sequence)
      // Contacts are told of messages alone; anything else pending for one is left as it is.
      if (messageId === undefined) continue
      const entry = byMessage.get(messageId) ?? { sequence, notificationIds: [] }
      entry.notificationIds.push(id)
      byMessage.set(messageId, entry)
    }
    const requestedAt = yield* DateTime.now
    for (const [messageId, { sequence, notificationIds }] of byMessage) {
      if (!Array.isReadonlyArrayNonEmpty(notificationIds)) continue
      const id = DeliveryId.DeliveryId.make(
        yield* Request.derivedId(["channel.delivery", workspaceId, channel.id, binding.conversation.id, messageId])
      )
      if (Option.isSome(yield* deliveryStore.get(id))) continue
      const record = Delivery.requested({
        id,
        workspaceId,
        channelId: channel.id,
        threadId: thread.id,
        groupId: thread.groupId,
        conversationId: binding.conversation.id,
        messageId,
        sequence,
        requestedAt
      })
      yield* journal.publish(DeliveryFacts.Created, Object.assign({}, record, { notificationIds }))
    }
  })

  const accept: DeliveryExecution["Service"]["accept"] = Effect.fn("DeliveryExecution.accept")(function* (threadId) {
    const binding = yield* channelBindingStore.get(threadId)
    if (Option.isNone(binding)) return []
    const thread = yield* threadStore.get(threadId)
    if (Option.isNone(thread)) return yield* Effect.die("A bound thread is missing")
    const channel = yield* channelStore.get(binding.value.channelId)
    if (Option.isNone(channel)) return yield* Effect.die("A binding's channel is missing")
    yield* asDelivery(acceptPending(thread.value, binding.value, channel.value))
    return yield* deliveryStore.listRequestedByThread(threadId)
  }, Operation.report)

  /** What a message's author is called, as the post names them. */
  const authorOf = Effect.fnUntraced(function* (author: ThreadMessage.Author) {
    if (!ThreadMessage.Author.isAnyOf(["Member"])(author)) return "Someone"
    const member = yield* memberStore.get(author.memberId)
    return Option.isSome(member) && member.value.name !== undefined ? member.value.name : "A member"
  })

  /** Publish the fact that fails `delivery` for `reason`, after `attempts` tries. */
  const publishFailed = Effect.fnUntraced(function* (delivery: Delivery.Delivery, reason: string, attempts: number) {
    yield* journal.publish(DeliveryFacts.Failed, {
      workspaceId,
      deliveryId: delivery.id,
      threadId: delivery.threadId,
      groupId: delivery.groupId,
      reason: Schema.NonEmptyString.make(reason),
      attempts,
      failedAt: yield* DateTime.now
    })
  })

  const start: DeliveryExecution["Service"]["start"] = Effect.fn("DeliveryExecution.start")(function* (deliveryId) {
    return yield* asDelivery(
      Effect.gen(function* () {
        const found = yield* deliveryStore.get(deliveryId)
        if (Option.isNone(found) || found.value.status !== "requested") return Start.cases.Idle.make({})
        const delivery = found.value
        /** Fail the delivery here and now, for `reason`, so the job has nothing to post. */
        const failed = (reason: string) =>
          Effect.as(publishFailed(delivery, reason, delivery.attempts), Start.cases.Idle.make({}))
        const message = yield* threadMessageStore.get(delivery.messageId)
        if (Option.isNone(message)) return yield* Effect.die("A delivery's message is missing")
        const { content } = message.value
        if (!ThreadMessage.Content.isAnyOf(["Text"])(content))
          return yield* failed("The message was deleted before it was sent.")
        const binding = yield* channelBindingStore.get(delivery.threadId)
        if (Option.isNone(binding)) return yield* Effect.die("A delivery's binding is missing")
        const channel = yield* channelStore.get(delivery.channelId)
        if (Option.isNone(channel)) return yield* Effect.die("A delivery's channel is missing")
        if (channel.value.status !== "active") return yield* failed("The channel was removed.")
        const reached = yield* channelQuery.access(channel.value).pipe(
          Effect.map(Result.succeed),
          Effect.catchTag("CoreError.Unavailable", ({ reason }) => Effect.succeed(Result.fail(reason.message)))
        )
        if (Result.isFailure(reached)) return yield* failed(reached.failure)
        return Start.cases.Ready.make({
          delivery,
          conversation: binding.value.conversation,
          outgoing: { text: content.text, author: yield* authorOf(message.value.author) },
          access: reached.success
        })
      })
    )
  }, Operation.report)

  const recordSent: DeliveryExecution["Service"]["recordSent"] = Effect.fn("DeliveryExecution.recordSent")(function* (
    deliveryId,
    sent
  ) {
    yield* asDelivery(
      Effect.gen(function* () {
        const found = yield* deliveryStore.get(deliveryId)
        if (Option.isNone(found) || found.value.status !== "requested") return
        yield* journal.publish(DeliveryFacts.Sent, {
          workspaceId,
          deliveryId,
          threadId: found.value.threadId,
          groupId: found.value.groupId,
          externalMessageId: sent.externalMessageId,
          attempts: sent.attempts,
          sentAt: yield* DateTime.now
        })
      })
    )
  }, Operation.report)

  const recordFailed: DeliveryExecution["Service"]["recordFailed"] = Effect.fn("DeliveryExecution.recordFailed")(
    function* (deliveryId, failed) {
      yield* asDelivery(
        Effect.gen(function* () {
          const found = yield* deliveryStore.get(deliveryId)
          if (Option.isNone(found) || found.value.status !== "requested") return
          yield* publishFailed(found.value, failed.reason, failed.attempts)
        })
      )
    },
    Operation.report
  )

  return DeliveryExecution.of({ accept, start, recordSent, recordFailed })
})

/**
 * Provide what the job asks over the stores, the shared reads, and the journal. Internal: callers
 * are trusted to be delivery jobs.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(DeliveryExecution, make)
