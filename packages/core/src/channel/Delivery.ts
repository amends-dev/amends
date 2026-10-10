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
import { ChannelTransport } from "@amends/channel";
import { Schema } from "effect";
import { GroupId } from "../group/id.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ThreadMessageId } from "../thread/ThreadMessageId.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { ChannelId } from "./ChannelId.ts";
import { DeliveryId } from "./DeliveryId.ts";

/**
 * Names a delivery; `DeliveryId.Id`, where models that only refer to deliveries import it from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = DeliveryId.Id;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = DeliveryId.Id;

/**
 * Where a delivery stands: `requested` until the job has posted the message or given up, then
 * `sent` or `failed`, which are final.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["requested", "sent", "failed"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type;

/**
 * A delivery as requested, and as since sent or failed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  channelId: ChannelId.Id,
  threadId: ThreadId.Id,
  /** The thread's group, copied so that the facts' audience follows from their payloads. */
  groupId: GroupId.Id,
  /** The external conversation the message goes to, as the thread's binding names it. */
  conversationId: ChannelTransport.ExternalId,
  messageId: ThreadMessageId.Id,
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
  finishedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Record extends Schema.Schema.Type<typeof Record> {}

/**
 * The record with some fields changed.
 *
 * @category utils
 * @since 0.1.0
 */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/**
 * A new delivery, requested and not yet tried.
 *
 * @category utils
 * @since 0.1.0
 */
export const requested = (
  delivery: Omit<Record, "status" | "externalMessageId" | "attempts" | "failure" | "finishedAt">,
): Record => ({
  ...delivery,
  status: "requested",
  externalMessageId: null,
  attempts: 0,
  failure: null,
  finishedAt: null,
});

/**
 * What a successful send records: the id the external system gave the message, after how many
 * tries, and when.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Sent = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  deliveryId: Id,
  threadId: ThreadId.Id,
  groupId: GroupId.Id,
  externalMessageId: ChannelTransport.ExternalId,
  attempts: Schema.Int.check(Schema.isGreaterThan(0)),
  sentAt: Schema.DateTimeUtcFromString,
});

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
  workspaceId: WorkspaceId.Id,
  deliveryId: Id,
  threadId: ThreadId.Id,
  groupId: GroupId.Id,
  reason: Schema.NonEmptyString,
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  failedAt: Schema.DateTimeUtcFromString,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Failed extends Schema.Schema.Type<typeof Failed> {}

export * as Delivery from "./Delivery.ts";
