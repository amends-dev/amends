/**
 * The operations on messages an actor calls: publishing a reply, editing and deleting one, and
 * telling a thread's readers that a reply is being written. Only people write through it; an
 * agent's replies come from its turns. A reply authorizes its author and the members it mentions,
 * admits them, and records its recipients, all in one commit, and an edit does the same for the
 * members it newly mentions.
 *
 * @since 0.1.0
 */
import { Identity } from "../identity/identity.ts";
import { Context, Crypto, DateTime, Duration, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { AgentPermissions } from "../agent/permissions.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { ThreadCommand } from "./ThreadCommand.ts";
import { ThreadQuery } from "./ThreadQuery.ts";
import { ThreadParticipation } from "./ThreadParticipation.ts";
import type { Member } from "../workspace/member/member.ts";
import { ThreadMessage } from "./ThreadMessage.ts";
import { ThreadMessagePermissions } from "./ThreadMessagePermissions.ts";
import { ReadStateCommand } from "../read-state/command.ts";
import { Request } from "../request/request.ts";
import { ThreadMessageStore } from "./ThreadMessageStore.ts";
import {
  Changed,
  Deleted,
  HumanAuthorRequired,
  MessageNotFound,
  NotAuthor,
  NotFound,
  ParticipantUnavailable,
} from "./ThreadMessageErrors.ts";
import { Notification } from "../notification/notification.ts";
import { Signal } from "../signal/signal.ts";
import { SignalHub } from "../signal/hub.ts";
import type { Thread } from "./Thread.ts";
export {
  Changed,
  Deleted,
  HumanAuthorRequired,
  MessageNotFound,
  NotAuthor,
  NotFound,
  ParticipantUnavailable,
} from "./ThreadMessageErrors.ts";

/**
 * What publishing can fail with: the outcomes in `ThreadMessageErrors`, and the failures of what
 * publishing depends on.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | ReadStateCommand.Error
  | Authorization.Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | NotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | ThreadMessageStore.Failure;

/**
 * What editing a message can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type EditError =
  | Authorization.Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | MessageNotFound
  | HumanAuthorRequired
  | NotAuthor
  | Deleted
  | Changed
  | ParticipantUnavailable
  | ThreadMessageStore.Failure;

/**
 * What deleting a message can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type DeleteError =
  | Authorization.Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | MessageNotFound
  | HumanAuthorRequired
  | ThreadMessageStore.Failure;

/**
 * What saying one is typing can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type TypingError =
  | Authorization.Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound>
  | NotFound;

/**
 * The message operations.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Publish a human reply; join its author and eligible mentions, recording recipients atomically.
   * Mentioned agents need the author's agent-use authority; agents already taking part do not.
   */
  readonly publish: (
    input: ThreadMessage.PublishInput,
    options?: Request.Options,
  ) => Effect.Effect<ThreadMessage.Record, Error, Actor.Service>;
  /**
   * Replace the text and mentions of a message the actor wrote, at its next revision, under
   * `thread.publish` on its thread. The same text and mentions again record nothing; otherwise a
   * revision other than `expectedRevision` is `Changed`, and nothing is recorded. Members the edit
   * newly mentions join and are told, under the rules of a reply; a deleted message is `Deleted`.
   * Returns the message as edited.
   */
  readonly edit: (
    input: ThreadMessage.EditInput,
  ) => Effect.Effect<ThreadMessage.Record, EditError, Actor.Service>;
  /**
   * Delete a message: its own author's under `thread.publish` on the thread, anyone's under
   * `thread.moderate` on the thread's group. Its text is gone, its place in the thread stays, and
   * no one is told; one already deleted records nothing. Returns the message as deleted.
   */
  readonly delete: (
    messageId: ThreadMessage.Id,
  ) => Effect.Effect<ThreadMessage.Record, DeleteError, Actor.Service>;
  /**
   * Tell the thread's readers that the acting member is composing a message there, for the next
   * few seconds. Requires current group access and `thread.publish`, as publishing does. Repeats
   * from the same member in the same thread within a moment are dropped, so a client may send it
   * whenever the member types.
   */
  readonly typing: (threadId: Thread.Id) => Effect.Effect<void, TypingError, Actor.Service>;
}

/**
 * The message operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/thread/ThreadMessageService",
) {}

/**
 * Whom a reply by `authorId` selects to take part: its author, and those it addresses: the
 * members it mentions, or, without mentions, every current participant, contacts and triage
 * included.
 */
const selectedFor = (
  authorId: Member.Id,
  mentions: ReadonlyArray<Member.Id>,
  current: ReadonlyArray<ThreadParticipation.Record>,
): ReadonlyArray<ThreadParticipation.Reference> => {
  const author: ThreadParticipation.Reference = { _tag: "Member", memberId: authorId };
  const addressed: ReadonlyArray<ThreadParticipation.Reference> =
    mentions.length === 0
      ? current.map(({ participant }) => ThreadParticipation.referenceOf(participant))
      : mentions.map((memberId) => ({ _tag: "Member", memberId }));
  const byKey = new Map(
    [author, ...addressed].map((reference) => [ThreadParticipation.keyOf(reference), reference]),
  );
  return [...byKey.values()];
};

/** How long readers show a typing indicator without a repeat. */
const typingFor = Duration.seconds(6);

/** Typing repeats closer than this are dropped. */
const typingEvery = Duration.seconds(2);

/**
 * Capture bound services; authorize each reply inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadMessageService.make")(function* () {
  const authorization = yield* Authorization.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const readStateCommand = yield* ReadStateCommand.Service;
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const signalHub = yield* SignalHub.Service;
  const { workspaceId } = yield* Store.Service;
  /**
   * The ID a reply gives its message. Without a key it is new each time. A keyed reply derives it
   * from its author and key, so a retry names the message its first attempt published.
   */
  const deriveReplyId = Effect.fnUntraced(function* (key: Request.Key | undefined) {
    const actor = yield* Actor.Service;
    return ThreadMessage.Id.make(
      yield* Request.idFor(key, ["thread.reply", workspaceId, actor.memberId]),
    );
  });

  /** The thread, once the actor may read it and publish there. */
  const requirePublishable = Effect.fnUntraced(function* (threadId: Thread.Id) {
    const thread = yield* threadQuery
      .requireAccess(threadId)
      .pipe(
        Effect.catchTag(
          "ThreadQuery.NotFound",
          (error) => new NotFound({ threadId: error.threadId }),
        ),
      );
    yield* authorization.require([
      Requirement.make(ThreadMessagePermissions.Publish, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    return thread;
  });

  /** The message an earlier attempt of this keyed reply published, so a retry returns it. */
  const findRetriedReply = (key: Request.Key | undefined, messageId: ThreadMessage.Id) =>
    key === undefined ? Effect.succeedNone : threadMessageStore.get(messageId);

  /**
   * A message and its thread, once the actor may act in that thread; to anyone outside its group,
   * the message is missing, as a missing one is.
   */
  const requireMessage = Effect.fnUntraced(function* (messageId: ThreadMessage.Id) {
    const found = yield* threadMessageStore.get(messageId);
    if (Option.isNone(found)) return yield* new MessageNotFound({ messageId });
    const thread = yield* threadQuery
      .requireAccess(found.value.threadId)
      .pipe(Effect.catchTag("ThreadQuery.NotFound", () => new MessageNotFound({ messageId })));
    return { message: found.value, thread };
  });

  /** Whether the actor wrote the message; only a member writes through the service. */
  const wroteBy = (message: ThreadMessage.Record, actor: Actor.Value) =>
    ThreadMessage.Author.isAnyOf(["Member"])(message.author) &&
    message.author.memberId === actor.memberId;

  /** Whether two sets of mentions name the same members. */
  const sameMentions = (left: ReadonlyArray<Member.Id>, right: ReadonlyArray<Member.Id>) =>
    left.length === right.length && left.every((memberId) => right.includes(memberId));
  const publish = Effect.fn("ThreadMessageService.publish")(
    function* (input: ThreadMessage.PublishInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(ThreadMessage.PublishInput)(input);
      const thread = yield* requirePublishable(request.threadId);
      const actor = yield* Actor.Service;
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const messageId = yield* deriveReplyId(options.requestKey);
      const retried = yield* findRetriedReply(options.requestKey, messageId);
      if (Option.isSome(retried)) return retried.value;
      // Without mentions a reply addresses every current participant; with them, only the
      // author and those mentioned are read.
      const current =
        request.mentions.length === 0 ? yield* threadQuery.currentParticipants(thread) : [];
      const selected = selectedFor(actor.memberId, request.mentions, current);
      // Current participants already hold a current admission; only the others need checking.
      const participating = new Set(
        current.flatMap(({ participant }) => ThreadParticipation.memberOf(participant) ?? []),
      );
      const joining = selected.flatMap((reference) =>
        ThreadParticipation.Reference.isAnyOf(["Member"])(reference) &&
        !participating.has(reference.memberId)
          ? [reference.memberId]
          : [],
      );
      const eligible = yield* threadQuery.eligibleMembers(thread.groupId, joining);
      for (const reference of selected) {
        if (
          !ThreadParticipation.Reference.isAnyOf(["Member"])(reference) ||
          participating.has(reference.memberId)
        )
          continue;
        const entry = eligible.get(reference.memberId);
        if (entry === undefined)
          return yield* new ParticipantUnavailable({ memberId: reference.memberId });
        // Mentioning an agent directs it; replying where it already takes part does not.
        if (
          Identity.MemberReference.isAnyOf(["Agent"])(entry.member.identity) &&
          request.mentions.includes(reference.memberId)
        )
          yield* authorization.require([
            Requirement.make(AgentPermissions.Use, {
              _tag: "Member",
              workspaceId,
              memberId: reference.memberId,
            }),
          ]);
      }
      const published = yield* threadCommand
        .publishMessage({
          ...request,
          messageId,
          author: { _tag: "Member", memberId: actor.memberId },
          via: null,
          participants: selected,
          occurredAt: yield* DateTime.now,
        })
        .pipe(
          Effect.catchTag(
            "ThreadCommand.Unavailable",
            (error) => new ParticipantUnavailable({ memberId: error.memberId }),
          ),
        );
      // Replying reads the thread through the author's own message.
      yield* readStateCommand.markThreadRead(
        Notification.ofMember(actor.memberId, actor.identity),
        thread,
        published.activity.sequence,
      );
      return published.message;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const edit = Effect.fn("ThreadMessageService.edit")(
    function* (input: ThreadMessage.EditInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.EditInput))(input);
      const { message, thread } = yield* requireMessage(request.messageId);
      const actor = yield* Actor.Service;
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      if (!wroteBy(message, actor)) return yield* new NotAuthor({ messageId: message.id });
      yield* authorization.require([
        Requirement.make(ThreadMessagePermissions.Publish, {
          _tag: "Thread",
          workspaceId,
          threadId: thread.id,
        }),
      ]);
      if (!ThreadMessage.Content.isAnyOf(["Text"])(message.content))
        return yield* new Deleted({ messageId: message.id });
      const content = message.content;
      if (content.text === request.text && sameMentions(content.mentions, request.mentions))
        return message;
      if (content.revision !== request.expectedRevision)
        return yield* new Changed({ messageId: message.id });
      // Those the edit newly mentions must be able to take part, as a reply's mentions must, and
      // newly mentioning an agent not yet taking part directs it, so needs the author's agent use.
      const joining = request.mentions.filter((memberId) => !content.mentions.includes(memberId));
      const participating = new Set(
        (yield* threadQuery.findParticipants(
          thread,
          joining.map((memberId) => ({ _tag: "Member" as const, memberId })),
        )).flatMap(({ participant }) => ThreadParticipation.memberOf(participant) ?? []),
      );
      const eligible = yield* threadQuery.eligibleMembers(thread.groupId, joining);
      for (const memberId of joining) {
        const entry = eligible.get(memberId);
        if (entry === undefined) return yield* new ParticipantUnavailable({ memberId });
        if (
          Identity.MemberReference.isAnyOf(["Agent"])(entry.member.identity) &&
          !participating.has(memberId)
        )
          yield* authorization.require([
            Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
          ]);
      }
      const edited = yield* threadCommand
        .editMessage({
          message,
          text: request.text,
          mentions: request.mentions,
          occurredAt: yield* DateTime.now,
        })
        .pipe(
          Effect.catchTag(
            "ThreadCommand.Unavailable",
            (error) => new ParticipantUnavailable({ memberId: error.memberId }),
          ),
        );
      return edited.message;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const deleteMessage = Effect.fn("ThreadMessageService.delete")(
    function* (messageId: ThreadMessage.Id) {
      const id = yield* Schema.decodeEffect(ThreadMessage.Id)(messageId);
      const { message, thread } = yield* requireMessage(id);
      const actor = yield* Actor.Service;
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      // The author deletes their own message as they published it; anyone else moderates the group.
      yield* authorization.require([
        wroteBy(message, actor)
          ? Requirement.make(ThreadMessagePermissions.Publish, {
              _tag: "Thread",
              workspaceId,
              threadId: thread.id,
            })
          : Requirement.make(ThreadMessagePermissions.Moderate, {
              _tag: "Group",
              workspaceId,
              groupId: thread.groupId,
            }),
      ]);
      if (ThreadMessage.Content.isAnyOf(["Deleted"])(message.content)) return message;
      const deleted = yield* threadCommand
        .deleteMessage({ message, occurredAt: yield* DateTime.now })
        .pipe(
          Effect.catchTag("ThreadCommand.Unavailable", () =>
            Effect.die("A deletion admits no participant"),
          ),
        );
      return deleted.message;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  /** When each member last said they were typing in each thread, in this process. */
  const lastTyping = new Map<string, number>();
  const typing = Effect.fn("ThreadMessageService.typing")(function* (threadId: Thread.Id) {
    const thread = yield* requirePublishable(threadId);
    const actor = yield* Actor.Service;
    const now = yield* DateTime.now;
    const at = DateTime.toEpochMillis(now);
    const key = JSON.stringify([actor.memberId, thread.id]);
    const last = lastTyping.get(key);
    if (last !== undefined && at - last < Duration.toMillis(typingEvery)) return;
    // Forget old entries so the map follows only recent typists.
    if (lastTyping.size > 1024)
      for (const [entry, time] of lastTyping)
        if (at - time >= Duration.toMillis(typingFor)) lastTyping.delete(entry);
    lastTyping.set(key, at);
    yield* signalHub.publish(
      Signal.Value.cases.Typing.make({
        workspaceId,
        groupId: thread.groupId,
        threadId: thread.id,
        memberId: actor.memberId,
        until: DateTime.add(now, { milliseconds: Duration.toMillis(typingFor) }),
      }),
    );
  });
  return Service.of({ publish, edit, delete: deleteMessage, typing });
});

/**
 * Provide the message operations over the shared reads and writes, the stores, authorization, and
 * the workspace's signals.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make());

export * as ThreadMessageService from "./ThreadMessageService.ts";
