/**
 * The writes to threads that operations share, run inside the caller's commit: creating a thread,
 * publishing, editing, and deleting a message, and recording one activity of any kind at the
 * thread's next position.
 * Every domain that records activity goes through `publishActivity`, which takes the position,
 * admits the participants the activity asks for, runs the domain's step, and records the activity
 * the step returns, caused by the fact the step published. The caller owns authorization and the
 * commit; this service checks neither.
 *
 * @since 0.1.0
 */
import * as Identity from "../identity/Identity.ts";
import * as Notification from "../notification/Notification.ts";
import { Context, Crypto, Effect, Layer, Option, Schema, Predicate } from "effect";
import { type DateTime, type PlatformError } from "effect";
import * as Group from "../group/Group.ts";
import type * as Event from "../journal/Event.ts";
import * as Journal from "../journal/Journal.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as Task from "../task/Task.ts";
import * as TaskStore from "../task/TaskStore.ts";
import * as Member from "../workspace/Member.ts";
import * as Thread from "./Thread.ts";
import * as ThreadFacts from "./ThreadFacts.ts";
import * as ThreadQuery from "./ThreadQuery.ts";
import * as ThreadStore from "./ThreadStore.ts";
import * as ThreadActivity from "./ThreadActivity.ts";
import * as ThreadActivityFacts from "./ThreadActivityFacts.ts";
import * as ThreadActivityKind from "./ThreadActivityKind.ts";
import * as ThreadActivityStore from "./ThreadActivityStore.ts";
import * as ThreadMessage from "./ThreadMessage.ts";
import * as ThreadMessageActivity from "./ThreadMessageActivity.ts";
import * as ThreadMessageFacts from "./ThreadMessageFacts.ts";
import * as ThreadParticipation from "./ThreadParticipation.ts";
import * as ThreadParticipationFacts from "./ThreadParticipationFacts.ts";

/**
 * A member to admit has no current group admission or active workspace membership.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()("ThreadCommand.Unavailable", {
  memberId: Member.Id,
}) {}

/**
 * The thread's next position is not the one the caller accounted for: activity took it first.
 *
 * @category errors
 * @since 0.1.0
 */
export class PositionChanged extends Schema.TaggedError<PositionChanged>()(
  "ThreadCommand.PositionChanged",
  { expected: Schema.Int, actual: Schema.Int },
) {}

/**
 * What the writes can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | ThreadQuery.ParticipantsError
  | ThreadStore.Failure
  | ThreadActivityStore.Failure
  | TaskStore.Failure
  | Unavailable
  | PositionChanged
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;

/**
 * What publishes a message: the message, who wrote it, whom it addresses, and everyone who takes
 * part through it.
 *
 * @category options
 * @since 0.1.0
 */
export const MessageInput = Schema.Struct({
  /** The caller names the message, so a keyed request can name the same one on its retry. */
  messageId: ThreadMessage.Id,
  threadId: Thread.Id,
  author: ThreadMessage.Author,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(Member.Id),
  /** The author, mentions, and everyone else this message addresses when it has no mentions. */
  participants: Schema.Array(ThreadParticipation.Reference),
  occurredAt: Schema.DateTimeUtcFromString,
  /** How the message came about: an agent's turn, or null for one written in amends. */
  via: Schema.NullOr(ThreadMessage.Via),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface MessageInput extends Schema.Schema.Type<typeof MessageInput> {}

/**
 * A published message and the timeline activity that places it, for the publishing workflow.
 *
 * @category models
 * @since 0.1.0
 */
export interface MessagePublished {
  readonly message: ThreadMessage.Record;
  readonly activity: ThreadMessageActivity.Published;
}

/**
 * What edits a message: the message as it is, with its text, the new text and mentions, and when.
 *
 * @category options
 * @since 0.1.0
 */
export interface EditInput {
  readonly message: ThreadMessage.Record;
  readonly text: ThreadMessage.Text;
  readonly mentions: ReadonlyArray<Member.Id>;
  readonly occurredAt: DateTime.Utc;
}

/**
 * An edited message, with its new content, and the timeline activity that records the edit.
 *
 * @category models
 * @since 0.1.0
 */
export interface MessageEdited {
  readonly message: ThreadMessage.Record;
  readonly activity: ThreadMessageActivity.Edited;
}

/**
 * What deletes a message: the message as it is, and when.
 *
 * @category options
 * @since 0.1.0
 */
export interface DeleteInput {
  readonly message: ThreadMessage.Record;
  readonly occurredAt: DateTime.Utc;
}

/**
 * A deleted message, its content gone, and the timeline activity that records the deletion.
 *
 * @category models
 * @since 0.1.0
 */
export interface MessageDeleted {
  readonly message: ThreadMessage.Record;
  readonly activity: ThreadMessageActivity.Deleted;
}

/**
 * What creates a thread: its ID and group, its title and origin if it has them, who takes part
 * from the start, and the message it opens with, at sequence 1. Whatever else the thread is
 * created as is recorded after that message, in the same commit.
 *
 * @category options
 * @since 0.1.0
 */
export const CreateInput = Schema.Struct({
  /** The caller names the thread, so a keyed request can name the same one on its retry. */
  threadId: Thread.Id,
  groupId: Group.Id,
  title: Thread.Record.fields.title,
  origin: Thread.Record.fields.origin,
  /** Everyone who takes part from the first activity; group membership enrolls no one else. */
  participants: Schema.Array(ThreadParticipation.Reference),
  /** The opening message, whose author is the thread's creator. */
  message: Schema.Struct({
    messageId: MessageInput.fields.messageId,
    author: MessageInput.fields.author,
    text: MessageInput.fields.text,
    mentions: MessageInput.fields.mentions,
    via: MessageInput.fields.via,
  }),
  occurredAt: Schema.DateTimeUtcFromString,
});

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/**
 * A created thread, its opening message, and the activity that places it, for the starting
 * workflow, which may create the thread as more.
 *
 * @category models
 * @since 0.1.0
 */
export interface Created {
  readonly thread: Thread.Record;
  readonly message: ThreadMessage.Record;
  readonly activity: ThreadMessageActivity.Published;
}

/**
 * The participations an activity asked to admit, and the facts of those it added: current
 * participants are reused and add no fact.
 *
 * @category models
 * @since 0.1.0
 */
export interface Admitted {
  readonly participants: ReadonlyArray<ThreadParticipation.Record>;
  readonly added: ReadonlyArray<Event.Type<typeof ThreadParticipationFacts.Added>>;
}

/**
 * Where the activity will appear, and who takes part there: what a domain's step is given.
 *
 * @category models
 * @since 0.1.0
 */
export interface ActivityContext {
  readonly thread: Thread.Record;
  readonly sequence: number;
  readonly admitted: Admitted;
}

/**
 * What the owning domain's step records, after publishing the fact the activity reports: the
 * activity's kind and details, the recipients it selects, and a value for the caller.
 *
 * @category models
 * @since 0.1.0
 */
export interface ActivityStep<A, K extends ThreadActivityKind.Definition> {
  readonly value: A;
  readonly kind: K;
  readonly details: K["details"]["Type"];
  readonly recipients: ReadonlyArray<ThreadActivity.Recipient>;
  /** The fact the activity reports; the activity records it as its cause. */
  readonly cause: Event.Record;
}

/**
 * What publishes one activity: the thread, when it occurred, whom to admit first, and the domain's
 * step.
 *
 * @category options
 * @since 0.1.0
 */
export interface ActivityInput<A, K extends ThreadActivityKind.Definition, E, R> {
  readonly thread: Thread.Record;
  readonly occurredAt: DateTime.Utc;
  /** Record only at this position, failing with PositionChanged if activity took it first. */
  readonly expectedSequence?: number;
  /** Participants to admit at this position before the step, as a reply admits its author. */
  readonly admit?: ReadonlyArray<ThreadParticipation.Reference>;
  readonly step: (context: ActivityContext) => Effect.Effect<ActivityStep<A, K>, E, R>;
}

/**
 * What publishing an activity returns: the step's value and the recorded activity's event.
 *
 * @category models
 * @since 0.1.0
 */
export interface ActivityPublished<A> {
  readonly value: A;
  readonly event: Event.Type<typeof ThreadActivityFacts.Recorded>;
}

/**
 * The shared writes of threads. Internal: not among `Core.Operations`.
 *
 * @effect-expect-leaking Transaction
 *
 * The shared writes.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadCommand extends Context.Service<
  ThreadCommand,
  {
    /**
     * Create a thread, as every workflow that opens one does: record the thread, admit its starting
     * participants at the first position, and publish the opening message with its recipients, so
     * no thread exists without participants or activity. A workflow that creates the thread as
     * something more, such as a task, records that next in the same commit. The caller owns
     * authorization and the choice of participants.
     */
    readonly create: (
      input: CreateInput,
    ) => Effect.Effect<Created, Error, Store.Transaction | Publication.Publication>;
    /**
     * Publish a message, admitting the participants it selects. The caller authorizes the workflow,
     * its author, and the selected participants; rules such as requiring a human author belong to
     * that caller.
     */
    readonly publishMessage: (
      input: MessageInput,
    ) => Effect.Effect<MessagePublished, Error, Store.Transaction | Publication.Publication>;
    /**
     * Replace a message's text and mentions at its next revision, admitting the members it newly
     * mentions and telling them, and them alone; on a task's thread, editing the opening message
     * changes the task's description, so every participant is told and the assignee asked to work on
     * it anew. The caller authorizes the editor, checks the revision the editor last saw, and gives a
     * message that still has text.
     */
    readonly editMessage: (
      input: EditInput,
    ) => Effect.Effect<MessageEdited, Error, Store.Transaction | Publication.Publication>;
    /**
     * Delete a message: its text is gone, its place in the thread stays, and no one is told. The
     * caller authorizes the deletion and gives a message not yet deleted.
     */
    readonly deleteMessage: (
      input: DeleteInput,
    ) => Effect.Effect<MessageDeleted, Error, Store.Transaction | Publication.Publication>;
    /**
     * Publish one activity in the caller's commit: take the thread's next position, admit the
     * participants asked for, run the owning domain's step, and record the activity it returns
     * there, caused by the fact the step published. The caller authorizes the operation.
     */
    readonly publishActivity: <A, K extends ThreadActivityKind.Definition, E, R>(
      input: ActivityInput<A, K, E, R>,
    ) => Effect.Effect<
      ActivityPublished<A>,
      E | Error,
      R | Store.Transaction | Publication.Publication
    >;
  }
>()("@amends-dev/core/thread/ThreadCommand") {}

/** The participant an author publishes as. */
const authorAsParticipant = (author: ThreadMessage.Author): ThreadParticipation.Reference =>
  ThreadMessage.Author.isAnyOf(["Member"])(author)
    ? { _tag: "Member", memberId: author.memberId }
    : { _tag: "Contact", contactId: author.contactId };

/**
 * Whom a message by `author` notifies, of the participants selected for it. Mentions address
 * members; without them the message reaches every selected participant. A message never notifies
 * its own author; an agent's message asks no work of other agents, so agents cannot keep setting
 * each other to work; and a contact's message tells no contact, who heard it where it came from.
 */
const recipientsOf = (
  author: ThreadMessage.Author,
  mentions: ReadonlyArray<Member.Id>,
  participants: ReadonlyArray<ThreadParticipation.Record>,
): ReadonlyArray<ThreadActivity.Recipient> => {
  const authorKey = ThreadParticipation.keyOf(authorAsParticipant(author));
  const writer = participants.find(
    ({ participant }) => ThreadParticipation.keyOf(participant) === authorKey,
  )?.participant;
  const byAgent =
    Predicate.isTagged(writer, "Member") &&
    Identity.MemberReference.isAnyOf(["Agent"])(writer.identity);
  const byContact = ThreadMessage.Author.isAnyOf(["Contact"])(author);
  const addressed = (participant: ThreadParticipation.Participant) => {
    if (ThreadParticipation.keyOf(participant) === authorKey) return false;
    if (byContact && ThreadParticipation.Participant.isAnyOf(["Contact"])(participant))
      return false;
    const memberId = ThreadParticipation.memberOf(participant);
    return mentions.length === 0 || (memberId !== undefined && mentions.includes(memberId));
  };
  return participants
    .filter(({ participant }) => addressed(participant))
    .map(({ id, participant }) => {
      const recipient = ThreadParticipation.recipientOf(participant);
      return {
        participationId: id,
        recipient,
        requestsWork: Notification.Recipient.isAnyOf(["Agent"])(recipient) && !byAgent,
      };
    });
};

/**
 * Capture the stores and journal; every write runs in the caller's transaction.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadCommand.make")(function* () {
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const threadStore = yield* ThreadStore.ThreadStore;
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore;
  const taskStore = yield* TaskStore.TaskStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  /** The position the thread's next activity takes, read in the caller's transaction. */
  const nextSequence = Effect.fn("ThreadCommand.nextSequence")(function* (threadId: Thread.Id) {
    yield* Store.Transaction;
    const latest = yield* threadActivityStore.latest(threadId);
    return Option.isNone(latest) ? 1 : latest.value.sequence + 1;
  });

  /**
   * The participant a reference admits: a member through the current admission `candidates` give
   * them, which they must have, or a contact or triage as named.
   */
  const participantOf = Effect.fnUntraced(function* (
    reference: ThreadParticipation.Reference,
    candidates: ReadonlyMap<Member.Id, ThreadQuery.Eligible>,
  ): Effect.fn.Return<ThreadParticipation.Participant, Unavailable> {
    if (!ThreadParticipation.Reference.isAnyOf(["Member"])(reference)) return reference;
    const candidate = candidates.get(reference.memberId);
    if (candidate === undefined) return yield* new Unavailable({ memberId: reference.memberId });
    return {
      _tag: "Member",
      memberId: reference.memberId,
      groupMembershipId: candidate.admission.id,
      identity: candidate.member.identity,
    };
  });

  /**
   * Admit participants at a position. Members need a current group admission; contacts and
   * triage take part without one. Current participants are reused.
   */
  const admitParticipants = Effect.fn("ThreadCommand.admitParticipants")(function* (
    thread: Thread.Record,
    requested: ReadonlyArray<ThreadParticipation.Reference>,
    sequence: number,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    if (new Set(requested.map(ThreadParticipation.keyOf)).size !== requested.length)
      return yield* Effect.die("Participants to admit must be distinct");
    // Current participants are reused; they already hold the member's current admission.
    const existing = new Map(
      (yield* threadQuery.findParticipants(thread, requested)).map(
        (p) => [ThreadParticipation.keyOf(p.participant), p] as const,
      ),
    );
    const joining = requested.flatMap((reference) =>
      ThreadParticipation.Reference.isAnyOf(["Member"])(reference) &&
      !existing.has(ThreadParticipation.keyOf(reference))
        ? [reference.memberId]
        : [],
    );
    const candidates = yield* threadQuery.eligibleMembers(thread.groupId, joining);
    const result: Array<ThreadParticipation.Record> = [];
    const added: Array<Event.Type<typeof ThreadParticipationFacts.Added>> = [];
    for (const reference of requested) {
      const previous = existing.get(ThreadParticipation.keyOf(reference));
      if (previous !== undefined) {
        result.push(previous);
        continue;
      }
      const participant = yield* participantOf(reference, candidates);
      const admitted: typeof ThreadParticipation.Admission.Type = {
        id: ThreadParticipation.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        participant,
        joinedAt: occurredAt,
        joinedAtSequence: sequence,
        status: "active",
        endedAt: null,
      };
      added.push(
        yield* journal.publish(ThreadParticipationFacts.Added, {
          ...admitted,
          groupId: thread.groupId,
        }),
      );
      result.push(admitted);
    }
    return { participants: result, added } satisfies Admitted;
  });

  /** Record an activity of one kind at its position, with the recipients it selects. */
  const recordActivity = Effect.fn("ThreadCommand.recordActivity")(function* <
    K extends ThreadActivityKind.Definition,
  >(input: {
    readonly thread: Thread.Record;
    readonly sequence: number;
    readonly occurredAt: DateTime.Utc;
    readonly kind: K;
    readonly details: K["details"]["Type"];
    readonly recipients: ReadonlyArray<ThreadActivity.Recipient>;
  }) {
    yield* Store.Transaction;
    const prepared = yield* ThreadActivityKind.prepare(input.kind, input.details, input.thread.id);
    const activity: ThreadActivity.Record = {
      ...prepared,
      id: ThreadActivity.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      threadId: input.thread.id,
      sequence: input.sequence,
      occurredAt: input.occurredAt,
    };
    return yield* journal
      .publish(ThreadActivityFacts.Recorded, {
        groupId: input.thread.groupId,
        activity,
        recipients: input.recipients,
      })
      .pipe(Publication.withOccurredAt(input.occurredAt));
  });

  const publishActivity = Effect.fn("ThreadCommand.publishActivity")(function* <
    A,
    K extends ThreadActivityKind.Definition,
    E,
    R,
  >(input: ActivityInput<A, K, E, R>) {
    const { thread, occurredAt } = input;
    const sequence = yield* nextSequence(thread.id);
    if (input.expectedSequence !== undefined && input.expectedSequence !== sequence)
      return yield* new PositionChanged({ expected: input.expectedSequence, actual: sequence });
    const admitted = yield* admitParticipants(thread, input.admit ?? [], sequence, occurredAt).pipe(
      Publication.withOccurredAt(occurredAt),
    );
    const step = yield* input.step({ thread, sequence, admitted });
    const event = yield* recordActivity({
      thread,
      sequence,
      occurredAt,
      kind: step.kind,
      details: step.details,
      recipients: step.recipients,
    }).pipe(Publication.withCause(step.cause, occurredAt));
    return { value: step.value, event } satisfies ActivityPublished<A>;
  });

  /** The thread a message belongs to, which a message cannot outlive. */
  const threadOf = Effect.fnUntraced(function* (message: {
    readonly threadId: Thread.Id;
  }): Effect.fn.Return<Thread.Record, ThreadStore.Failure> {
    const found = yield* threadStore.get(message.threadId);
    if (Option.isNone(found)) return yield* Effect.die("A message's thread is missing");
    return found.value;
  });

  const publishMessage = Effect.fn("ThreadCommand.publishMessage")(function* (input: MessageInput) {
    yield* Store.Transaction;
    // Recipients come from the selected participants, so an unselected mention would go unheard.
    const selected = new Set(input.participants.map(ThreadParticipation.keyOf));
    if (
      !selected.has(ThreadParticipation.keyOf(authorAsParticipant(input.author))) ||
      input.mentions.some(
        (memberId) => !selected.has(ThreadParticipation.keyOf({ _tag: "Member", memberId })),
      )
    )
      return yield* Effect.die("A message's author and mentions must be selected participants");
    const thread = yield* threadOf(input);
    const published = yield* publishActivity({
      thread,
      occurredAt: input.occurredAt,
      admit: input.participants,
      step: ({ admitted }) =>
        Effect.gen(function* () {
          const message: ThreadMessage.Record = {
            id: input.messageId,
            workspaceId,
            threadId: thread.id,
            author: input.author,
            via: input.via,
            publishedAt: input.occurredAt,
            content: ThreadMessage.published(input.text, input.mentions),
          };
          const fact = yield* journal
            .publish(
              ThreadMessageFacts.Published,
              Object.assign({ groupId: thread.groupId }, message),
            )
            .pipe(Publication.withOccurredAt(input.occurredAt));
          return {
            value: message,
            kind: ThreadMessageActivity.Published,
            details: { messageId: message.id },
            recipients: recipientsOf(input.author, input.mentions, admitted.participants),
            cause: fact,
          };
        }),
    });
    const activity = yield* Effect.orDie(
      ThreadActivityKind.decode(ThreadMessageActivity.Published, published.event.payload.activity),
    );
    return { message: published.value, activity } satisfies MessagePublished;
  });

  /** The task whose description a message is: the thread's task, when the message opened the thread. */
  const describedTask = Effect.fnUntraced(function* (
    thread: Thread.Record,
    message: ThreadMessage.Record,
  ) {
    const task = yield* taskStore.get(thread.id);
    if (Option.isNone(task)) return undefined;
    const [first] = yield* threadActivityStore.getFirst([thread.id]);
    if (first === undefined) return yield* Effect.die("A thread has no first activity");
    const opening = yield* Effect.orDie(
      ThreadActivityKind.decode(ThreadMessageActivity.Published, first),
    );
    return opening.details.messageId === message.id ? task.value : undefined;
  });

  const editMessage = Effect.fn("ThreadCommand.editMessage")(function* (input: EditInput) {
    yield* Store.Transaction;
    const { message } = input;
    if (!ThreadMessage.Content.isAnyOf(["Text"])(message.content))
      return yield* Effect.die("An edited message must still have text");
    const current = message.content;
    const thread = yield* threadOf(message);
    const task = yield* describedTask(thread, message);
    const revision = current.revision + 1;
    // Those the edit newly mentions are admitted and told; the author takes part already, and is
    // selected so the recipients know whether an agent wrote.
    const joining = input.mentions.filter((memberId) => !current.mentions.includes(memberId));
    const edited = yield* publishActivity({
      thread,
      occurredAt: input.occurredAt,
      admit: [
        authorAsParticipant(message.author),
        ...joining.map((memberId) => ({ _tag: "Member" as const, memberId })),
      ],
      step: ({ admitted }) =>
        Effect.gen(function* () {
          const content: ThreadMessage.Content = {
            _tag: "Text",
            text: input.text,
            mentions: input.mentions,
            revision,
            editedAt: input.occurredAt,
          };
          const fact = yield* journal
            .publish(ThreadMessageFacts.Edited, {
              workspaceId,
              threadId: thread.id,
              groupId: thread.groupId,
              messageId: message.id,
              revision,
              text: input.text,
              mentions: input.mentions,
              editedAt: input.occurredAt,
            })
            .pipe(Publication.withOccurredAt(input.occurredAt));
          return {
            value: Object.assign({}, message, { content }) satisfies ThreadMessage.Record,
            kind: ThreadMessageActivity.Edited,
            details: { messageId: message.id, revision },
            recipients:
              task === undefined
                ? recipientsOf(message.author, joining, admitted.participants)
                : Task.recipients(
                    yield* threadQuery.currentParticipants(thread),
                    authorAsParticipant(message.author),
                    Task.asked(task),
                  ),
            cause: fact,
          };
        }),
    });
    const activity = yield* Effect.orDie(
      ThreadActivityKind.decode(ThreadMessageActivity.Edited, edited.event.payload.activity),
    );
    return { message: edited.value, activity } satisfies MessageEdited;
  });

  const deleteMessage = Effect.fn("ThreadCommand.deleteMessage")(function* (input: DeleteInput) {
    yield* Store.Transaction;
    const { message } = input;
    if (ThreadMessage.Content.isAnyOf(["Deleted"])(message.content))
      return yield* Effect.die("A message is deleted once");
    const thread = yield* threadOf(message);
    const deleted = yield* publishActivity({
      thread,
      occurredAt: input.occurredAt,
      step: () =>
        Effect.gen(function* () {
          const content: ThreadMessage.Content = { _tag: "Deleted", deletedAt: input.occurredAt };
          const fact = yield* journal
            .publish(ThreadMessageFacts.Deleted, {
              workspaceId,
              threadId: thread.id,
              groupId: thread.groupId,
              messageId: message.id,
              deletedAt: input.occurredAt,
            })
            .pipe(Publication.withOccurredAt(input.occurredAt));
          return {
            value: Object.assign({}, message, { content }) satisfies ThreadMessage.Record,
            kind: ThreadMessageActivity.Deleted,
            details: { messageId: message.id },
            recipients: [],
            cause: fact,
          };
        }),
    });
    const activity = yield* Effect.orDie(
      ThreadActivityKind.decode(ThreadMessageActivity.Deleted, deleted.event.payload.activity),
    );
    return { message: deleted.value, activity } satisfies MessageDeleted;
  });

  const create = Effect.fn("ThreadCommand.create")(function* (input: CreateInput) {
    const { message, occurredAt } = input;
    const thread: Thread.Record = {
      id: input.threadId,
      workspaceId,
      groupId: input.groupId,
      title: input.title,
      origin: input.origin,
      createdBy: message.author,
      createdAt: occurredAt,
    };
    const created = yield* journal
      .publish(ThreadFacts.Created, thread)
      .pipe(Publication.withOccurredAt(occurredAt));
    const published = yield* publishMessage({
      ...message,
      threadId: thread.id,
      participants: input.participants,
      occurredAt,
    }).pipe(Publication.withCause(created, occurredAt));
    return { thread, message: published.message, activity: published.activity } satisfies Created;
  });

  return ThreadCommand.of({ create, publishMessage, editMessage, deleteMessage, publishActivity });
});

/**
 * Provide the shared writes over the stores, the journal, and the shared reads.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadCommand, make());
