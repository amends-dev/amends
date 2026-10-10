/**
 * The reads of threads that operations share: whether the actor may reach a thread, who may take
 * part in a group's threads, who takes part in a thread now, a page of a group's threads the actor
 * can read, and a thread's timeline resolved into items. The thread, task, turn, read-state, signal,
 * and notification operations all read through it. It writes nothing and checks no action
 * permission but `thread.read`; each operation checks its own, inside its commit when it writes.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { GroupFollowStore } from "../group/follow/store.ts";
import { Group } from "../group/group.ts";
import { GroupQuery } from "../group/query.ts";
import { GroupMembership } from "../group/membership/membership.ts";
import { GroupMembershipStore } from "../group/membership/store.ts";
import { Actor } from "../identity/actor.ts";
import { Store } from "../journal/store.ts";
import { ReadStateStore } from "../read-state/store.ts";
import { TaskStore } from "../task/TaskStore.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Thread } from "./Thread.ts";
import { ThreadStore } from "./ThreadStore.ts";
import { ThreadPermissions } from "./ThreadPermissions.ts";
import { ThreadParticipation } from "./ThreadParticipation.ts";
import { ThreadParticipationStore } from "./ThreadParticipationStore.ts";
import { ThreadActivity } from "./ThreadActivity.ts";
import { ThreadActivityResolvers } from "./ThreadActivityResolvers.ts";
import { ThreadActivityStore } from "./ThreadActivityStore.ts";

/**
 * The thread is missing, or outside the actor's group audience; the two are not told apart, so
 * nothing discloses whether a thread exists. Operations map it to their own outcome.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadQuery.NotFound", {
  threadId: Thread.Id,
}) {}

/**
 * A member who may take part in a group's threads: a current admission and active membership.
 *
 * @category models
 * @since 0.1.0
 */
export interface Eligible {
  readonly admission: GroupMembership.Record;
  readonly member: Member.Record;
}

/**
 * What checking access to a thread can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type AccessError =
  | Authorization.Error
  | GroupMembershipStore.Failure
  | ThreadStore.Failure
  | Schema.SchemaError
  | NotFound;

/**
 * What reading participants can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ParticipantsError =
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | ThreadParticipationStore.Failure;

/**
 * What reading a group's followers can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type FollowersError = ParticipantsError | GroupFollowStore.Failure;

/**
 * What reading a timeline can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type TimelineError =
  | AccessError
  | ThreadActivityStore.Failure
  | ThreadActivityResolvers.Failure;

/**
 * What listing a group's readable threads can fail with, beyond the listing's own failures.
 *
 * @category errors
 * @since 0.1.0
 */
export type ListError =
  | GroupQuery.NotMember
  | Authorization.Error
  | GroupMembershipStore.Failure
  | ThreadStore.Failure
  | TaskStore.Failure
  | ReadStateStore.Failure
  | Schema.SchemaError;

/**
 * How a page of a group's threads is listed: what lists the rows in the page's order, the thread
 * each row is about, and the cursor the next page starts after.
 *
 * @category options
 * @since 0.1.0
 */
export interface ListOptions<R, Cursor, E> {
  readonly limit: number;
  /** The exclusive cursor the page starts after, or none for the first page. */
  readonly first: Cursor | undefined;
  /** At most `limit` rows after the cursor, in the page's order. */
  readonly list: (before: Cursor | undefined) => Effect.Effect<ReadonlyArray<R>, E>;
  readonly threadOf: (row: R) => Thread.Record;
  /** The cursor after a listed row, given the row's thread's latest activity. */
  readonly cursorOf: (row: R, latest: Thread.Latest) => Cursor;
}

/**
 * The shared reads.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  /**
   * The thread, under its audience alone. Operations check their action permission separately,
   * inside the commit for writes.
   */
  readonly requireAccess: (
    threadId: Thread.Id,
  ) => Effect.Effect<Thread.Record, AccessError, Actor.Service>;

  /** The thread, under its audience and `thread.read`, as every read of its conversation needs. */
  readonly requireReadable: (
    threadId: Thread.Id,
  ) => Effect.Effect<Thread.Record, AccessError, Actor.Service>;
  /**
   * Those of the given members with a current admission to the group and active workspace
   * membership, with both records. Reads only the members asked about.
   */
  readonly eligibleMembers: (
    groupId: Group.Id,
    memberIds: ReadonlyArray<Member.Id>,
  ) => Effect.Effect<ReadonlyMap<Member.Id, Eligible>, ParticipantsError>;
  /**
   * The group's followers whose follow is through their current admission, with both records, in
   * follow order: those a new thread in the group admits.
   */
  readonly followers: (groupId: Group.Id) => Effect.Effect<ReadonlyArray<Eligible>, FollowersError>;
  /**
   * Every current participant: an active participation whose member, if any, still has a current
   * group admission. Read in pages; a reply that addresses everyone needs them all.
   */
  readonly currentParticipants: (
    thread: Thread.Record,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, ParticipantsError>;
  /**
   * A page of current participants in participation-ID order after the cursor. Stored
   * participants that have lapsed are skipped, and reading continues to fill the page.
   */
  readonly pageParticipants: (
    thread: Thread.Record,
    options: ThreadParticipation.ListOptions,
  ) => Effect.Effect<
    ReadonlyArray<ThreadParticipation.Record>,
    ParticipantsError | Schema.SchemaError
  >;
  /** The current participations of these participants, reading only them. */
  readonly findParticipants: (
    thread: Thread.Record,
    participants: ReadonlyArray<ThreadParticipation.Reference>,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, ParticipantsError>;
  /**
   * Fill a page with a group's threads the actor can read, from the rows `options.list` gives in
   * the page's order, reading further when grants skip some: each thread with its task, if any,
   * its latest activity, and the actor's read position and unread state. Requires current group
   * membership; `thread.read` is checked for the whole page at once, and threads it does not cover
   * are skipped. A page reads a fixed number of times, however many threads it holds.
   */
  readonly listReadable: <R, Cursor, E>(
    groupId: Group.Id,
    options: ListOptions<R, Cursor, E>,
  ) => Effect.Effect<ReadonlyArray<Thread.ListItem>, ListError | E, Actor.Service>;
  /** A page of the thread's timeline with resolved subjects, under access and `thread.read`. */
  readonly readTimeline: (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, TimelineError, Actor.Service>;
  /**
   * One activity core recorded, as its timeline shows it, under its thread's access and
   * `thread.read`. A recorded activity that is missing is a defect.
   */
  readonly readTimelineItem: (
    activityId: ThreadActivity.Id,
  ) => Effect.Effect<Thread.TimelineItem, TimelineError, Actor.Service>;
}

/**
 * The shared reads of threads. Internal: not among `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/thread/ThreadQuery",
) {}

/**
 * Capture the stores; check the acting member and current admission on every call.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadQuery.make")(function* () {
  const authorization = yield* Authorization.Service;
  const groupQuery = yield* GroupQuery.Service;
  const threadStore = yield* ThreadStore.Service;
  const groupMembershipStore = yield* GroupMembershipStore.Service;
  const groupFollowStore = yield* GroupFollowStore.Service;
  const memberStore = yield* MemberStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const threadActivityResolvers = yield* ThreadActivityResolvers.Service;
  const readStateStore = yield* ReadStateStore.Service;
  const taskStore = yield* TaskStore.Service;
  const { workspaceId } = yield* Store.Service;

  const requireAccess = Effect.fn("ThreadQuery.requireAccess")(function* (threadId: Thread.Id) {
    const id = yield* Schema.decodeEffect(Thread.Id)(threadId);
    yield* authorization.require([]);
    const found = yield* threadStore.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ threadId: id });
    const thread = found.value;
    yield* groupQuery
      .requireAudience(thread.groupId)
      .pipe(Effect.catchTag("GroupQuery.NotMember", () => new NotFound({ threadId: id })));
    return thread;
  });

  const requireReadable = Effect.fn("ThreadQuery.requireReadable")(function* (threadId: Thread.Id) {
    const thread = yield* requireAccess(threadId);
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    return thread;
  });

  const getMembersById = (ids: ReadonlyArray<Member.Id>) =>
    Effect.map(
      memberStore.getMany(ids),
      (found) => new Map(found.map((member) => [member.id, member] as const)),
    );
  const eligibleMembers = Effect.fn("ThreadQuery.eligibleMembers")(function* (
    groupId: Group.Id,
    memberIds: ReadonlyArray<Member.Id>,
  ) {
    const result = new Map<Member.Id, Eligible>();
    if (memberIds.length === 0) return result;
    const admissions = yield* groupMembershipStore.findActiveMany(groupId, memberIds);
    const found = yield* getMembersById(admissions.map((admission) => admission.memberId));
    for (const admission of admissions) {
      const member = found.get(admission.memberId);
      if (member?.status === "active") result.set(member.id, { admission, member });
    }
    return result;
  });

  const followers = Effect.fn("ThreadQuery.followers")(function* (groupId: Group.Id) {
    const follows = yield* groupFollowStore.listActiveByGroup(groupId);
    const eligible = yield* eligibleMembers(
      groupId,
      follows.map((follow) => follow.memberId),
    );
    return follows.flatMap((follow) => {
      const entry = eligible.get(follow.memberId);
      return entry !== undefined && entry.admission.id === follow.groupMembershipId ? [entry] : [];
    });
  });

  /**
   * The stored active participations still current: contacts and triage take part without group
   * access, and members need their admission and workspace membership to be active.
   */
  const keepCurrent = Effect.fnUntraced(function* (
    rows: ReadonlyArray<ThreadParticipation.Record>,
  ) {
    const members = rows.flatMap(({ participant }) =>
      ThreadParticipation.Participant.isAnyOf(["Member"])(participant) ? [participant] : [],
    );
    const admissions = yield* groupMembershipStore.getMany(
      members.map((member) => member.groupMembershipId),
    );
    const admissionsById = new Map(admissions.map((admission) => [admission.id, admission]));
    const membersById = yield* getMembersById(members.map((member) => member.memberId));
    const isCurrent = (participant: ThreadParticipation.Participant) =>
      !ThreadParticipation.Participant.isAnyOf(["Member"])(participant) ||
      (admissionsById.get(participant.groupMembershipId)?.status === "active" &&
        membersById.get(participant.memberId)?.status === "active");
    return rows.filter(({ participant }) => isCurrent(participant));
  });

  /** Read one page of stored active participations: those current, and the cursor after it. */
  const readParticipationPage = Effect.fnUntraced(function* (
    thread: Thread.Record,
    options: ThreadParticipation.ListOptions,
  ) {
    const rows = yield* threadParticipationStore.pageActiveByThread(thread.id, options);
    const last = rows.at(-1);
    return {
      participants: yield* keepCurrent(rows),
      next: rows.length < options.limit || last === undefined ? undefined : last.id,
    };
  });

  /** Store pages a whole-thread read takes at a time. */
  const pageSize = 500;
  const currentParticipants = Effect.fn("ThreadQuery.currentParticipants")(function* (
    thread: Thread.Record,
  ) {
    const result: Array<ThreadParticipation.Record> = [];
    let after: ThreadParticipation.Id | undefined;
    do {
      const read = yield* readParticipationPage(
        thread,
        after === undefined ? { limit: pageSize } : { after, limit: pageSize },
      );
      result.push(...read.participants);
      after = read.next;
    } while (after !== undefined);
    return result;
  });

  const pageParticipants = Effect.fn("ThreadQuery.pageParticipants")(function* (
    thread: Thread.Record,
    request: ThreadParticipation.ListOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.ListOptions))(
      request,
    );
    const result: Array<ThreadParticipation.Record> = [];
    let after = options.after;
    do {
      const read = yield* readParticipationPage(
        thread,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit },
      );
      // Anything past the limit follows the last one returned, so the caller's cursor finds it.
      result.push(...read.participants.slice(0, options.limit - result.length));
      after = read.next;
    } while (after !== undefined && result.length < options.limit);
    return result;
  });

  const findParticipants = Effect.fn("ThreadQuery.findParticipants")(function* (
    thread: Thread.Record,
    references: ReadonlyArray<ThreadParticipation.Reference>,
  ) {
    if (references.length === 0) return [];
    return yield* keepCurrent(yield* threadParticipationStore.findActive(thread.id, references));
  });

  const listReadable = Effect.fn("ThreadQuery.listReadable")(function* <R, Cursor, E>(
    groupId: Group.Id,
    options: ListOptions<R, Cursor, E>,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    const admission = yield* groupQuery.requireAudience(id);
    const actor = yield* Actor.Service;
    const items: Array<Thread.ListItem> = [];
    let before = options.first;
    while (items.length < options.limit) {
      const page = yield* options.list(before);
      if (page.length === 0) break;
      const ids = page.map((row) => options.threadOf(row).id);
      const latest = new Map(
        (yield* threadStore.getLatest(ids)).map((value) => [value.threadId, value] as const),
      );
      const tasks = new Map(
        (yield* taskStore.getMany(ids)).map((task) => [task.threadId, task] as const),
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
      for (const [index, row] of page.entries()) {
        const thread = options.threadOf(row);
        const current = latest.get(thread.id);
        if (current === undefined)
          return yield* Effect.die("A listed thread has no recorded activity");
        // The next page starts after the last row seen, readable or not.
        before = options.cursorOf(row, current);
        if (allowed[index] !== true || items.length === options.limit) continue;
        const readThrough = positions.get(thread.id) ?? null;
        items.push(
          Thread.listItem(
            thread,
            tasks.get(thread.id) ?? null,
            current,
            readThrough,
            admission.admittedAt,
          ),
        );
      }
      if (page.length < options.limit) break;
    }
    return items;
  });

  const readTimeline = Effect.fn("ThreadQuery.readTimeline")(function* (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) {
    const request = yield* Schema.decodeEffect(ThreadActivityStore.ReadOptions)(options);
    const thread = yield* requireReadable(threadId);
    return yield* threadActivityResolvers.resolve(
      thread,
      yield* threadActivityStore.readPage(thread.id, request),
    );
  });

  const readTimelineItem = Effect.fn("ThreadQuery.readTimelineItem")(function* (
    activityId: ThreadActivity.Id,
  ) {
    const id = yield* Schema.decodeEffect(ThreadActivity.Id)(activityId);
    yield* authorization.require([]);
    const found = yield* threadActivityStore.get(id);
    if (Option.isNone(found))
      return yield* Effect.die("A recorded activity is missing from the timeline");
    const thread = yield* requireReadable(found.value.threadId);
    const [item] = yield* threadActivityResolvers.resolve(thread, [found.value]);
    if (item === undefined) return yield* Effect.die("An activity resolved to no timeline item");
    return item;
  });

  return Service.of({
    requireAccess,
    requireReadable,
    eligibleMembers,
    followers,
    currentParticipants,
    pageParticipants,
    findParticipants,
    listReadable,
    readTimeline,
    readTimelineItem,
  });
});

/**
 * Provide the shared reads over the stores, group reads, authorization, read positions, and
 * resolvers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make());

export * as ThreadQuery from "./ThreadQuery.ts";
