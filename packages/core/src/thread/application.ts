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
import { Thread } from "./thread.ts";
import { ThreadStore } from "./store.ts";
import { ThreadStart } from "./start.ts";
import { GroupStore } from "../group/store.ts";
import { DirectGroups } from "../group/direct.ts";
import { GroupFollow } from "../group/follow/follow.ts";
import { GroupFollowStore } from "../group/follow/store.ts";
import type { GroupMembership } from "../group/membership/membership.ts";
import { ThreadAccess } from "./access.ts";
import { ThreadParticipationAdmission } from "./participation/admission.ts";
import { ThreadMessagePublication } from "./message/publication.ts";
import { ThreadPermissions } from "./permissions.ts";
import { ThreadMessageStore } from "./message/store.ts";
import { ThreadParticipation } from "./participation/participation.ts";
import { ThreadParticipationStore } from "./participation/store.ts";
import { ThreadActivityReading } from "./activity/reading.ts";
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
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadApplication.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | Authorization.Error
  | GroupAudience.InvalidResponse
  | Exclude<ThreadStart.Error, ThreadParticipationAdmission.Unavailable>
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
  | ThreadActivityStore.Failure
  | InvalidResponse;
export type ReadError =
  | ReadStateStore.Failure
  | Authorization.Error
  | GroupAudience.InvalidResponse
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | ThreadStore.Failure
  | ThreadMessageStore.Failure
  | ThreadActivityStore.Failure
  | ThreadActivityResolvers.Failure
  | ThreadParticipationStore.Failure
  | Schema.SchemaError
  | GroupNotFound
  | NotFound
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
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
const invalidReadRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Thread storage returned invalid data: ${cause.message}` });
const decodeThread = Schema.decodeEffect(Schema.toType(Thread.Record));
/** Capture bound services; authorize the complete requested conversation inside its commit. @category constructors */
export const make = Effect.fn("ThreadApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const audience = yield* GroupAudience.Service;
  const starts = yield* ThreadStart.Service;
  const groups = yield* GroupStore.Service;
  const directGroups = yield* DirectGroups.Service;
  const follows = yield* GroupFollowStore.Service;
  const access = yield* ThreadAccess.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const publication = yield* ThreadMessagePublication.Service;
  const threads = yield* ThreadStore.Service;
  const reading = yield* ThreadActivityReading.Service;
  const readStates = yield* ReadStateStore.Service;
  const readings = yield* ThreadReading.Service;
  const messages = yield* ThreadMessageStore.Service;
  const activities = yield* ThreadActivityStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      audience.workspaceId,
      starts.workspaceId,
      groups.workspaceId,
      directGroups.workspaceId,
      follows.workspaceId,
      access.workspaceId,
      admissions.workspaceId,
      publication.workspaceId,
      threads.workspaceId,
      reading.workspaceId,
      readStates.workspaceId,
      readings.workspaceId,
      messages.workspaceId,
      activities.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Thread services belong to different workspaces",
    });
  /** A start's thread and opening message, by the IDs its request named; None before it ran. */
  const opening = Effect.fnUntraced(function* (threadId: Thread.Id, messageId: ThreadMessage.Id) {
    const found = yield* threads.get(threadId);
    if (Option.isNone(found)) return Option.none<Thread.Started>();
    const thread = yield* decodeThread(found.value).pipe(Effect.mapError(invalidReadRecord));
    const row = yield* messages.get(messageId);
    if (Option.isNone(row))
      return yield* new InvalidResponse({
        message: "A started thread's opening message is missing",
      });
    const message = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Record))(row.value).pipe(
      Effect.mapError(invalidReadRecord),
    );
    if (
      thread.workspaceId !== workspaceId ||
      thread.id !== threadId ||
      message.id !== messageId ||
      message.threadId !== threadId
    )
      return yield* new InvalidResponse({
        message: "A thread's opening belongs to another thread",
      });
    return Option.some<Thread.Started>({ thread, message });
  });
  /**
   * The IDs a start gives its thread and opening message. Without a key they are new each time. A
   * keyed start derives them from its author and key, so a retry names what its first attempt
   * started and returns it.
   */
  const startIds = Effect.fnUntraced(function* (operation: string, key: Request.Key | undefined) {
    const actor = yield* Actor.Service;
    const parts = [operation, workspaceId, actor.memberId];
    const threadId = Thread.Id.make(yield* Request.idFor(key, [...parts, "thread"]));
    const messageId = ThreadMessage.Id.make(yield* Request.idFor(key, [...parts, "message"]));
    const previous =
      key === undefined ? Option.none<Thread.Started>() : yield* opening(threadId, messageId);
    return { threadId, messageId, previous };
  });

  /** The group's active follows, checked; whether each counts depends on its member's admission. */
  const followsOf = Effect.fnUntraced(function* (groupId: Group.Id) {
    const seen = new Set<GroupFollow.Id>();
    const admissions = new Set<GroupMembership.Id>();
    const result: Array<GroupFollow.Record> = [];
    for (const row of yield* follows.listActiveByGroup(groupId)) {
      const follow = yield* Schema.decodeEffect(Schema.toType(GroupFollow.Record))(row).pipe(
        Effect.mapError(
          (cause) => new InvalidResponse({ message: `Invalid group follow: ${cause.message}` }),
        ),
      );
      if (
        follow.workspaceId !== workspaceId ||
        follow.groupId !== groupId ||
        follow.status !== "active" ||
        seen.has(follow.id) ||
        admissions.has(follow.groupMembershipId)
      )
        return yield* new InvalidResponse({
          message: "Follow store returned an inconsistent group listing",
        });
      seen.add(follow.id);
      admissions.add(follow.groupMembershipId);
      result.push(follow);
    }
    return result;
  });
  /**
   * Check the starting participants, authorize the agents the author names, then open the thread
   * through the shared start. Agents that take part without being named need no agent-use grant.
   */
  const begin = Effect.fnUntraced(function* (
    groupId: Group.Id,
    selected: ReadonlyArray<Member.Id>,
    named: ReadonlyArray<Member.Id>,
    eligible: ReadonlyMap<Member.Id, ThreadParticipationAdmission.Eligible>,
    message: {
      readonly text: Thread.StartInGroupInput["text"];
      readonly mentions: ReadonlyArray<Member.Id>;
    },
    ids: { readonly threadId: Thread.Id; readonly messageId: ThreadMessage.Id },
  ) {
    const actor = yield* Actor.Service;
    for (const memberId of selected)
      if (!eligible.has(memberId)) return yield* new ParticipantUnavailable({ memberId });
    for (const memberId of named) {
      const member = eligible.get(memberId)?.member;
      if (member === undefined) return yield* new ParticipantUnavailable({ memberId });
      if (member.identity._tag === "Agent")
        yield* authorization.require([
          Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
        ]);
    }
    if (actor.identity._tag !== "Human")
      return yield* new HumanAuthorRequired({ memberId: actor.memberId });
    const started = yield* starts
      .start({
        threadId: ids.threadId,
        groupId,
        participants: selected.map((memberId) => ({ _tag: "Member" as const, memberId })),
        first: {
          _tag: "Message",
          messageId: ids.messageId,
          author: { _tag: "Member", memberId: actor.memberId },
          text: message.text,
          mentions: message.mentions,
        },
        occurredAt: yield* DateTime.now,
      })
      .pipe(
        Effect.catchTag("ThreadParticipationAdmission.Unavailable", (error) =>
          Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
        ),
      );
    // Posting reads the thread through the author's own message.
    yield* readings.markRead(
      Notification.ofMember(actor.memberId, actor.identity),
      started.thread,
      started.activity.sequence,
    );
    return { thread: started.thread, message: started.message } satisfies Thread.Started;
  });
  const startDirect = Effect.fn("ThreadApplication.startDirect")(
    function* (input: Thread.StartDirectInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartDirectInput)(input);
      yield* authorization.require([]);
      const actor = yield* Actor.Service;
      if (actor.identity._tag !== "Human")
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
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
      const { previous, ...ids } = yield* startIds("thread.start-direct", options.requestKey);
      if (Option.isSome(previous)) return previous.value;
      const eligible = yield* admissions
        .eligible(group.id, memberIds)
        .pipe(
          Effect.catchTag("ThreadParticipationAdmission.InvalidResponse", (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          ),
        );
      // Creating the group gives its agents a place in all of its threads, as making an agent
      // follow a team group does, so it needs agent use on each; later starts name only mentions.
      const named = created ? memberIds : request.mentions;
      return yield* begin(group.id, memberIds, named, eligible, request, ids);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const startInGroup = Effect.fn("ThreadApplication.startInGroup")(
    function* (input: Thread.StartInGroupInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartInGroupInput)(input);
      const authorAdmission = yield* audience
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
      const { previous, ...ids } = yield* startIds("thread.start", options.requestKey);
      if (Option.isSome(previous)) return previous.value;
      const foundGroup = yield* groups.get(request.groupId);
      if (Option.isNone(foundGroup))
        return yield* new InvalidResponse({ message: "Audience group is missing" });
      const group = foundGroup.value;
      // A direct group's members all take part; a team thread starts with its author, the
      // members its opening message mentions, and the group's followers. The rest of the group
      // sees it as unread, so only these members' admissions are read.
      const followed = group.kind === "Direct" ? [] : yield* followsOf(request.groupId);
      const involved =
        group.kind === "Direct"
          ? group.memberIds
          : [...request.mentions, ...followed.map((follow) => follow.memberId)];
      const eligible = yield* admissions
        .eligible(request.groupId, [actor.memberId, ...involved])
        .pipe(
          Effect.catchTag("ThreadParticipationAdmission.InvalidResponse", (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          ),
        );
      if (eligible.get(actor.memberId)?.admission.id !== authorAdmission.id)
        return yield* new InvalidResponse({
          message: "Admission lookup omitted the author's current admission",
        });
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
      const missing = request.mentions.find((id) => !eligible.has(id));
      if (missing !== undefined) return yield* new ParticipantUnavailable({ memberId: missing });
      return yield* begin(request.groupId, selected, request.mentions, eligible, request, ids);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  // All read entry points use this check before exposing conversation data. It is deliberately
  // outside journal.commit; an enclosing caller transaction remains authoritative when present.
  const get = Effect.fn("ThreadApplication.get")(function* (threadId: Thread.Id) {
    const thread = yield* access.require(threadId).pipe(
      Effect.catchTags({
        "ThreadAccess.NotFound": (error) => Effect.fail(new NotFound({ threadId: error.threadId })),
        "ThreadAccess.InvalidResponse": (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
      }),
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
  const readablePage = Effect.fnUntraced(function* <Cursor>(
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
    const admission = yield* audience
      .require(id)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId: id })),
        ),
      );
    const actor = yield* Actor.Service;
    const seen = new Set<Thread.Id>();
    const items: Array<Thread.ListItem> = [];
    let before = first;
    while (items.length < limit) {
      const page: Array<Thread.Record> = [];
      for (const found of yield* list(id, before)) {
        const thread = yield* decodeThread(found).pipe(Effect.mapError(invalidReadRecord));
        if (thread.workspaceId !== workspaceId || thread.groupId !== id || seen.has(thread.id))
          return yield* new InvalidResponse({
            message: "Thread store returned an inconsistent group listing",
          });
        seen.add(thread.id);
        page.push(thread);
      }
      if (page.length === 0) break;
      const ids = page.map((thread) => thread.id);
      const latest = new Map<Thread.Id, Thread.Latest>();
      for (const row of yield* threads.getLatest(ids)) {
        const value = yield* Schema.decodeEffect(Schema.toType(Thread.Latest))(row).pipe(
          Effect.mapError(invalidReadRecord),
        );
        if (!seen.has(value.threadId) || latest.has(value.threadId))
          return yield* new InvalidResponse({
            message: "Thread store returned activity for another thread",
          });
        latest.set(value.threadId, value);
      }
      const allowed = yield* authorization.permitted(
        ids.map((threadId) =>
          Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId }),
        ),
      );
      const readableIds = ids.filter((_, index) => allowed[index] === true);
      const positions = new Map<Thread.Id, number>();
      for (const position of yield* readStates.getThreadPositions(actor.memberId, readableIds)) {
        if (
          position.workspaceId !== workspaceId ||
          position.memberId !== actor.memberId ||
          !readableIds.includes(position.threadId)
        )
          return yield* new InvalidResponse({
            message: "Read-state store returned another member's or thread's position",
          });
        positions.set(position.threadId, position.readThrough);
      }
      for (const [index, thread] of page.entries()) {
        const current = latest.get(thread.id);
        if (current === undefined)
          return yield* new InvalidResponse({ message: "Listed thread has no recorded activity" });
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
    return yield* readablePage(
      groupId,
      options.limit,
      options.before,
      (id, before) =>
        threads.listByLatest(
          id,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit },
        ),
      (thread, latest): Thread.ListCursor => ({
        latestActivityAt: latest.occurredAt,
        threadId: thread.id,
      }),
    );
  });
  const published = ThreadActivity.Kind.make(ThreadMessageActivity.Published.name);
  const listOpenings = Effect.fn("ThreadApplication.listOpenings")(function* (
    groupId: Group.Id,
    input: Thread.OpeningOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Thread.OpeningOptions))(input);
    const items = yield* readablePage(
      groupId,
      options.limit,
      options.before,
      (id, before) =>
        threads.listByStart(
          id,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit },
        ),
      (thread): Thread.OpeningCursor => ({ createdAt: thread.createdAt, threadId: thread.id }),
    );
    if (items.length === 0) return [];
    // A start publishes its opening message as the thread's first activity.
    const ids = items.map((item) => item.thread.id);
    const openings = new Map<Thread.Id, ThreadMessage.Id>();
    for (const row of yield* activities.getFirst(ids)) {
      const activity = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(row).pipe(
        Effect.mapError(invalidReadRecord),
      );
      if (
        activity.workspaceId !== workspaceId ||
        !ids.includes(activity.threadId) ||
        openings.has(activity.threadId) ||
        activity.sequence !== 1
      )
        return yield* new InvalidResponse({
          message: "Activity store returned another thread's or a later activity",
        });
      const opening = yield* ThreadActivityKind.decode(
        ThreadMessageActivity.Published,
        activity,
      ).pipe(
        Effect.mapError(
          () => new InvalidResponse({ message: "A thread does not open with a message" }),
        ),
      );
      openings.set(activity.threadId, opening.details.messageId);
    }
    const found = new Map<ThreadMessage.Id, ThreadMessage.Record>();
    for (const row of yield* messages.getMany([...openings.values()])) {
      const message = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Record))(row).pipe(
        Effect.mapError(invalidReadRecord),
      );
      if (message.workspaceId !== workspaceId || openings.get(message.threadId) !== message.id)
        return yield* new InvalidResponse({
          message: "Message store returned another thread's or workspace's message",
        });
      found.set(message.id, message);
    }
    const counts = new Map<Thread.Id, number>();
    for (const row of yield* activities.countByKind(ids, published)) {
      const value = yield* Schema.decodeEffect(Schema.toType(ThreadActivityStore.Count))(row).pipe(
        Effect.mapError(invalidReadRecord),
      );
      if (!ids.includes(value.threadId) || counts.has(value.threadId))
        return yield* new InvalidResponse({
          message: "Activity store counted another thread",
        });
      counts.set(value.threadId, value.count);
    }
    return yield* Effect.forEach(items, (item) => {
      const messageId = openings.get(item.thread.id);
      const message = messageId === undefined ? undefined : found.get(messageId);
      const count = counts.get(item.thread.id);
      return message === undefined || count === undefined
        ? Effect.fail(new InvalidResponse({ message: "A listed thread's opening is missing" }))
        : Effect.succeed({
            thread: item.thread,
            message,
            replies: count - 1,
            latest: item.latest,
            readThrough: item.readThrough,
            unread: item.unread,
          } satisfies Thread.Opening);
    });
  });
  const readTimeline = Effect.fn("ThreadApplication.readTimeline")(
    (threadId: Thread.Id, options: ThreadActivityStore.ReadOptions) =>
      reading.page(threadId, options).pipe(
        Effect.catchTags({
          "ThreadAccess.NotFound": (error) =>
            Effect.fail(new NotFound({ threadId: error.threadId })),
          "ThreadAccess.InvalidResponse": (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          "ThreadActivityReading.InvalidResponse": (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          "ThreadActivityReading.NotFound": () =>
            Effect.fail(new InvalidResponse({ message: "Timeline activity is missing" })),
        }),
      ),
  );
  const listParticipants = Effect.fn("ThreadApplication.listParticipants")(function* (
    threadId: Thread.Id,
    options: ThreadParticipation.ListOptions,
  ) {
    const thread = yield* get(threadId);
    const participants = yield* admissions
      .page(thread, options)
      .pipe(
        Effect.catchTag("ThreadParticipationAdmission.InvalidResponse", (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
        ),
      );
    return participants.map(ThreadParticipation.toSummary);
  });
  return Service.of({
    workspaceId,
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
