/**
 * The writes to threads that operations share, run inside the caller's commit: creating a thread,
 * publishing a message, and recording one activity of any kind at the thread's next position.
 * Every domain that records activity goes through `publishActivity`, which takes the position,
 * admits the participants the activity asks for, runs the domain's step, and records the activity
 * the step returns, caused by the fact the step published. The caller owns authorization and the
 * commit; this service checks neither.
 *
 * @since 0.1.0
 */
import { Identity } from "../identity/identity.ts";
import { Notification } from "../notification/notification.ts";
import { Context, Crypto, Effect, Layer, Option, Schema, Predicate } from "effect";
import { type DateTime, type PlatformError } from "effect";
import { Group } from "../group/group.ts";
import type { Event } from "../journal/event.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { TurnId } from "../turn/id.ts";
import { Member } from "../workspace/member/member.ts";
import { Thread } from "./Thread.ts";
import { ThreadFacts } from "./ThreadFacts.ts";
import { ThreadQuery } from "./ThreadQuery.ts";
import { ThreadStore } from "./ThreadStore.ts";
import { ThreadActivity } from "./ThreadActivity.ts";
import { ThreadActivityFacts } from "./ThreadActivityFacts.ts";
import { ThreadActivityKind } from "./ThreadActivityKind.ts";
import { ThreadActivityStore } from "./ThreadActivityStore.ts";
import { ThreadMessage } from "./ThreadMessage.ts";
import { ThreadMessageActivity } from "./ThreadMessageActivity.ts";
import { ThreadMessageFacts } from "./ThreadMessageFacts.ts";
import { ThreadParticipation } from "./ThreadParticipation.ts";
import { ThreadParticipationFacts } from "./ThreadParticipationFacts.ts";

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
  | Unavailable
  | PositionChanged
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;

/**
 * The activity that opens a thread. Task and other opening kinds join this union with their
 * workflows.
 *
 * @category schemas
 * @since 0.1.0
 */
export const First = Schema.TaggedUnion({
  Message: {
    /** The caller names the message, as it names the thread. */
    messageId: ThreadMessage.Id,
    author: ThreadMessage.Author,
    text: ThreadMessage.Text,
    mentions: Schema.UniqueArray(Member.Id),
  },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type First = typeof First.Type;

/**
 * What creates a thread: its ID and group, its title and origin if it has them, who takes part
 * from the start, and its opening activity.
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
  first: First,
  occurredAt: Schema.DateTimeUtcFromString,
});

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/**
 * A created thread and the activity that places its opening message, for the starting workflow.
 *
 * @category models
 * @since 0.1.0
 */
export interface Created extends Thread.Started {
  readonly activity: ThreadMessageActivity.Published;
}

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
  /** The agent's turn posting it as a reply, if one is. */
  turnId: Schema.optionalKey(TurnId.Id),
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
 * The shared writes.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Create a thread, as every workflow that opens one does: record the thread, admit its starting
   * participants at the first position, and publish the opening message with its recipients, so
   * no thread exists without participants or activity. The caller owns authorization and the
   * choice of participants.
   */
  readonly create: (
    input: CreateInput,
  ) => Effect.Effect<Created, Error, Store.Transaction | Publication.Service>;
  /**
   * Publish a message, admitting the participants it selects. The caller authorizes the workflow,
   * its author, and the selected participants; rules such as requiring a human author belong to
   * that caller.
   */
  readonly publishMessage: (
    input: MessageInput,
  ) => Effect.Effect<MessagePublished, Error, Store.Transaction | Publication.Service>;
  /**
   * Publish one activity in the caller's commit: take the thread's next position, admit the
   * participants asked for, run the owning domain's step, and record the activity it returns
   * there, caused by the fact the step published. The caller authorizes the operation.
   */
  readonly publishActivity: <A, K extends ThreadActivityKind.Definition, E, R>(
    input: ActivityInput<A, K, E, R>,
  ) => Effect.Effect<ActivityPublished<A>, E | Error, R | Store.Transaction | Publication.Service>;
}

/**
 * The shared writes of threads. Internal: not among `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 * @effect-expect-leaking Transaction
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/ThreadCommand",
) {}

/** The participant an author publishes as. */
const authorAsParticipant = (author: ThreadMessage.Author): ThreadParticipation.Reference =>
  ThreadMessage.Author.isAnyOf(["Member"])(author)
    ? { _tag: "Member", memberId: author.memberId }
    : { _tag: "Contact", contactId: author.contactId };

/**
 * Whom a message notifies, of the participants selected for it. Mentions address members; without
 * them the message reaches every selected participant. A message never notifies its own author,
 * and an agent's message asks no work of other agents, so agents cannot keep setting each other to
 * work.
 */
const recipientsOf = (
  input: MessageInput,
  participants: ReadonlyArray<ThreadParticipation.Record>,
): ReadonlyArray<ThreadActivity.Recipient> => {
  const author = ThreadParticipation.keyOf(authorAsParticipant(input.author));
  const writer = participants.find(
    ({ participant }) => ThreadParticipation.keyOf(participant) === author,
  )?.participant;
  const byAgent =
    Predicate.isTagged(writer, "Member") &&
    Identity.MemberReference.isAnyOf(["Agent"])(writer.identity);
  const addressed = (participant: ThreadParticipation.Participant) => {
    if (ThreadParticipation.keyOf(participant) === author) return false;
    const memberId = ThreadParticipation.memberOf(participant);
    return (
      input.mentions.length === 0 || (memberId !== undefined && input.mentions.includes(memberId))
    );
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
  const threadQuery = yield* ThreadQuery.Service;
  const threadStore = yield* ThreadStore.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

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
    const found = yield* threadStore.get(input.threadId);
    if (Option.isNone(found)) return yield* Effect.die("A published message's thread is missing");
    const thread = found.value;
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
            text: input.text,
            mentions: input.mentions,
            publishedAt: input.occurredAt,
            turnId: input.turnId ?? null,
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
            recipients: recipientsOf(input, admitted.participants),
            cause: fact,
          };
        }),
    });
    const activity = yield* Effect.orDie(
      ThreadActivityKind.decode(ThreadMessageActivity.Published, published.event.payload.activity),
    );
    return { message: published.value, activity } satisfies MessagePublished;
  });

  const create = Effect.fn("ThreadCommand.create")(function* (input: CreateInput) {
    const { first, occurredAt } = input;
    const thread: Thread.Record = {
      id: input.threadId,
      workspaceId,
      groupId: input.groupId,
      title: input.title,
      origin: input.origin,
      createdBy: first.author,
      createdAt: occurredAt,
    };
    const created = yield* journal
      .publish(ThreadFacts.Created, thread)
      .pipe(Publication.withOccurredAt(occurredAt));
    const published = yield* publishMessage({
      messageId: first.messageId,
      threadId: thread.id,
      author: first.author,
      text: first.text,
      mentions: first.mentions,
      participants: input.participants,
      occurredAt,
    }).pipe(Publication.withCause(created, occurredAt));
    return { thread, message: published.message, activity: published.activity } satisfies Created;
  });

  return Service.of({ create, publishMessage, publishActivity });
});

/**
 * Provide the shared writes over the stores, the journal, and the shared reads.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make());

export * as ThreadCommand from "./ThreadCommand.ts";
