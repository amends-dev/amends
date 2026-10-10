/**
 * Intake: taking in what a channel receives, as no member. For each event the channel's transport
 * makes of an inbound request, in a commit of its own, attributed to the contact who sent it: a
 * message in a conversation the channel has not heard before opens a thread in the destination
 * group, bound to that conversation, as a task in triage when the channel opens tasks; a message in
 * a conversation it knows is published in its thread; an edit or a deletion of the contact's own
 * message is applied to it. Every id intake gives is derived from the external one, so an event the
 * system sends again is a retry and takes in nothing more. What the transport itself posted,
 * received back, is an echo and ignored.
 *
 * @since 0.1.0
 */
import type { ChannelTransport } from "@amends-dev/channel";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { Performer } from "../identity/performer.ts";
import { Journal } from "../journal/journal.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Request } from "../request/request.ts";
import { Task } from "../task/Task.ts";
import { TaskCommand } from "../task/TaskCommand.ts";
import { Thread } from "../thread/Thread.ts";
import { ThreadCommand } from "../thread/ThreadCommand.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ThreadMessage } from "../thread/ThreadMessage.ts";
import { ThreadMessageStore } from "../thread/ThreadMessageStore.ts";
import { ThreadParticipation } from "../thread/ThreadParticipation.ts";
import { ThreadQuery } from "../thread/ThreadQuery.ts";
import { ThreadStore } from "../thread/ThreadStore.ts";
import type { Channel } from "./Channel.ts";
import type { ChannelBinding } from "./ChannelBinding.ts";
import { ChannelBindingStore } from "./ChannelBindingStore.ts";
import { NotFound, Rejected, Unavailable } from "./ChannelErrors.ts";
import { ChannelFacts } from "./ChannelFacts.ts";
import { ChannelQuery } from "./ChannelQuery.ts";
import type { ChannelStore } from "./ChannelStore.ts";
import { Contact } from "./Contact.ts";
import { ContactStore } from "./ContactStore.ts";
import { DeliveryStore } from "./DeliveryStore.ts";
export { NotFound, Rejected, Unavailable } from "./ChannelErrors.ts";

/**
 * What intake made of one event: the thread it opened, the message it published, edited, or
 * deleted, or why it took nothing in: an echo of a post of our own; a message taken in already; a
 * message with no text; an edit or a deletion of a message intake never took in, or that is not the
 * sender's; or an edit that changes nothing.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Intake = Schema.TaggedUnion({
  Opened: { threadId: ThreadId.Id, messageId: ThreadMessage.Id },
  Replied: { threadId: ThreadId.Id, messageId: ThreadMessage.Id },
  Edited: { threadId: ThreadId.Id, messageId: ThreadMessage.Id },
  Deleted: { threadId: ThreadId.Id, messageId: ThreadMessage.Id },
  Ignored: { reason: Schema.Literals(["echo", "duplicate", "empty", "unknown", "unchanged"]) },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Intake = typeof Intake.Type;

/**
 * What receiving an inbound request made: what to answer the system with, when it expects an
 * answer, and what intake made of each event in it, in order.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Received = Schema.Struct({
  answer: Schema.NullOr(Schema.String),
  intakes: Schema.Array(Intake),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Received extends Schema.Schema.Type<typeof Received> {}

/**
 * What taking an event in can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type IntakeError =
  | NotFound
  | Unavailable
  | ChannelStore.Failure
  | ChannelQuery.Error
  | ChannelBindingStore.Failure
  | ContactStore.Failure
  | DeliveryStore.Failure
  | ThreadStore.Failure
  | ThreadMessageStore.Failure
  | ThreadQuery.FollowersError
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | TaskCommand.Error;

/**
 * What receiving an inbound request can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReceiveError = IntakeError | Rejected;

/**
 * Intake, as a host calls it.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Take in a request the external system sent the host for the channel: the channel's transport
   * makes events of it, each taken in as `intake` does, in a commit of its own. A request the
   * transport rejects is `Rejected`, and a channel whose system cannot be reached `Unavailable`; a
   * channel missing or removed is `NotFound`.
   */
  readonly receive: (
    channelId: Channel.Id,
    inbound: ChannelTransport.Inbound,
  ) => Effect.Effect<Received, ReceiveError>;
  /** Take in one event the channel's system sent, in a commit of its own. */
  readonly intake: (
    channelId: Channel.Id,
    event: ChannelTransport.Event,
  ) => Effect.Effect<Intake, IntakeError>;
}

/**
 * Intake, one of `Core.JobServices`: a host calls it for what its channels receive, as no actor.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/channel/ChannelIntake",
) {}

/** Why intake took nothing in. */
type IgnoredReason = Extract<Intake, { readonly _tag: "Ignored" }>["reason"];

const ignored = (reason: IgnoredReason) => Intake.cases.Ignored.make({ reason });

/**
 * Capture the stores, the shared reads and writes, and the journal.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ChannelIntake.make")(function* () {
  const channelQuery = yield* ChannelQuery.Service;
  const channelBindingStore = yield* ChannelBindingStore.Service;
  const contactStore = yield* ContactStore.Service;
  const deliveryStore = yield* DeliveryStore.Service;
  const threadStore = yield* ThreadStore.Service;
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const taskCommand = yield* TaskCommand.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  /** Run `step` in its own commit, attributed to the contact `contactId`. */
  const asContact = <A, E, R>(contactId: Contact.Id, step: Effect.Effect<A, E, R>) =>
    Effect.flatMap(
      Publication.make(
        workspaceId,
        Performer.Reference.cases.Identity.make({ identity: { _tag: "Contact", id: contactId } }),
      ),
      (provenance) => step.pipe(Effect.provideService(Publication.Service, provenance)),
    ).pipe(journal.commit);

  /** The thread a binding names, which a binding cannot outlive. */
  const threadOf = Effect.fnUntraced(function* (binding: ChannelBinding.Record) {
    const found = yield* threadStore.get(binding.threadId);
    if (Option.isNone(found)) return yield* Effect.die("A bound thread is missing");
    return found.value;
  });

  /** A participant who could not be admitted: intake admits only those it just read as able. */
  const admitted = <A, E, R>(effect: Effect.Effect<A, E | ThreadCommand.Unavailable, R>) =>
    Effect.catchTag(effect, "ThreadCommand.Unavailable", () =>
      Effect.die("Intake could not admit a participant it read as able to take part"),
    );

  /** The contact the sender is on the channel, created when first heard from, renamed when called otherwise. */
  const resolveContact = Effect.fnUntraced(function* (
    channel: Channel.Record,
    contactId: Contact.Id,
    sender: ChannelTransport.Sender,
    occurredAt: DateTime.Utc,
  ) {
    const name = Contact.nameOf(sender.name);
    const found = yield* contactStore.get(contactId);
    if (Option.isNone(found)) {
      const record: Contact.Record = {
        id: contactId,
        workspaceId,
        channelId: channel.id,
        externalId: sender.id,
        name,
        createdAt: occurredAt,
      };
      yield* journal.publish(ChannelFacts.ContactCreated, record);
      return record;
    }
    if (found.value.name === name) return found.value;
    yield* journal.publish(ChannelFacts.ContactRenamed, { workspaceId, contactId, name });
    return Contact.change(found.value, { name });
  });

  /** Open a thread for a conversation the channel has not heard before, bound to it. */
  const open = Effect.fnUntraced(function* (
    channel: Channel.Record,
    contact: Contact.Record,
    event: Extract<ChannelTransport.Event, { readonly _tag: "MessageReceived" }>,
    text: ThreadMessage.Text,
    messageId: ThreadMessage.Id,
    occurredAt: DateTime.Utc,
  ) {
    const threadId = Thread.Id.make(
      yield* Request.derivedId(["channel.thread", workspaceId, channel.id, event.conversation.id]),
    );
    const title =
      event.title === undefined
        ? null
        : Option.getOrNull(Schema.decodeOption(Thread.Title)(event.title.trim()));
    const author: ThreadMessage.Author = { _tag: "Contact", contactId: contact.id };
    // The group's human followers join; its agents come through triage, assignment, or a mention.
    const followers = (yield* threadQuery.followers(channel.groupId)).filter(({ member }) =>
      Identity.MemberReference.isAnyOf(["Human"])(member.identity),
    );
    const participants: Array<ThreadParticipation.Reference> = [
      { _tag: "Contact", contactId: contact.id },
      ...followers.map(({ member }) => ({ _tag: "Member" as const, memberId: member.id })),
      ...(channel.opensTasks ? [{ _tag: "Triage" as const }] : []),
    ];
    const created = yield* admitted(
      threadCommand.create({
        threadId,
        groupId: channel.groupId,
        title,
        origin: null,
        participants,
        message: {
          messageId,
          author,
          text,
          mentions: [],
          via: { _tag: "Channel", channelId: channel.id, externalMessageId: event.messageId },
        },
        occurredAt,
      }),
    );
    yield* journal
      .publish(ChannelFacts.Bound, {
        threadId,
        workspaceId,
        channelId: channel.id,
        groupId: channel.groupId,
        conversation: event.conversation,
        boundAt: occurredAt,
      })
      .pipe(Publication.withOccurredAt(occurredAt));
    if (channel.opensTasks)
      yield* admitted(
        taskCommand.create({
          thread: created.thread,
          ...Task.initial({}),
          createdBy: author,
          by: { _tag: "Contact", contactId: contact.id },
          occurredAt,
        }),
      );
    return Intake.cases.Opened.make({ threadId, messageId });
  });

  /** Publish the contact's message in the thread its conversation is bound to. */
  const reply = Effect.fnUntraced(function* (
    channel: Channel.Record,
    contact: Contact.Record,
    binding: ChannelBinding.Record,
    event: Extract<ChannelTransport.Event, { readonly _tag: "MessageReceived" }>,
    text: ThreadMessage.Text,
    messageId: ThreadMessage.Id,
    occurredAt: DateTime.Utc,
  ) {
    if (Option.isSome(yield* threadMessageStore.get(messageId))) return ignored("duplicate");
    const thread = yield* threadOf(binding);
    // The contact is readmitted if their participation ended; everyone taking part is told.
    const contactReference: ThreadParticipation.Reference = {
      _tag: "Contact",
      contactId: contact.id,
    };
    const current = yield* threadQuery.currentParticipants(thread);
    const byKey = new Map(
      [contactReference, ...current.map((p) => ThreadParticipation.referenceOf(p.participant))].map(
        (reference) => [ThreadParticipation.keyOf(reference), reference] as const,
      ),
    );
    yield* admitted(
      threadCommand.publishMessage({
        messageId,
        threadId: thread.id,
        author: { _tag: "Contact", contactId: contact.id },
        text,
        mentions: [],
        participants: [...byKey.values()],
        occurredAt,
        via: { _tag: "Channel", channelId: channel.id, externalMessageId: event.messageId },
      }),
    );
    return Intake.cases.Replied.make({ threadId: thread.id, messageId });
  });

  /** The contact's own message with text, as intake took it in; anything else is unknown. */
  const ownMessage = Effect.fnUntraced(function* (
    contact: Contact.Record,
    messageId: ThreadMessage.Id,
  ) {
    const found = yield* threadMessageStore.get(messageId);
    if (Option.isNone(found)) return undefined;
    const message = found.value;
    const own =
      ThreadMessage.Author.isAnyOf(["Contact"])(message.author) &&
      message.author.contactId === contact.id;
    return own && ThreadMessage.Content.isAnyOf(["Text"])(message.content)
      ? { message, content: message.content }
      : undefined;
  });

  const edit = Effect.fnUntraced(function* (
    contact: Contact.Record,
    text: ThreadMessage.Text,
    messageId: ThreadMessage.Id,
    occurredAt: DateTime.Utc,
  ) {
    const own = yield* ownMessage(contact, messageId);
    if (own === undefined) return ignored("unknown");
    if (own.content.text === text) return ignored("unchanged");
    yield* admitted(
      threadCommand.editMessage({
        message: own.message,
        text,
        mentions: own.content.mentions,
        occurredAt,
      }),
    );
    return Intake.cases.Edited.make({ threadId: own.message.threadId, messageId });
  });

  const remove = Effect.fnUntraced(function* (
    contact: Contact.Record,
    messageId: ThreadMessage.Id,
    occurredAt: DateTime.Utc,
  ) {
    const own = yield* ownMessage(contact, messageId);
    if (own === undefined) return ignored("unknown");
    yield* admitted(threadCommand.deleteMessage({ message: own.message, occurredAt }));
    return Intake.cases.Deleted.make({ threadId: own.message.threadId, messageId });
  });

  /** The text of a message as a thread holds it, or none for a message with no text to keep. */
  const textOf = (text: string) => Schema.decodeOption(ThreadMessage.Text)(text);

  /**
   * Take one event in, in a commit of its own as the contact who sent it, once it is known not to
   * be an echo of a post of our own: by the sender, or by the message the transport posted.
   */
  const intakeEvent = Effect.fn("ChannelIntake.intakeEvent")(
    function* (
      channel: Channel.Record,
      self: ChannelTransport.ExternalId | undefined,
      event: ChannelTransport.Event,
    ) {
      if (self !== undefined && event.sender.id === self) return ignored("echo");
      const posted = yield* deliveryStore.findByExternalMessage(
        channel.id,
        event.conversation.id,
        event.messageId,
      );
      if (Option.isSome(posted)) return ignored("echo");
      const contactId = Contact.Id.make(
        yield* Request.derivedId(["channel.contact", workspaceId, channel.id, event.sender.id]),
      );
      const messageId = ThreadMessage.Id.make(
        yield* Request.derivedId(["channel.message", workspaceId, channel.id, event.messageId]),
      );
      return yield* asContact(
        contactId,
        Effect.gen(function* () {
          const occurredAt = yield* DateTime.now;
          const contact = yield* resolveContact(channel, contactId, event.sender, occurredAt);
          switch (event._tag) {
            case "MessageReceived": {
              const text = textOf(event.text);
              if (Option.isNone(text)) return ignored("empty");
              const binding = yield* channelBindingStore.findByConversation(
                channel.id,
                event.conversation.id,
              );
              return Option.isNone(binding)
                ? yield* open(channel, contact, event, text.value, messageId, occurredAt)
                : yield* reply(
                    channel,
                    contact,
                    binding.value,
                    event,
                    text.value,
                    messageId,
                    occurredAt,
                  );
            }
            case "MessageEdited": {
              const text = textOf(event.text);
              if (Option.isNone(text)) return ignored("empty");
              return yield* edit(contact, text.value, messageId, occurredAt);
            }
            case "MessageDeleted":
              return yield* remove(contact, messageId, occurredAt);
          }
        }),
      );
    },
    Effect.provideService(Crypto.Crypto, crypto),
  );

  /** The channel's transport, or why its system cannot be reached. */
  const transportOf = (channel: Channel.Record) =>
    channelQuery
      .transport(channel)
      .pipe(
        Effect.catchTag(
          "ChannelQuery.Unavailable",
          (error) => new Unavailable({ description: error.description }),
        ),
      );

  const receive: Interface["receive"] = Effect.fn("ChannelIntake.receive")(
    function* (channelId, inbound) {
      const channel = yield* channelQuery.requireActive(channelId);
      const transport = yield* transportOf(channel);
      const received = yield* transport
        .receive(inbound)
        .pipe(
          Effect.catchTag("TransportError", (error) =>
            Effect.fail(
              error.reason === "rejected"
                ? new Rejected({ description: error.description })
                : new Unavailable({ description: error.description }),
            ),
          ),
        );
      const intakes: Array<Intake> = [];
      for (const event of received.events)
        intakes.push(yield* intakeEvent(channel, transport.self, event));
      return { answer: received.answer ?? null, intakes } satisfies Received;
    },
  );

  const intake: Interface["intake"] = Effect.fn("ChannelIntake.intake")(
    function* (channelId, event) {
      const channel = yield* channelQuery.requireActive(channelId);
      const transport = yield* transportOf(channel);
      return yield* intakeEvent(channel, transport.self, event);
    },
  );

  return Service.of({ receive, intake });
});

/**
 * Provide intake over the stores, the shared reads and writes, and the journal. Internal: callers
 * are trusted to be hosts taking in what their channels received.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make());

export * as ChannelIntake from "./ChannelIntake.ts";
