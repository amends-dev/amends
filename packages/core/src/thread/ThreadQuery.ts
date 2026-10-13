/**
 * The reads of threads that operations share: whether the actor may reach a thread, who may take
 * part in a group's threads, who takes part in a thread now, a page of a group's threads the actor
 * can read, and a thread's timeline resolved into items. The thread, task, turn, read-state, signal,
 * and notification operations all read through it. It writes nothing and checks no action
 * permission but `thread.read`; each operation checks its own, inside its commit when it writes.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Authorization from "../authorization/Authorization.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Group from "../group/Group.ts"
import * as GroupFollowStore from "../group/GroupFollowStore.ts"
import type * as GroupMembership from "../group/GroupMembership.ts"
import * as GroupMembershipStore from "../group/GroupMembershipStore.ts"
import * as GroupQuery from "../group/GroupQuery.ts"
import * as Actor from "../identity/Actor.ts"
import * as Store from "../journal/Store.ts"
import type * as StoreError from "../journal/StoreError.ts"
import * as ReadStateStore from "../read-state/ReadStateStore.ts"
import * as TaskStore from "../task/TaskStore.ts"
import type * as Member from "../workspace/Member.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import * as Thread from "./Thread.ts"
import * as ThreadActivity from "./ThreadActivity.ts"
import * as ThreadActivityResolvers from "./ThreadActivityResolvers.ts"
import * as ThreadActivityStore from "./ThreadActivityStore.ts"
import * as ThreadParticipation from "./ThreadParticipation.ts"
import * as ThreadParticipationStore from "./ThreadParticipationStore.ts"
import * as ThreadPermissions from "./ThreadPermissions.ts"
import * as ThreadStore from "./ThreadStore.ts"

/**
 * A member who may take part in a group's threads: a current admission and active membership.
 *
 * @category models
 * @since 0.1.0
 */
export interface Eligible {
  readonly admission: GroupMembership.GroupMembership
  readonly member: Member.Member
}

/**
 * What checking access to a thread can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type AccessError = Authorization.Error | StoreError.StoreError | Schema.SchemaError | CoreError.NotFound

/**
 * What reading a timeline can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type TimelineError = AccessError | StoreError.StoreError

/**
 * What listing a group's readable threads can fail with, beyond the listing's own failures.
 *
 * @category errors
 * @since 0.1.0
 */
export type ListError = CoreError.NotFound | Authorization.Error | StoreError.StoreError | Schema.SchemaError

/**
 * How a page of a group's threads is listed: what lists the rows in the page's order, the thread
 * each row is about, and the cursor the next page starts after.
 *
 * @category options
 * @since 0.1.0
 */
export interface ListOptions<R, Cursor, E> {
  readonly limit: number
  /** The exclusive cursor the page starts after, or none for the first page. */
  readonly first: Cursor | undefined
  /** At most `limit` rows after the cursor, in the page's order. */
  readonly list: (before: Cursor | undefined) => Effect.Effect<ReadonlyArray<R>, E>
  readonly threadOf: (row: R) => Thread.Thread
  /** The cursor after a listed row, given the row's thread's latest activity. */
  readonly cursorOf: (row: R, latest: Thread.Latest) => Cursor
}

/**
 * The shared reads of threads. Internal: not among `Core.Operations`.
 *
 * The shared reads.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadQuery extends Context.Service<
  ThreadQuery,
  {
    /**
     * The thread, under its audience alone. Operations check their action permission separately,
     * inside the commit for writes.
     */
    readonly requireAccess: (threadId: Thread.Id) => Effect.Effect<Thread.Thread, AccessError, Actor.Actor>

    /** The thread, under its audience and `thread.read`, as every read of its conversation needs. */
    readonly requireReadable: (threadId: Thread.Id) => Effect.Effect<Thread.Thread, AccessError, Actor.Actor>
    /**
     * Those of the given members with a current admission to the group and active workspace
     * membership, with both records. Reads only the members asked about.
     */
    readonly eligibleMembers: (
      groupId: Group.Id,
      memberIds: ReadonlyArray<Member.Id>
    ) => Effect.Effect<ReadonlyMap<Member.Id, Eligible>, StoreError.StoreError>
    /**
     * The group's followers whose follow is through their current admission, with both records, in
     * follow order: those a new thread in the group admits.
     */
    readonly followers: (groupId: Group.Id) => Effect.Effect<ReadonlyArray<Eligible>, StoreError.StoreError>
    /**
     * Every current participant: an active participation whose member, if any, still has a current
     * group admission. Read in pages; a reply that addresses everyone needs them all.
     */
    readonly currentParticipants: (
      thread: Thread.Thread
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.ThreadParticipation>, StoreError.StoreError>
    /**
     * A page of current participants in participation-ID order after the cursor. Stored
     * participants that have lapsed are skipped, and reading continues to fill the page.
     */
    readonly pageParticipants: (
      thread: Thread.Thread,
      options: ThreadParticipation.ListOptions
    ) => Effect.Effect<
      ReadonlyArray<ThreadParticipation.ThreadParticipation>,
      StoreError.StoreError | Schema.SchemaError
    >
    /** The current participations of these participants, reading only them. */
    readonly findParticipants: (
      thread: Thread.Thread,
      participants: ReadonlyArray<ThreadParticipation.Reference>
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.ThreadParticipation>, StoreError.StoreError>
    /**
     * Fill a page with a group's threads the actor can read, from the rows `options.list` gives in
     * the page's order, reading further when grants skip some: each thread with its task, if any,
     * its latest activity, and the actor's read position and unread state. Requires current group
     * membership; `thread.read` is checked for the whole page at once, and threads it does not cover
     * are skipped. A page reads a fixed number of times, however many threads it holds.
     */
    readonly listReadable: <R, Cursor, E>(
      groupId: Group.Id,
      options: ListOptions<R, Cursor, E>
    ) => Effect.Effect<ReadonlyArray<Thread.ListItem>, ListError | E, Actor.Actor>
    /** A page of the thread's timeline with resolved subjects, under access and `thread.read`. */
    readonly readTimeline: (
      threadId: Thread.Id,
      options: ThreadActivityStore.ReadOptions
    ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, TimelineError, Actor.Actor>
    /**
     * One activity core recorded, as its timeline shows it, under its thread's access and
     * `thread.read`. A recorded activity that is missing is a defect.
     */
    readonly readTimelineItem: (
      activityId: ThreadActivity.Id
    ) => Effect.Effect<Thread.TimelineItem, TimelineError, Actor.Actor>
  }
>()("@amends-dev/core/thread/ThreadQuery") {}

/**
 * Capture the stores; check the acting member and current admission on every call.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadQuery.make")(function* () {
  const authorization = yield* Authorization.Authorization
  const groupQuery = yield* GroupQuery.GroupQuery
  const threadStore = yield* ThreadStore.ThreadStore
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore
  const groupFollowStore = yield* GroupFollowStore.GroupFollowStore
  const memberStore = yield* MemberStore.MemberStore
  const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore
  const threadActivityResolvers = yield* ThreadActivityResolvers.ThreadActivityResolvers
  const readStateStore = yield* ReadStateStore.ReadStateStore
  const taskStore = yield* TaskStore.TaskStore
  const { workspaceId } = yield* Store.Store

  const requireAccess = Effect.fn("ThreadQuery.requireAccess")(function* (threadId: Thread.Id) {
    const id = yield* Schema.decodeEffect(Thread.Id)(threadId)
    yield* authorization.require([])
    const found = yield* threadStore.get(id)
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "Thread", id })
    const thread = found.value
    yield* groupQuery
      .requireAudience(thread.groupId)
      .pipe(Effect.catchTag("CoreError.NotFound", () => new CoreError.NotFound({ resource: "Thread", id })))
    return thread
  })

  const requireReadable = Effect.fn("ThreadQuery.requireReadable")(function* (threadId: Thread.Id) {
    const thread = yield* requireAccess(threadId)
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id
      })
    ])
    return thread
  })

  const getMembersById = (ids: ReadonlyArray<Member.Id>) =>
    Effect.map(memberStore.getMany(ids), (found) => new Map(found.map((member) => [member.id, member] as const)))
  const eligibleMembers = Effect.fn("ThreadQuery.eligibleMembers")(function* (
    groupId: Group.Id,
    memberIds: ReadonlyArray<Member.Id>
  ) {
    const result = new Map<Member.Id, Eligible>()
    if (memberIds.length === 0) return result
    const admissions = yield* groupMembershipStore.findActiveMany(groupId, memberIds)
    const found = yield* getMembersById(admissions.map((admission) => admission.memberId))
    for (const admission of admissions) {
      const member = found.get(admission.memberId)
      if (member?.status === "active") result.set(member.id, { admission, member })
    }
    return result
  })

  const followers = Effect.fn("ThreadQuery.followers")(function* (groupId: Group.Id) {
    const follows = yield* groupFollowStore.listActiveByGroup(groupId)
    const eligible = yield* eligibleMembers(
      groupId,
      follows.map((follow) => follow.memberId)
    )
    return follows.flatMap((follow) => {
      const entry = eligible.get(follow.memberId)
      return entry !== undefined && entry.admission.id === follow.groupMembershipId ? [entry] : []
    })
  })

  /**
   * The stored active participations still current: contacts and triage take part without group
   * access, and members need their admission and workspace membership to be active.
   */
  const keepCurrent = Effect.fnUntraced(function* (rows: ReadonlyArray<ThreadParticipation.ThreadParticipation>) {
    const members = rows.flatMap(({ participant }) =>
      ThreadParticipation.Participant.isAnyOf(["Member"])(participant) ? [participant] : []
    )
    const admissions = yield* groupMembershipStore.getMany(members.map((member) => member.groupMembershipId))
    const admissionsById = new Map(admissions.map((admission) => [admission.id, admission]))
    const membersById = yield* getMembersById(members.map((member) => member.memberId))
    const isCurrent = (participant: ThreadParticipation.Participant) =>
      !ThreadParticipation.Participant.isAnyOf(["Member"])(participant) ||
      (admissionsById.get(participant.groupMembershipId)?.status === "active" &&
        membersById.get(participant.memberId)?.status === "active")
    return rows.filter(({ participant }) => isCurrent(participant))
  })

  /** Read one page of stored active participations: those current, and the cursor after it. */
  const readParticipationPage = Effect.fnUntraced(function* (
    thread: Thread.Thread,
    options: ThreadParticipation.ListOptions
  ) {
    const rows = yield* threadParticipationStore.pageActiveByThread(thread.id, options)
    const last = rows.at(-1)
    return {
      participants: yield* keepCurrent(rows),
      next: rows.length < options.limit || last === undefined ? undefined : last.id
    }
  })

  /** Store pages a whole-thread read takes at a time. */
  const pageSize = 500
  const currentParticipants = Effect.fn("ThreadQuery.currentParticipants")(function* (thread: Thread.Thread) {
    const result: Array<ThreadParticipation.ThreadParticipation> = []
    let after: ThreadParticipation.Id | undefined
    do {
      const read = yield* readParticipationPage(
        thread,
        after === undefined ? { limit: pageSize } : { after, limit: pageSize }
      )
      result.push(...read.participants)
      after = read.next
    } while (after !== undefined)
    return result
  })

  const pageParticipants = Effect.fn("ThreadQuery.pageParticipants")(function* (
    thread: Thread.Thread,
    request: ThreadParticipation.ListOptions
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.ListOptions))(request)
    const result: Array<ThreadParticipation.ThreadParticipation> = []
    let after = options.after
    do {
      const read = yield* readParticipationPage(
        thread,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit }
      )
      // Anything past the limit follows the last one returned, so the caller's cursor finds it.
      result.push(...read.participants.slice(0, options.limit - result.length))
      after = read.next
    } while (after !== undefined && result.length < options.limit)
    return result
  })

  const findParticipants = Effect.fn("ThreadQuery.findParticipants")(function* (
    thread: Thread.Thread,
    references: ReadonlyArray<ThreadParticipation.Reference>
  ) {
    if (references.length === 0) return []
    return yield* keepCurrent(yield* threadParticipationStore.findActive(thread.id, references))
  })

  const listReadable = Effect.fn("ThreadQuery.listReadable")(function* <R, Cursor, E>(
    groupId: Group.Id,
    options: ListOptions<R, Cursor, E>
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId)
    const admission = yield* groupQuery.requireAudience(id)
    const actor = yield* Actor.Actor
    const items: Array<Thread.ListItem> = []
    let before = options.first
    while (items.length < options.limit) {
      const page = yield* options.list(before)
      if (page.length === 0) break
      const ids = page.map((row) => options.threadOf(row).id)
      const latest = new Map((yield* threadStore.getLatest(ids)).map((value) => [value.threadId, value] as const))
      const tasks = new Map((yield* taskStore.getMany(ids)).map((task) => [task.threadId, task] as const))
      const allowed = yield* authorization.permitted(
        ids.map((threadId) => Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId }))
      )
      const readableIds = ids.filter((_, index) => allowed[index] === true)
      const positions = new Map(
        (yield* readStateStore.getThreadPositions(actor.memberId, readableIds)).map(
          (position) => [position.threadId, position.readThrough] as const
        )
      )
      for (const [index, row] of page.entries()) {
        const thread = options.threadOf(row)
        const current = latest.get(thread.id)
        if (current === undefined) return yield* Effect.die("A listed thread has no recorded activity")
        // The next page starts after the last row seen, readable or not.
        before = options.cursorOf(row, current)
        if (allowed[index] !== true || items.length === options.limit) continue
        const readThrough = positions.get(thread.id) ?? null
        items.push(Thread.listItem(thread, tasks.get(thread.id) ?? null, current, readThrough, admission.admittedAt))
      }
      if (page.length < options.limit) break
    }
    return items
  })

  const readTimeline = Effect.fn("ThreadQuery.readTimeline")(function* (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions
  ) {
    const request = yield* Schema.decodeEffect(ThreadActivityStore.ReadOptions)(options)
    const thread = yield* requireReadable(threadId)
    return yield* threadActivityResolvers.resolve(thread, yield* threadActivityStore.readPage(thread.id, request))
  })

  const readTimelineItem = Effect.fn("ThreadQuery.readTimelineItem")(function* (activityId: ThreadActivity.Id) {
    const id = yield* Schema.decodeEffect(ThreadActivity.Id)(activityId)
    yield* authorization.require([])
    const found = yield* threadActivityStore.get(id)
    if (Option.isNone(found)) return yield* Effect.die("A recorded activity is missing from the timeline")
    const thread = yield* requireReadable(found.value.threadId)
    const [item] = yield* threadActivityResolvers.resolve(thread, [found.value])
    if (item === undefined) return yield* Effect.die("An activity resolved to no timeline item")
    return item
  })

  return ThreadQuery.of({
    requireAccess,
    requireReadable,
    eligibleMembers,
    followers,
    currentParticipants,
    pageParticipants,
    findParticipants,
    listReadable,
    readTimeline,
    readTimelineItem
  })
})

/**
 * Provide the shared reads over the stores, group reads, authorization, read positions, and
 * resolvers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadQuery, make())
