/**
 * A delivery carries one message of a bound thread to the external conversation the thread came
 * from, through the thread's channel: one row keyed by the channel, the conversation, and the
 * message, so that the contacts a message notifies share one delivery. It is `requested` when the
 * delivery job accepts their notifications into it, and `sent`, with the id the external system
 * gave the message, or `failed`, with why, once the job is done with it. `DeliveryExecution` is
 * what the job asks of the workspace about it.
 *
 * @since 0.1.0
 */

import { ChannelTransport } from "@amends-dev/channel"
import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadMessageId from "../thread/ThreadMessageId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ChannelId from "./ChannelId.ts"
import * as DeliveryId from "./DeliveryId.ts"

/**
 * Where a delivery stands: `requested` until the job has posted the message or given up, then
 * `sent` or `failed`, which are final.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["requested", "sent", "failed"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type

/**
 * A delivery as requested, and as since sent or failed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Delivery = Schema.Struct({
  id: DeliveryId.DeliveryId,
  workspaceId: WorkspaceId.WorkspaceId,
  channelId: ChannelId.ChannelId,
  threadId: ThreadId.ThreadId,
  /** The thread's group, copied so that the facts' audience follows from their payloads. */
  groupId: GroupId.GroupId,
  /** The external conversation the message goes to, as the thread's binding names it. */
  conversationId: ChannelTransport.ExternalId,
  messageId: ThreadMessageId.ThreadMessageId,
  /** The message's position in the thread; a thread's deliveries are sent in this order. */
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  status: Status,
  /** The id the external system gave the message, once sent. */
  externalMessageId: Schema.NullOr(ChannelTransport.ExternalId),
  /** How many times the job tried to post it. */
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** Why it failed. */
  failure: Schema.NullOr(Schema.String),
  requestedAt: Schema.DateTimeUtcFromString,
  finishedAt: Schema.NullOr(Schema.DateTimeUtcFromString)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Delivery extends Schema.Schema.Type<typeof Delivery> {}

/**
 * The record with some fields changed.
 *
 * @category transforming
 * @since 0.1.0
 */
export const change = (record: Delivery, changes: Partial<Delivery>): Delivery => Object.assign({}, record, changes)

/**
 * A new delivery, requested and not yet tried.
 *
 * @category constructors
 * @since 0.1.0
 */
export const requested = (
  delivery: Omit<Delivery, "status" | "externalMessageId" | "attempts" | "failure" | "finishedAt">
): Delivery => ({
  ...delivery,
  status: "requested",
  externalMessageId: null,
  attempts: 0,
  failure: null,
  finishedAt: null
})

/**
 * What a successful send records: the id the external system gave the message, after how many
 * tries, and when.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Sent = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  deliveryId: DeliveryId.DeliveryId,
  threadId: ThreadId.ThreadId,
  groupId: GroupId.GroupId,
  externalMessageId: ChannelTransport.ExternalId,
  attempts: Schema.Int.check(Schema.isGreaterThan(0)),
  sentAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Sent extends Schema.Schema.Type<typeof Sent> {}

/**
 * What giving up records: why, after how many tries, and when.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Failed = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  deliveryId: DeliveryId.DeliveryId,
  threadId: ThreadId.ThreadId,
  groupId: GroupId.GroupId,
  reason: Schema.NonEmptyString,
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  failedAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Failed extends Schema.Schema.Type<typeof Failed> {}
