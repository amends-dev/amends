/**
 * The operations on threads an actor calls: starting one in a group, as a task or not, or with the
 * members of a direct conversation, renaming one, and reading threads, their timelines, and their
 * participants. Replies are `ThreadMessageService`, following is `ThreadParticipationService`, and
 * a task once it exists is `TaskService`. Each operation authorizes the actor itself, writes inside
 * one journal commit, and reads outside any.
 *
 * @since 0.1.0
 */

import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as AgentPermissions from "../agent/AgentPermissions.ts"
import * as Authorization from "../authorization/Authorization.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Group from "../group/Group.ts"
import * as GroupCommand from "../group/GroupCommand.ts"
import type * as GroupId from "../group/GroupId.ts"
import * as GroupQuery from "../group/GroupQuery.ts"
import * as GroupStore from "../group/GroupStore.ts"
import * as Actor from "../identity/Actor.ts"
import * as Identity from "../identity/Identity.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import * as ReadStateStore from "../read-state/ReadStateStore.ts"
import * as Request from "../request/Request.ts"
import * as Task from "../task/Task.ts"
import * as TaskCommand from "../task/TaskCommand.ts"
import * as TaskPermissions from "../task/TaskPermissions.ts"
import * as TaskStore from "../task/TaskStore.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Thread from "./Thread.ts"
import type * as ThreadActivityStore from "./ThreadActivityStore.ts"
import * as ThreadCommand from "./ThreadCommand.ts"
import * as ThreadFacts from "./ThreadFacts.ts"
import * as ThreadId from "./ThreadId.ts"
import * as ThreadMessage from "./ThreadMessage.ts"
import * as ThreadMessageId from "./ThreadMessageId.ts"
import * as ThreadMessageStore from "./ThreadMessageStore.ts"
import * as ThreadParticipation from "./ThreadParticipation.ts"
import * as ThreadPermissions from "./ThreadPermissions.ts"
import * as ThreadQuery from "./ThreadQuery.ts"
import * as ThreadStore from "./ThreadStore.ts"
import * as ThreadTitleActivity from "./ThreadTitleActivity.ts"

/**
 * What starting a thread can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What renaming a thread can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type RenameError =
  | CoreError.NotFound
  | CoreError.Changed
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What reading threads can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * The thread operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadService extends Context.Service<
  ThreadService,
  {
    /**
     * Start a thread in a group the author belongs to. A team thread starts with its author,
     * mentioned members, and the group's followers; the rest of the group can read it without
     * participating. A direct-group thread enrolls all of its members, and mentions only narrow who
     * is notified. Only mentioned agents need the author's agent-use authority. A thread derived
     * from an `origin` the author can read names it. Started as a task, under `task.create` on the
     * group, the thread's second activity creates the task, admitting its assignee, who must be able
     * to take part, and triage while it is in triage; assigning an agent needs `agent.use` on it.
     */
    readonly startInGroup: (
      input: Thread.StartInGroupInput,
      options?: Request.Options
    ) => Effect.Effect<Thread.Started, Error, Actor.Actor>
    /**
     * Establish or reuse the direct group for the author and the given members, then start a
     * thread with all of them. Needs active membership, agent use for every named agent, and
     * thread.start on the direct group; no group-management permission.
     */
    readonly startDirect: (
      input: Thread.StartDirectInput,
      options?: Request.Options
    ) => Effect.Effect<Thread.Started, Error, Actor.Actor>
    /**
     * Give a thread a title, under current group audience and `thread.rename` on the thread. The
     * same title again records nothing; otherwise a title other than `expectedTitle` is
     * `CoreError.Changed`, and nothing is recorded. A rename publishes its fact and records a quiet
     * `thread.renamed` activity in one commit, and returns the renamed thread.
     */
    readonly rename: (input: Thread.RenameInput) => Effect.Effect<Thread.Thread, RenameError, Actor.Actor>
    /**
     * The thread, under current group audience and `thread.read`. Reading creates no participation
     * and marks nothing seen.
     */
    readonly get: (threadId: ThreadId.ThreadId) => Effect.Effect<Thread.Thread, ReadError, Actor.Actor>
    /**
     * One page of a group's threads the actor can read, newest latest activity first, each with the
     * actor's read position and unread state. Requires current group membership; `thread.read` is
     * checked for the whole page at once, and threads it does not cover are skipped.
     */
    readonly listInGroup: (
      groupId: GroupId.GroupId,
      options: Thread.ListOptions
    ) => Effect.Effect<ReadonlyArray<Thread.ListItem>, ReadError, Actor.Actor>
    /**
     * One page of a group's threads the actor can read, newest start first, as its stream shows them:
     * each with its opening message, reply count, latest message, and the actor's position and unread
     * state, under the same rules as `listInGroup`. A page reads a fixed number of times, however
     * many threads it holds.
     */
    readonly listOpenings: (
      groupId: GroupId.GroupId,
      options: Thread.OpeningOptions
    ) => Effect.Effect<ReadonlyArray<Thread.Opening>, ReadError, Actor.Actor>
    /** Bounded activity page with resolved subjects, ordered by sequence. The cursor is exclusive. */
    readonly readTimeline: (
      threadId: ThreadId.ThreadId,
      options: ThreadActivityStore.ReadOptions
    ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, ReadError, Actor.Actor>
    /**
     * A page of current participants: active participations backed by current workspace and group
     * admissions, in participation-ID order after the exclusive cursor, with public member
     * references only.
     */
    readonly listParticipants: (
      threadId: ThreadId.ThreadId,
      options: ThreadParticipation.ListOptions
    ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Summary>, ReadError, Actor.Actor>
  }
>()("@amends-dev/core/thread/ThreadService") {}

/**
 * Capture bound services; authorize the complete requested conversation inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const groupQuery = yield* GroupQuery.GroupQuery
  const threadCommand = yield* ThreadCommand.ThreadCommand
  const groupStore = yield* GroupStore.GroupStore
  const groupCommand = yield* GroupCommand.GroupCommand
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const threadStore = yield* ThreadStore.ThreadStore
  const readStateStore = yield* ReadStateStore.ReadStateStore
  const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore
  const taskCommand = yield* TaskCommand.TaskCommand
  const taskStore = yield* TaskStore.TaskStore
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId
  /**
   * The IDs a start gives its thread and opening message. Without a key they are new each time. A
   * keyed start derives them from its author and key, so a retry names what its first attempt
   * started.
   */
  const deriveStartIds = Effect.fnUntraced(function* (operation: string, key: Request.Key | undefined) {
    const actor = yield* Actor.Actor
    const parts = [operation, workspaceId, actor.memberId]
    const threadId = ThreadId.ThreadId.make(yield* Request.idFor(key, [...parts, "thread"]))
    const messageId = ThreadMessageId.ThreadMessageId.make(yield* Request.idFor(key, [...parts, "message"]))
    return { threadId, messageId }
  })

  /** What an earlier attempt of this keyed start created, so a retry returns it; None otherwise. */
  const findRetriedStart = Effect.fnUntraced(function* (
    key: Request.Key | undefined,
    ids: { readonly threadId: ThreadId.ThreadId; readonly messageId: ThreadMessageId.ThreadMessageId }
  ) {
    if (key === undefined) return Option.none<Thread.Started>()
    const thread = yield* threadStore.get(ids.threadId)
    if (Option.isNone(thread)) return Option.none<Thread.Started>()
    const message = yield* threadMessageStore.get(ids.messageId)
    if (Option.isNone(message)) return yield* Effect.die("A started thread's opening message is missing")
    const task = yield* taskStore.get(ids.threadId)
    return Option.some<Thread.Started>({
      thread: thread.value,
      message: message.value,
      task: Option.getOrNull(task)
    })
  })

  /**
   * Require every starting participant to be able to take part, and the author's agent-use grant
   * for each agent the author names. Agents that take part without being named need none.
   */
  const authorizeParticipants = Effect.fnUntraced(function* (
    participants: ReadonlyArray<MemberId.MemberId>,
    named: ReadonlyArray<MemberId.MemberId>,
    eligible: ReadonlyMap<MemberId.MemberId, ThreadQuery.Eligible>
  ) {
    for (const memberId of participants)
      if (!eligible.has(memberId))
        return yield* new CoreError.Conflict({
          reason: new CoreError.ParticipantUnavailable({ memberId })
        })
    for (const memberId of named) {
      const member = eligible.get(memberId)?.member
      if (member === undefined)
        return yield* new CoreError.Conflict({
          reason: new CoreError.ParticipantUnavailable({ memberId })
        })
      if (Identity.MemberReference.isAnyOf(["Agent"])(member.identity))
        yield* authorization.require([
          Requirement.make(AgentPermissions.Use, Target.Reference.cases.Member.make({ workspaceId, memberId }))
        ])
    }
  })

  /**
   * Require `task.create` on the group, and the assignee, if one, to be able to take part there,
   * with the author's agent use when the assignee is an agent, since assigning one directs it.
   */
  const authorizeTask = Effect.fnUntraced(function* (groupId: GroupId.GroupId, task: Task.Options) {
    yield* authorization.require([
      Requirement.make(TaskPermissions.Create, Target.Reference.cases.Group.make({ workspaceId, groupId }))
    ])
    if (task.assignee === undefined) return
    const eligible = yield* threadQuery.eligibleMembers(groupId, [task.assignee])
    yield* authorizeParticipants([task.assignee], [task.assignee], eligible)
  })

  /**
   * Create the thread with its author's opening message, which the author has then read, and as a
   * task at its second position when the start asks for one, so a task never lacks a description.
   */
  const createThread = Effect.fnUntraced(function* (
    authorId: MemberId.MemberId,
    groupId: GroupId.GroupId,
    participants: ReadonlyArray<MemberId.MemberId>,
    opening: {
      readonly title?: Thread.Title
      readonly origin?: ThreadId.ThreadId
      readonly text: ThreadMessage.Text
      readonly mentions: ReadonlyArray<MemberId.MemberId>
      readonly task?: Task.Options
    },
    ids: { readonly threadId: ThreadId.ThreadId; readonly messageId: ThreadMessageId.ThreadMessageId }
  ) {
    const occurredAt = yield* DateTime.now
    const started = yield* threadCommand.create({
      threadId: ids.threadId,
      groupId,
      title: opening.title ?? null,
      origin: opening.origin ?? null,
      participants: participants.map((memberId) => ThreadParticipation.Reference.cases.Member.make({ memberId })),
      message: {
        messageId: ids.messageId,
        author: ThreadMessage.Author.cases.Member.make({ memberId: authorId }),
        text: opening.text,
        mentions: opening.mentions,
        via: null
      },
      occurredAt
    })
    // Posting reads the thread through the author's own message.
    yield* readStateStore.markThreadRead(
      {
        workspaceId,
        memberId: authorId,
        threadId: started.thread.id,
        readThrough: started.activity.sequence
      },
      occurredAt
    )
    const task =
      opening.task === undefined
        ? null
        : (yield* taskCommand.create({
            thread: started.thread,
            ...Task.initial(opening.task),
            createdBy: started.thread.createdBy,
            by: ThreadParticipation.Reference.cases.Member.make({ memberId: authorId }),
            occurredAt
          })).task
    return { thread: started.thread, message: started.message, task } satisfies Thread.Started
  })

  /**
   * Who a thread in a direct group starts with: every member who can take part, and those who can,
   * for authorizing them.
   */
  const directStarters = Effect.fnUntraced(function* (group: Group.Direct) {
    const eligible = yield* threadQuery.eligibleMembers(group.id, group.memberIds)
    return { starters: [...eligible.keys()].sort(), eligible }
  })

  /**
   * Who a thread in a team group starts with: its author, the members its opening message
   * mentions, and the group's followers whose follow is through their current admission; the rest
   * of the group sees it as unread, so only these members' admissions are read.
   */
  const teamStarters = Effect.fnUntraced(function* (
    groupId: GroupId.GroupId,
    authorId: MemberId.MemberId,
    mentions: ReadonlyArray<MemberId.MemberId>
  ) {
    const followers = yield* threadQuery.followers(groupId)
    const named = yield* threadQuery.eligibleMembers(groupId, [authorId, ...mentions])
    const eligible = new Map([...named, ...followers.map((follower) => [follower.member.id, follower] as const)])
    const followerIds = followers.map((follower) => follower.member.id).sort()
    return { starters: [...new Set([authorId, ...mentions, ...followerIds])], eligible }
  })

  const startDirect = Effect.fn("ThreadService.startDirect")(
    function* (input: Thread.StartDirectInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartDirectInput)(input)
      yield* authorization.require([])
      const actor = yield* Actor.Actor
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() })
      const memberIds = Group.directMembers([actor.memberId, ...request.memberIds])
      if (memberIds.length < 2) return yield* new CoreError.Invalid({ reason: new CoreError.DirectMembersRequired() })
      const missing = request.mentions.find((id) => !memberIds.includes(id))
      if (missing !== undefined)
        return yield* new CoreError.Conflict({
          reason: new CoreError.ParticipantUnavailable({ memberId: missing })
        })
      const { group, created } = yield* groupCommand.establishDirect(memberIds, actor.memberId, yield* DateTime.now)
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, Target.Reference.cases.Group.make({ workspaceId, groupId: group.id }))
      ])
      const ids = yield* deriveStartIds("thread.start-direct", options.requestKey)
      const retried = yield* findRetriedStart(options.requestKey, ids)
      if (Option.isSome(retried)) return retried.value
      const eligible = yield* threadQuery.eligibleMembers(group.id, memberIds)
      // Creating the group gives its agents a place in all of its threads, as making an agent
      // follow a team group does, so it needs agent use on each; later starts name only mentions.
      yield* authorizeParticipants(memberIds, created ? memberIds : request.mentions, eligible)
      return yield* createThread(actor.memberId, group.id, memberIds, request, ids)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const startInGroup = Effect.fn("ThreadService.startInGroup")(
    function* (input: Thread.StartInGroupInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Thread.StartInGroupInput)(input)
      yield* groupQuery.requireAudience(request.groupId)
      yield* authorization.require([
        Requirement.make(
          ThreadPermissions.Start,
          Target.Reference.cases.Group.make({ workspaceId, groupId: request.groupId })
        )
      ])
      const actor = yield* Actor.Actor
      if (!Identity.MemberReference.isAnyOf(["Human"])(actor.identity))
        return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() })
      const ids = yield* deriveStartIds("thread.start", options.requestKey)
      const retried = yield* findRetriedStart(options.requestKey, ids)
      if (Option.isSome(retried)) return retried.value
      const foundGroup = yield* groupStore.get(request.groupId)
      if (Option.isNone(foundGroup)) return yield* Effect.die("An audience's group is missing")
      const group = foundGroup.value
      const { starters, eligible } =
        group.kind === "Direct"
          ? yield* directStarters(group)
          : yield* teamStarters(group.id, actor.memberId, request.mentions)
      yield* authorizeParticipants(starters, request.mentions, eligible)
      // Work is split out of a thread its author can read; to anyone else the origin is missing.
      if (request.origin !== undefined) yield* threadQuery.requireReadable(request.origin)
      if (request.task !== undefined) yield* authorizeTask(group.id, request.task)
      return yield* createThread(actor.memberId, request.groupId, starters, request, ids)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const rename = Effect.fn("ThreadService.rename")(
    function* (input: Thread.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Thread.RenameInput))(input)
      // Only its group's members may rename a thread; to anyone else it is missing.
      const thread = yield* threadQuery.requireAccess(request.threadId)
      yield* authorization.require([
        Requirement.make(
          ThreadPermissions.Rename,
          Target.Reference.cases.Thread.make({ workspaceId, threadId: thread.id })
        )
      ])
      if (thread.title === request.title) return thread
      if (thread.title !== request.expectedTitle)
        return yield* new CoreError.Changed({ resource: "Thread", id: thread.id })
      const occurredAt = yield* DateTime.now
      // A task's title is a requirement: every participant is told of it, and the assignee asked
      // to work on it anew; a conversation's title tells no one.
      const task = yield* taskStore.get(thread.id)
      const actor = yield* Actor.Actor
      const recipients = Option.isNone(task)
        ? []
        : Task.recipients(
            yield* threadQuery.currentParticipants(thread),
            ThreadParticipation.Reference.cases.Member.make({ memberId: actor.memberId }),
            Task.asked(task.value)
          )
      const renamed = yield* threadCommand
        .publishActivity({
          thread,
          occurredAt,
          step: () =>
            Effect.gen(function* () {
              const fact = yield* journal
                .publish(ThreadFacts.Renamed, {
                  workspaceId,
                  threadId: thread.id,
                  groupId: thread.groupId,
                  title: request.title
                })
                .pipe(Publication.withOccurredAt(occurredAt))
              return {
                value: Object.assign({}, thread, { title: request.title }) satisfies Thread.Thread,
                kind: ThreadTitleActivity.Renamed,
                details: { title: request.title, previous: thread.title },
                recipients,
                cause: fact
              }
            })
        })
        .pipe(Effect.catchTag("CoreError.Conflict", () => Effect.die("A rename admits no participant")))
      return renamed.value
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  // Reads are deliberately outside journal.commit; an enclosing caller transaction remains
  // authoritative when present.
  const get = Effect.fn("ThreadService.get")(
    (threadId: ThreadId.ThreadId) => threadQuery.requireReadable(threadId),
    Operation.report
  )

  const listInGroup = Effect.fn("ThreadService.listInGroup")(function* (
    groupId: GroupId.GroupId,
    input: Thread.ListOptions
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Thread.ListOptions))(input)
    return yield* threadQuery.listReadable(groupId, {
      limit: options.limit,
      first: options.before,
      list: (before) =>
        threadStore.listByLatest(
          groupId,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit }
        ),
      threadOf: (thread) => thread,
      cursorOf: (thread, latest): Thread.ListCursor => ({
        latestActivityAt: latest.occurredAt,
        threadId: thread.id
      })
    })
  }, Operation.report)

  const listOpenings = Effect.fn("ThreadService.listOpenings")(function* (
    groupId: GroupId.GroupId,
    input: Thread.OpeningOptions
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Thread.OpeningOptions))(input)
    const items = yield* threadQuery.listReadable(groupId, {
      limit: options.limit,
      first: options.before,
      list: (before) =>
        threadStore.listByStart(
          groupId,
          before === undefined ? { limit: options.limit } : { before, limit: options.limit }
        ),
      threadOf: (thread) => thread,
      cursorOf: (thread): Thread.OpeningCursor => ({
        createdAt: thread.createdAt,
        threadId: thread.id
      })
    })
    const previews = yield* threadQuery.previewsOf(items)
    return Array.zipWith(previews, items, Thread.opening)
  }, Operation.report)

  const readTimeline = Effect.fn("ThreadService.readTimeline")(
    (threadId: ThreadId.ThreadId, options: ThreadActivityStore.ReadOptions) =>
      threadQuery.readTimeline(threadId, options),
    Operation.report
  )

  const listParticipants = Effect.fn("ThreadService.listParticipants")(function* (
    threadId: ThreadId.ThreadId,
    options: ThreadParticipation.ListOptions
  ) {
    const thread = yield* threadQuery.requireReadable(threadId)
    const participants = yield* threadQuery.pageParticipants(thread, options)
    return participants.map(ThreadParticipation.toSummary)
  }, Operation.report)
  return ThreadService.of({
    startInGroup,
    startDirect,
    rename,
    get,
    listInGroup,
    listOpenings,
    readTimeline,
    listParticipants
  })
})

/**
 * Provide the thread operations over the shared reads and writes, the stores, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadService, make)
