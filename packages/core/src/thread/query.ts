import { Context, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Group } from "../group/group.ts";
import { GroupQuery } from "../group/query.ts";
import { GroupMembership } from "../group/membership/membership.ts";
import { GroupMembershipStore } from "../group/membership/store.ts";
import type { Actor } from "../identity/actor.ts";
import { Store } from "../journal/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Thread } from "./thread.ts";
import { ThreadStore } from "./store.ts";
import { ThreadPermissions } from "./permissions.ts";
import { ThreadParticipation } from "./participation/participation.ts";
import { ThreadParticipationStore } from "./participation/store.ts";
import { ThreadActivity } from "./activity/activity.ts";
import { ThreadActivityResolvers } from "./activity/resolvers.ts";
import { ThreadActivityStore } from "./activity/store.ts";

/** The thread is missing, or outside the actor's group audience. */
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadQuery.NotFound", {
  threadId: Thread.Id,
}) {}

/** A member who may take part in a group's threads: a current admission and active membership. */
export interface Eligible {
  readonly admission: GroupMembership.Record;
  readonly member: Member.Record;
}

export type AccessError =
  | Authorization.Error
  | GroupMembershipStore.Failure
  | ThreadStore.Failure
  | Schema.SchemaError
  | NotFound;

export type ParticipantsError =
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | ThreadParticipationStore.Failure;

export type TimelineError =
  | AccessError
  | ThreadActivityStore.Failure
  | ThreadActivityResolvers.Failure;

export interface Interface {
  /** Audience only. Operations check their action permission separately, inside the commit for writes. */
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

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/query/Service",
) {}

/** @category constructors */
export const make = Effect.fn("ThreadQuery.make")(function* () {
  const authorization = yield* Authorization.Service;
  const groupQuery = yield* GroupQuery.Service;
  const threadStore = yield* ThreadStore.Service;
  const groupMembershipStore = yield* GroupMembershipStore.Service;
  const memberStore = yield* MemberStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const threadActivityResolvers = yield* ThreadActivityResolvers.Service;
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
    currentParticipants,
    pageParticipants,
    findParticipants,
    readTimeline,
    readTimelineItem,
  });
});

/** Internal reads shared by thread, turn, read-state, signal, and notification operations. @category layers */
export const layer = Layer.effect(Service, make());

export * as ThreadQuery from "./query.ts";
