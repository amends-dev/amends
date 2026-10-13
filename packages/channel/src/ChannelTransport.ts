/**
 * The channel contract: what an integration that gives channels declares, as the harness and sandbox
 * contracts declare theirs. A channel transport receives the events an external system sends, each
 * placing a message in an external conversation, such as a Slack thread or an email thread, and
 * posts messages as replies in such a conversation, saying what the system returned for them. It
 * can edit or delete a posted message when the system can, and it knows its own identity there, so
 * that what it posted is not received as new.
 *
 * The transport identifies conversations, messages, and senders by the system's own ids and keeps
 * what else it needs of a conversation in its `details`; amends keeps those as they are and gives
 * them back when it posts there.
 *
 * @since 0.1.0
 */
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/**
 * An identifier of the external system's own: of a conversation, a message, or a user there.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ExternalId = Schema.NonEmptyString;

/**
 * @category schemas
 * @since 0.1.0
 */
export type ExternalId = typeof ExternalId.Type;

/**
 * An external conversation: its id, and what the transport needs to post there besides it, such
 * as the Slack channel a thread is in, which amends keeps and gives back as it is.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Conversation = Schema.Struct({
  id: ExternalId,
  details: Schema.Record(Schema.String, Schema.Json),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Conversation extends Schema.Schema.Type<typeof Conversation> {}

/**
 * Who sent a message in the external system: their id there, and what they are called.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Sender = Schema.Struct({ id: ExternalId, name: Schema.NonEmptyString });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Sender extends Schema.Schema.Type<typeof Sender> {}

/**
 * One event the external system sent: a message received in a conversation, with the title the
 * system gives the conversation when it has one, such as an email's subject; a message edited; or
 * a message deleted.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Event = Schema.TaggedUnion({
  MessageReceived: {
    conversation: Conversation,
    messageId: ExternalId,
    sender: Sender,
    text: Schema.String,
    title: Schema.optionalKey(Schema.String),
    receivedAt: Schema.DateTimeUtcFromString,
  },
  MessageEdited: {
    conversation: Conversation,
    messageId: ExternalId,
    sender: Sender,
    text: Schema.String,
    editedAt: Schema.DateTimeUtcFromString,
  },
  MessageDeleted: {
    conversation: Conversation,
    messageId: ExternalId,
    sender: Sender,
    deletedAt: Schema.DateTimeUtcFromString,
  },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Event = typeof Event.Type;

/**
 * What the external system sent a host, as the host received it: the request's headers and body.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Inbound = Schema.Struct({
  headers: Schema.Record(Schema.String, Schema.String),
  body: Schema.String,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Inbound extends Schema.Schema.Type<typeof Inbound> {}

/**
 * What the transport made of an inbound request: the events in it, none for a request that
 * carries no message, and what to answer the system with when it expects an answer, as Slack's URL
 * verification does.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Received = Schema.Struct({
  events: Schema.Array(Event),
  answer: Schema.optionalKey(Schema.String),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Received extends Schema.Schema.Type<typeof Received> {}

/**
 * A message to post in an external conversation: its text, and what its author is called.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Outgoing = Schema.Struct({ text: Schema.String, author: Schema.NonEmptyString });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Outgoing extends Schema.Schema.Type<typeof Outgoing> {}

/**
 * What the external system returned for a posted message: the id it gave it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Posted = Schema.Struct({ messageId: ExternalId });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Posted extends Schema.Schema.Type<typeof Posted> {}

/**
 * Why the transport could not do what was asked: it `rejected` an inbound request that is not the
 * system's, or whose signature does not hold; the system `refused` what it was asked, as for a
 * conversation that is gone; or the system was `unavailable`, which may pass.
 *
 * @category schemas
 * @since 0.1.0
 */
export const TransportErrorReason = Schema.Literals(["rejected", "refused", "unavailable"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type TransportErrorReason = typeof TransportErrorReason.Type;

/**
 * The error a transport fails with: its `reason`, and what went wrong in words. Only an
 * `unavailable` system is worth asking again.
 *
 * @category errors
 * @since 0.1.0
 */
export class TransportError extends Schema.TaggedError<TransportError>(
  "@amends-dev/channel/ChannelTransport/TransportError",
)("TransportError", {
  reason: TransportErrorReason,
  description: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  get isRetryable(): boolean {
    return this.reason === "unavailable";
  }

  override get message(): string {
    return this.description;
  }
}

/**
 * A channel's transport: how a connection to the system receives events and posts there.
 *
 * @category models
 * @since 0.1.0
 */
export interface ChannelTransport {
  /**
   * The transport's own identity in the system, such as a bot user's id, when it has one. What
   * this identity sends is the transport's own post, received back, not a message to take in.
   */
  readonly self: ExternalId | undefined;

  /** The events in a request the system sent, after checking that it is the system's. */
  readonly receive: (inbound: Inbound) => Effect.Effect<Received, TransportError>;

  /** Post `outgoing` as a reply in `conversation`. */
  readonly post: (
    conversation: Conversation,
    outgoing: Outgoing,
  ) => Effect.Effect<Posted, TransportError>;

  /** Replace the text of the message `messageId` it posted in `conversation`, when the system can. */
  readonly edit?: (
    conversation: Conversation,
    messageId: ExternalId,
    outgoing: Outgoing,
  ) => Effect.Effect<void, TransportError>;

  /** Delete the message `messageId` it posted in `conversation`, when the system can. */
  readonly delete?: (
    conversation: Conversation,
    messageId: ExternalId,
  ) => Effect.Effect<void, TransportError>;
}
