import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Actor } from "../identity/actor.ts";
import { Group } from "../group/group.ts";
import { GroupAudience } from "../group/audience.ts";
import { GroupMembershipStore } from "../group/membership/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Thread } from "./thread.ts";
import { ThreadStore } from "./store.ts";
import { ThreadCommand } from "./command.ts";
import { GroupStore } from "../group/store.ts";
import { DirectGroups } from "../group/direct.ts";
import { GroupFollowStore } from "../group/follow/store.ts";
import { ThreadQuery } from "./query.ts";
import { ThreadPermissions } from "./permissions.ts";
import { ThreadMessageStore } from "./message/store.ts";
import { ThreadParticipation } from "./participation/participation.ts";
import { ThreadParticipationStore } from "./participation/store.ts";
import { ThreadActivityResolvers } from "./activity/resolvers.ts";
import { ThreadActivityStore } from "./activity/store.ts";
import { ThreadActivity } from "./activity/activity.ts";
import { ThreadActivityKind } from "./activity/kind.ts";
import { ThreadMessageActivity } from "./message/activity.ts";
import { ThreadMessage } from "./message/message.ts";
import { ThreadReading } from "../attention/reading.ts";
import { ReadStateStore } from "../attention/store.ts";
import { Request } from "../request/request.ts";
import {
  DirectMembersRequired,
  GroupNotFound,
  HumanAuthorRequired,
  NotFound,
  ParticipantUnavailable,
} from "./errors.ts";
import { Notification } from "../notification/notification.ts";
export {
  DirectMembersRequired,
  GroupNotFound,
  HumanAuthorRequired,
  NotFound,
  ParticipantUnavailable,
} from "./errors.ts";
export type Error =
  | Authorization.Error
  | Exclude<ThreadCommand.Error, ThreadCommand.Unavailable>
  | Exclude<DirectGroups.Error, DirectGroups.Unavailable>
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | GroupFollowStore.Failure
  | ThreadReading.Error
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | GroupNotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | DirectMembersRequired
  | ThreadStore.Failure
  | ThreadMessageStore.Failure
  | ThreadActivityStore.Failure;
export type ReadError =
  | ReadStateStore.Failure
  | Authorization.Error
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | ThreadStore.Failure
  | ThreadMessageStore.Failure
  | ThreadActivityStore.Failure
  | ThreadActivityResolvers.Failure
  | ThreadParticipationStore.Failure
  | Schema.SchemaError
  | GroupNotFound
  | NotFound;
export interface Interface {
  /**
   * Start a thread in a group the author belongs to. A team thread starts with its author,
   * mentioned members, and the group's followers; the rest of the group can read it without
   * participating. A direct-group thread enrolls all of its members, and mentions only narrow who
   * is notified. Only mentioned agents need the author's agent-use authority.
   */
  readonly startInGroup: (
    input: Thread.StartInGroupInput,
    options?: Request.Options,
  ) => Effect.Effect<Thread.Started, Error, Actor.Service>;
  /**
   * Establish or reuse the direct group for the author and the given members, then start a
   * thread with all of them. Needs active membership, agent use for every named agent, and
   * thread.start on the direct group; no group-management permission.
   */
  readonly startDirect: (
    input: Thread.StartDirectInput,
    options?: Request.Options,
  ) => Effect.Effect<Thread.Started, Error, Actor.Service>;
  /** Current group audience plus thread.read. Reading creates no participation or acknowledgment. */
  readonly get: (threadId: Thread.Id) => Effect.Effect<Thread.Record, ReadError, Actor.Service>;
  /**
   * One page of a group's threads the actor can read, newest latest activity first, each with the
   * actor's read position and unread state. Requires current group membership; `thread.read` is
   * checked for the whole page at once, and threads it does not cover are skipped.
   */
  readonly listInGroup: (
    groupId: Group.Id,
    options: Thread.ListOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.ListItem>, ReadError, Actor.Service>;
  /**
   * One page of a group's threads the actor can read, newest start first, as its stream shows them:
   * each with its opening message, reply count, latest message, and the actor's position and unread
   * state, under the same rules as `listInGroup`. A page reads a fixed number of times, however
   * many threads it holds.
   */
  readonly listOpenings: (
    groupId: Group.Id,
    options: Thread.OpeningOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.Opening>, ReadError, Actor.Service>;
  /** Bounded activity page with resolved subjects, ordered by sequence. The cursor is exclusive. */
  readonly readTimeline: (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, ReadError, Actor.Service>;
  /**
   * A page of current participants: active participations backed by current workspace and group
   * admissions, in participation-ID order after the exclusive cursor, with public member
   * references only.
   */
  readonly listParticipants: (
    threadId: Thread.Id,
    options: ThreadParticipation.ListOptions,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Summary>, ReadError, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/application/Service",
) {}
/** Capture bound services; authorize the complete requested conversation inside its commit. @category constructors */
export const make = Effect.fn("ThreadApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const groupAudience = yield* GroupAudience.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const groupStore = yield* GroupStore.Service;
  const directGroups = yield* DirectGroups.Service;
  const groupFollowStore = yield* GroupFollowStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadStore = yield* ThreadStore.Service;
  const readStateStore = yield* ReadStateStore.Service;
  const threadReading = yield* ThreadReading.Service;
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
  /**
   * The IDs a start gives its thread and opening message. Without a key they are new each time. A
   * keyed start derives them from its author and key, so a retry names what its first attempt
   * started.
   */
  const deriveStartIds = Effect.fnUntraced(function* (
    operation: string,
    key: Request.Key | undefined,
  ) {
    const actor = yield* Actor.Service;
    const parts = [operation, workspaceId, actor.memberId];
    const threadId = Thread.Id.make(yield* Request.idFor(key, [...parts, "thread"]));
    const messageId = ThreadMessage.Id.make(yield* Request.idFor(key, [...parts, "message"]));
    return { threadId, messageId };
  });
  /** What an earlier attempt of this keyed start created, so a retry returns it; None otherwise. */
  const findRetriedStart = Effect.fnUntraced(function* (
    key: Request.Key | undefined,
    ids: { readonly threadId: Thread.Id; readonly messageId: ThreadMessage.Id },
  ) {
    if (key === undefined) return Option.none<Thread.Started>();
    const thread = yield* threadStore.get(ids.threadId);
    if (Option.isNone(thread)) return Option.none<Thread.Started>();
    const message = yield* threadMessageStore.get(ids.messageId);
    if (Option.isNone(message))
      return yield* Effect.die("A started thread's opening message is missing");
    return Option.some<Thread.Started>({ thread: thread.value, message: message.value });
  });
  /**
   * Require every starting participant to be able to take part, and the author's agent-use grant
   * for each agent the author names. Agents that take part without being named need none.
   */
  const authorizeParticipants = Effect.fnUntraced(function* (
    participants: ReadonlyArray<Member.Id>,
    named: ReadonlyArray<Member.Id>,
    eligible: ReadonlyMap<Member.Id, ThreadQuery.Eligible>,
  ) {
    for (const memberId of participants)
      if (!eligible.has(memberId)) return yield* new ParticipantUnavailable({ memberId });
    for (const memberId of named) {
      const member = eligible.get(memberId)?.member;
      if (member === undefined) return yield* new ParticipantUnavailable({ memberId });
      if (member.identity._tag === "Agent")
        yield* authorization.require([
          Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
        ]);
    }
  });
  /** Create the thread with its author's opening message, which the author has then read. */
  const createThread = Effect.fnUntraced(function* (
    author: ThreadReading.Reader,
    groupId: Group.Id,
    participants: ReadonlyArray<Member.Id>,
    message: {
      readonly text: Thread.StartInGroupInput["text"];
      readonly mentions: ReadonlyArray<Member.Id>;
    },
    ids: { readonly threadId: Thread.Id; readonly messageId: ThreadMessage.Id },
  ) {
    const started = yield* threadCommand
      .create({
        threadId: ids.threadId,
        groupId,
        participants: participants.map((memberId) => ({ _tag: "Member" as const, memberId })),
        first: {
          _tag: "Message",
          messageId: ids.messageId,
          author: { _tag: "Member", memberId: author.memberId },
          text: message.text,
          mentions: message.mentions,
        },
        occurredAt: yield* DateTime.now,
      })
      .pipe(
        Effect.catchTag("ThreadCommand.Unavailable", (error) =>
          Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
        ),
      );
    // Posting reads the thread through the author's own message.
    yield* threadReading.markRead(author, started.thread, started.activity.sequence);
    return { thread: started.thread, message: started.message } satisfies Thread.Started;
  });
  const startDirect = Effect.fn("ThreadApplication.startDirect")(
    function* (input: Thread.StartDirectInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartDirectInput)(input);
      yield* authorization.require([]);
      const actor = yield* Actor.Service;
      if (actor.identity._tag !== "Human")
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const author = Notification.ofMember(actor.memberId, actor.identity);
      const memberIds = Group.directMembers([actor.memberId, ...request.memberIds]);
      if (memberIds.length < 2) return yield* new DirectMembersRequired({});
      const missing = request.mentions.find((id) => !memberIds.includes(id));
      if (missing !== undefined) return yield* new ParticipantUnavailable({ memberId: missing });
      const { group, created } = yield* directGroups
        .establish(memberIds, actor.memberId, yield* DateTime.now)
        .pipe(
          Effect.catchTag("DirectGroups.Unavailable", (error) =>
            Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
          ),
        );
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, {
          _tag: "Group",
          workspaceId,
          groupId: group.id,
        }),
      ]);
      const ids = yield* deriveStartIds("thread.start-direct", options.requestKey);
      const retried = yield* findRetriedStart(options.requestKey, ids);
      if (Option.isSome(retried)) return retried.value;
      const eligible = yield* threadQuery.eligibleMembers(group.id, memberIds);
      // Creating the group gives its agents a place in all of its threads, as making an agent
      // follow a team group does, so it needs agent use on each; later starts name only mentions.
      yield* authorizeParticipants(memberIds, created ? memberIds : request.mentions, eligible);
      return yield* createThread(author, group.id, memberIds, request, ids);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const startInGroup = Effect.fn("ThreadApplication.startInGroup")(
    function* (input: Thread.StartInGroupInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartInGroupInput)(input);
      yield* groupAudience
        .require(request.groupId)
        .pipe(
          Effect.catchTag("GroupAudience.NotMember", () =>
            Effect.fail(new GroupNotFound({ groupId: request.groupId })),
          ),
        );
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, {
          _tag: "Group",
          workspaceId,
          groupId: request.groupId,
        }),
      ]);
      const actor = yield* Actor.Service;
      if (actor.identity._tag !== "Human")
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const author = Notification.ofMember(actor.memberId, actor.identity);
      const ids = yield* deriveStartIds("thread.start", options.requestKey);
      const retried = yield* findRetriedStart(options.requestKey, ids);
      if (Option.isSome(retried)) return retried.value;
      const foundGroup = yield* groupStore.get(request.groupId);
      if (Option.isNone(foundGroup)) return yield* Effect.die("An audience's group is missing");
      const group = foundGroup.value;
      // A direct group's members all take part; a team thread starts with its author, the
      // members its opening message mentions, and the group's followers. The rest of the group
      // sees it as unread, so only these members' admissions are read.
      // Whether a follow counts depends on its member's current admission.
      const followed =
        group.kind === "Direct" ? [] : yield* groupFollowStore.listActiveByGroup(request.groupId);
      const involved =
        group.kind === "Direct"
          ? group.memberIds
          : [...request.mentions, ...followed.map((follow) => follow.memberId)];
      const eligible = yield* threadQuery.eligibleMembers(request.groupId, [
        actor.memberId,
        ...involved,
      ]);
      // A follow counts only through the member's current admission.
      const followers = followed
        .filter(
          (follow) => eligible.get(follow.memberId)?.admission.id === follow.groupMembershipId,
        )
        .map((follow) => follow.memberId)
        .sort();
      const selected =
        group.kind === "Direct"
          ? [...eligible.keys()].sort()
          : [...new Set([actor.memberId, ...request.mentions, ...followers])];
      yield* authorizeParticipants(selected, request.mentions, eligible);
      return yield* createThread(author, request.groupId, selected, request, ids);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  // All read entry points use this check before exposing conversation data. It is deliberately
  // outside journal.commit; an enclosing caller transaction remains authoritative when present.
  const get = Effect.fn("ThreadApplication.get")(function* (threadId: Thread.Id) {
    const thread = yield* threadQuery
      .requireAccess(threadId)
      .pipe(
        Effect.catchTag("ThreadQuery.NotFound", (error) =>
          Effect.fail(new NotFound({ threadId: error.threadId })),
        ),
      );
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    return thread;
  });
  /**
   * Fill a page with a group's threads the actor can read, from one store listing, reading further
   * when grants skip some. Each comes with its latest activity and the actor's position.
   */
  const listReadableThreads = Effect.fnUntraced(function* <Cursor>(
    groupId: Group.Id,
    limit: number,
    first: Cursor | undefined,
    list: (
      id: Group.Id,
      before: Cursor | undefined,
    ) => Effect.Effect<ReadonlyArray<Thread.Record>, ThreadStore.Failure>,
    cursorOf: (thread: Thread.Record, latest: Thread.Latest) => Cursor,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    const admission = yield* groupAudience
      .require(id)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId: id })),
        ),
      );
    const actor = yield* Actor.Service;
    const items: Array<Thread.ListItem> = [];
    let before = first;
    while (items.length < limit) {
      const page = yield* list(id, before);
      if (page.length === 0) break;
      const ids = page.map((thread) => thread.id);
      const latest = new Map(
        (yield* threadStore.getLatest(ids)).map((value) => [value.threadId, value] as const),
      );
      const allowed = yield* authorization.permitted(
        ids.map((threadId) =>
          Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId }),
        ),
      );
      const readableIds = ids.filter((_, index) => allowed[index] === true);
      const positions = new Map(
        (yield* readStateStore.getThreadPositions(actor.memberId, readableIds)).map(
          (position) => [position.threadId, position.readThrough] as const,
        ),
      );
      for (const [index, thread] of page.entries()) {
        const current = latest.get(thread.id);
        if (current === undefined)
          return yield* Effect.die("A listed thread has no recorded activity");
        before = cursorOf(thread, current);
        if (allowed[index] !== true || items.length === limit) continue;
        const readThrough = positions.get(thread.id) ?? null;
        items.push({
          thread,
          latest: current,
          readThrough,
          // A thread never read is new only if its latest message came after the reader joined.
          unread:
            readThrough === null
              ? DateTime.isGreaterThan(current.occurredAt, admission.admittedAt)
              : current.sequence > readThrough,
        });
      }
      if (page.length < limit) break;
    }
    return items;
  });
  const listInGroup = Effect.fn("ThreadApplication.listInGroup")(function* (
    groupId: Group.Id,
    input: Thread.ListOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Thread.ListOptions))(input);
    return yield* listReadableThreads(
      groupId,
      options.limit,
      options.before,
      (id, before) =>
        threadStore.listByLatest(
          id,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit },
        ),
      (thread, latest): Thread.ListCursor => ({
        latestActivityAt: latest.occurredAt,
        threadId: thread.id,
      }),
    );
  });
  const messagePublishedKind = ThreadActivity.Kind.make(ThreadMessageActivity.Published.name);
  const listOpenings = Effect.fn("ThreadApplication.listOpenings")(function* (
    groupId: Group.Id,
    input: Thread.OpeningOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Thread.OpeningOptions))(input);
    const items = yield* listReadableThreads(
      groupId,
      options.limit,
      options.before,
      (id, before) =>
        threadStore.listByStart(
          id,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit },
        ),
      (thread): Thread.OpeningCursor => ({ createdAt: thread.createdAt, threadId: thread.id }),
    );
    if (items.length === 0) return [];
    // A start publishes its opening message as the thread's first activity.
    const ids = items.map((item) => item.thread.id);
    const openings = new Map<Thread.Id, ThreadMessage.Id>();
    for (const activity of yield* threadActivityStore.getFirst(ids)) {
      const opening = yield* Effect.orDie(
        ThreadActivityKind.decode(ThreadMessageActivity.Published, activity),
      );
      openings.set(activity.threadId, opening.details.messageId);
    }
    const found = new Map(
      (yield* threadMessageStore.getMany([...openings.values()])).map(
        (message) => [message.id, message] as const,
      ),
    );
    const counts = new Map(
      (yield* threadActivityStore.countByKind(ids, messagePublishedKind)).map(
        (value) => [value.threadId, value.count] as const,
      ),
    );
    const result: Array<Thread.Opening> = [];
    for (const item of items) {
      const messageId = openings.get(item.thread.id);
      const message = messageId === undefined ? undefined : found.get(messageId);
      const count = counts.get(item.thread.id);
      if (message === undefined || count === undefined)
        return yield* Effect.die("A listed thread's opening is missing");
      result.push({
        thread: item.thread,
        message,
        replies: count - 1,
        latest: item.latest,
        readThrough: item.readThrough,
        unread: item.unread,
      });
    }
    return result;
  });
  const readTimeline = Effect.fn("ThreadApplication.readTimeline")(
    (threadId: Thread.Id, options: ThreadActivityStore.ReadOptions) =>
      threadQuery
        .readTimeline(threadId, options)
        .pipe(
          Effect.catchTag("ThreadQuery.NotFound", (error) =>
            Effect.fail(new NotFound({ threadId: error.threadId })),
          ),
        ),
  );
  const listParticipants = Effect.fn("ThreadApplication.listParticipants")(function* (
    threadId: Thread.Id,
    options: ThreadParticipation.ListOptions,
  ) {
    const thread = yield* get(threadId);
    return (yield* threadQuery.pageParticipants(thread, options)).map(
      ThreadParticipation.toSummary,
    );
  });
  return Service.of({
    startInGroup,
    startDirect,
    get,
    listInGroup,
    listOpenings,
    readTimeline,
    listParticipants,
  });
});
/** Provide opening-message workflows and authorized reads; replies use ThreadMessageApplication. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadApplication from "./application.ts";
