/**
 * The operations on messages an actor calls: publishing a reply, and telling a thread's readers
 * that one is being written. Only people reply through it; an agent's replies come from its turns.
 * A reply authorizes its author and the members it mentions, admits them, and records its
 * recipients, all in one commit.
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
import { HumanAuthorRequired, NotFound, ParticipantUnavailable } from "./ThreadMessageErrors.ts";
import { Notification } from "../notification/notification.ts";
import { Signal } from "../signal/signal.ts";
import { SignalHub } from "../signal/hub.ts";
import type { Thread } from "./Thread.ts";
export { HumanAuthorRequired, NotFound, ParticipantUnavailable } from "./ThreadMessageErrors.ts";

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
  "@amends/core/thread/ThreadMessageService",
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
  return Service.of({ publish, typing });
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
