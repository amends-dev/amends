/**
 * A store open in the browser: one person's of one workspace, as eventlog keeps it, the replica
 * its changes keep, and the person's drafts there. Its event log journals into an IndexedDB database of its own. The actions the
 * person writes, `write`, are held in the replica as pending, with what each is expected to create,
 * until the server runs them; each `ReplicaChanged` the server writes back is applied to the
 * replica. The host's sync server is the log's remote, reached in the background once the browser's
 * sync key is registered, and tried again until it is, so a store opens, reads, and takes actions
 * offline; eventlog sends what was written while it could not. A store's databases are named for
 * the host, the person, and the workspace, since positions and entry IDs are only unique within one.
 */

import { type Grant, GrantResolver } from "@amends-dev/core/authorization"
import type { Contact } from "@amends-dev/core/channel"
import type { CoreError } from "@amends-dev/core/error"
import type { Group, GroupId } from "@amends-dev/core/group"
import type { Identity } from "@amends-dev/core/identity"
import type { Presence } from "@amends-dev/core/presence"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import type { Task } from "@amends-dev/core/task"
import { type Thread, type ThreadId, ThreadMessage, ThreadParticipation } from "@amends-dev/core/thread"
import { Turn, TurnStore } from "@amends-dev/core/turn"
import type { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as AgentSync from "@amends-dev/sync/AgentSync"
import * as ChannelSync from "@amends-dev/sync/ChannelSync"
import * as ConnectionSync from "@amends-dev/sync/ConnectionSync"
import * as GroupSync from "@amends-dev/sync/GroupSync"
import * as NotificationSync from "@amends-dev/sync/NotificationSync"
import * as ReplicaSync from "@amends-dev/sync/ReplicaSync"
import * as SyncClient from "@amends-dev/sync/SyncClient"
import * as SyncSchema from "@amends-dev/sync/SyncSchema"
import * as TaskSync from "@amends-dev/sync/TaskSync"
import * as ThreadSync from "@amends-dev/sync/ThreadSync"
import * as TurnSync from "@amends-dev/sync/TurnSync"
import * as WorkspaceSync from "@amends-dev/sync/WorkspaceSync"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import type * as IndexedDbQueryBuilder from "@effect/platform-browser/IndexedDbQueryBuilder"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import type * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
import * as RpcClient from "effect/rpc/RpcClient"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Api from "../api.ts"
import { foldAccents, groupName, messageWords } from "../seen.ts"
import * as Drafts from "./Drafts.ts"
import * as Pending from "./Pending.ts"
import * as Replica from "./Replica.ts"
import * as SyncKey from "./SyncKey.ts"

/** Whose store to open, of which workspace and as which member of it, on which host, and the session. */
export interface Options {
  readonly apiUrl: string
  readonly token: string
  readonly humanId: Identity.HumanId
  readonly workspaceId: WorkspaceId.WorkspaceId
  readonly memberId: MemberId.MemberId
}

const makeWrite = EventLog.makeClient(SyncSchema.SyncSchema)

/** The place of the records the workspace holds itself, such as its members, groups, and roles. */
export const workspacePlace = ReplicaRecord.Place.cases.Workspace.make({})

const byPublished = Order.mapInput(DateTime.Order, (message: ThreadMessage.ThreadMessage) => message.publishedAt)

/** How far the member has read a thread, from their positions in it; nothing read is 0. */
const readThroughOf = (positions: ReadonlyArray<Pending.Held<Replica.RecordOf<"ThreadPosition">>>) =>
  positions.reduce((through, { record }) => Math.max(through, record.value.readThrough), 0)

/** Write an action, `write("ThreadMessagePosted", { threadId, text, mentions })`, as eventlog's client does. */
export type Write = Effect.Success<typeof makeWrite>

const sameAuthor = Schema.toEquivalence(ThreadMessage.Author)

/**
 * A thread as its group lists it for the person: its opening message, its task, how many messages follow the
 * opening and who wrote them, when it was last active, and how much they have not read.
 */
export interface ThreadView {
  readonly thread: Pending.Held<Replica.RecordOf<"Thread">>
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
  readonly task: Option.Option<Task.Task>
  /** How many of its messages come after the opening. */
  readonly replies: number
  /** The authors of those replies, each once, in the order of their first reply. */
  readonly repliers: ReadonlyArray<ThreadMessage.Author>
  /** When its latest message was published, or when it was created while it has none. */
  readonly lastActiveAt: DateTime.Utc
  /** Its activities that count as new, past the member's position. */
  readonly unread: number
}

/** The replies among a thread's `messages`, oldest first: how many follow the opening, and who wrote them. */
export const summarizeReplies = (
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): Pick<ThreadView, "replies" | "repliers"> => {
  const replies = Array.drop(messages, 1)
  return {
    replies: replies.length,
    repliers: Array.dedupeWith(
      replies.map(({ author }) => author),
      sameAuthor
    )
  }
}

/**
 * When the latest of a thread's `messages`, oldest first, was published, or when the thread was created while it
 * has none.
 */
export const deriveLastActiveAt = (
  thread: Thread.Thread,
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): DateTime.Utc =>
  Option.match(Array.last(messages), { onNone: () => thread.createdAt, onSome: (latest) => latest.publishedAt })

/**
 * A task as the workspace lists it: the task, the thread that tracks it with its opening message, its group's
 * name, how many messages follow the opening, when the thread was last active, and whether it is still being
 * started.
 */
export interface TaskView {
  readonly task: Task.Task
  readonly thread: Thread.Thread
  /** Its group's name as the person reads it: a team's own, or a conversation's other members. */
  readonly groupName: string
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
  /** How many of the thread's messages come after the opening. */
  readonly replies: number
  /** When the thread's latest message was published, or when it was created while it has none. */
  readonly lastActiveAt: DateTime.Utc
  /** Whether the thread is still being started. */
  readonly pending: boolean
}

/** What the tasks of a workspace are made of, as the person's unfinished actions leave it. */
export interface TaskRecords {
  readonly memberId: MemberId.MemberId
  readonly tasks: ReadonlyArray<Task.Task>
  readonly threads: ReadonlyArray<Pending.Held<Replica.RecordOf<"Thread">>>
  readonly messages: ReadonlyArray<ThreadMessage.ThreadMessage>
  readonly groups: ReadonlyArray<Group.Group>
  readonly members: ReadonlyArray<Member.Member>
}

/** The messages of each thread among `messages`, oldest first. */
const messagesByThread = (
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): ReadonlyMap<ThreadId.ThreadId, ReadonlyArray<ThreadMessage.ThreadMessage>> => {
  const byThread = new Map<ThreadId.ThreadId, Array<ThreadMessage.ThreadMessage>>()
  for (const message of Array.sort(messages, byPublished)) {
    const earlier = byThread.get(message.threadId)
    if (earlier === undefined) byThread.set(message.threadId, [message])
    else earlier.push(message)
  }
  return byThread
}

/**
 * The `tasks` in the order given, each with its thread, its group's name as the person reads it among `members`,
 * and the summary of the thread's messages. A task whose thread or group the replica lacks is left out, since it
 * could not be opened.
 */
export const viewTasks = ({
  memberId,
  tasks,
  threads,
  messages,
  groups,
  members
}: TaskRecords): ReadonlyArray<TaskView> => {
  const heldThreads = new Map(threads.map((held) => [held.record.value.id, held] as const))
  const knownGroups = new Map(groups.map((group) => [group.id, group] as const))
  const written = messagesByThread(messages)

  return tasks.flatMap((task): ReadonlyArray<TaskView> => {
    const held = heldThreads.get(task.threadId)
    const group = held === undefined ? undefined : knownGroups.get(held.record.value.groupId)
    if (held === undefined || group === undefined) return []
    const thread = held.record.value
    const threadMessages = written.get(thread.id) ?? []
    return [
      {
        task,
        thread,
        groupName: groupName(group, members, memberId),
        opening: Array.head(threadMessages),
        replies: summarizeReplies(threadMessages).replies,
        lastActiveAt: deriveLastActiveAt(thread, threadMessages),
        pending: held.pending
      }
    ]
  })
}

/** The people the workspace's records name: its members, and the contacts its channels heard from. */
export interface People {
  readonly members: ReadonlyArray<Member.Member>
  readonly contacts: ReadonlyArray<Contact.Contact>
}

/** A group as the person sees it listed: the group, and how many members it has. */
export interface GroupView {
  readonly group: Pending.Held<Replica.RecordOf<"Group">>
  readonly members: number
}

/**
 * `groups` with how many members each has: a direct group has the ones it was made with, and a team the
 * admitted ones among the `memberships` at its place.
 */
const countMembers = (
  groups: ReadonlyArray<Pending.Held<Replica.RecordOf<"Group">>>,
  memberships: ReadonlyArray<Pending.Held<Replica.RecordOf<"GroupMembership">>>
): ReadonlyArray<GroupView> => {
  const admitted = new Map<GroupId.GroupId, number>()
  for (const { record } of memberships)
    if (record.value.status === "active")
      admitted.set(record.value.groupId, (admitted.get(record.value.groupId) ?? 0) + 1)
  return groups.map((group) => ({
    group,
    members:
      group.record.value.kind === "Direct"
        ? group.record.value.memberIds.length
        : (admitted.get(group.record.value.id) ?? 0)
  }))
}

/** The most groups, threads, and people a search gives each. */
export const maxSearchResults = 8

/** A group a search found, with its name as the person reads it. */
export interface GroupMatch {
  readonly group: Group.Group
  readonly name: string
}

/** A thread a search found, with the name of its group and the words the person reads it by: its title, or its opening's. */
export interface ThreadMatch {
  readonly thread: Thread.Thread
  readonly groupName: string
  readonly words: string
}

/**
 * What a search found in the workspace: the groups by their names, the threads by their titles and their
 * openings' words, and the active members, other than the person, by their names, each at most
 * `maxSearchResults`, in the order of the records.
 */
export interface SearchResults {
  readonly groups: ReadonlyArray<GroupMatch>
  readonly threads: ReadonlyArray<ThreadMatch>
  readonly people: ReadonlyArray<Member.Member>
}

/** What a search reads of the replica, as the person's unfinished actions leave it. */
export interface Searched {
  readonly memberId: MemberId.MemberId
  readonly groups: ReadonlyArray<Group.Group>
  readonly members: ReadonlyArray<Member.Member>
  readonly threads: ReadonlyArray<Thread.Thread>
  readonly messages: ReadonlyArray<ThreadMessage.ThreadMessage>
}

const noMatches: SearchResults = { groups: [], threads: [], people: [] }

/** The first message published in each thread among `messages`. */
const openingsOf = (
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): ReadonlyMap<ThreadId.ThreadId, ThreadMessage.ThreadMessage> => {
  const openings = new Map<ThreadId.ThreadId, ThreadMessage.ThreadMessage>()
  for (const message of messages) {
    const opening = openings.get(message.threadId)
    if (opening === undefined || DateTime.isLessThan(message.publishedAt, opening.publishedAt))
      openings.set(message.threadId, message)
  }
  return openings
}

/** What the message says, as a reader hears it, while it has text to read; a deleted one has none. */
const wordsOfText = (message: ThreadMessage.ThreadMessage | undefined, members: ReadonlyArray<Member.Member>) =>
  message !== undefined && ThreadMessage.Content.isAnyOf(["Text"])(message.content)
    ? messageWords(message, members)
    : undefined

/**
 * What in `searched` has `query` in it, whatever its case or accents, and nothing for a query of spaces: the
 * groups whose names the person reads, the threads whose titles or whose openings' words, a mention as the
 * member's current name, and the active members, other than the person, whose names. A thread whose group
 * the replica lacks is left out, since it could not be opened.
 */
export const findMatches = (
  query: string,
  { memberId, groups, members, threads, messages }: Searched
): SearchResults => {
  const wanted = foldAccents(query.trim())
  if (wanted === "") return noMatches

  const contains = (text: string | null | undefined) => text != null && foldAccents(text).includes(wanted)
  const openings = openingsOf(messages)
  const named = groups.map((group): GroupMatch => ({ group, name: groupName(group, members, memberId) }))

  return {
    groups: named.filter(({ name }) => contains(name)).slice(0, maxSearchResults),
    threads: threads
      .flatMap((thread): ReadonlyArray<ThreadMatch> => {
        const openingWords = wordsOfText(openings.get(thread.id), members)
        const group = named.find((match) => match.group.id === thread.groupId)
        const words = thread.title ?? openingWords
        return group === undefined || words === undefined || !(contains(thread.title) || contains(openingWords))
          ? []
          : [{ thread, groupName: group.name, words }]
      })
      .slice(0, maxSearchResults),
    people: members
      .filter((member) => member.id !== memberId && member.status === "active" && contains(member.name))
      .slice(0, maxSearchResults)
  }
}

/**
 * A group as the person sees it open: the group, while the replica holds it, its admissions, and the
 * person's own follow of it, when they have one.
 */
export interface GroupDetail {
  readonly group: Option.Option<Pending.Held<Replica.RecordOf<"Group">>>
  readonly memberships: ReadonlyArray<Pending.Held<Replica.RecordOf<"GroupMembership">>>
  readonly follow: Option.Option<Pending.Held<Replica.RecordOf<"GroupFollow">>>
}

/** One of a thread's turns, and whether nothing but who may direct its agent keeps it from running again. */
export interface TurnView {
  readonly turn: Pending.Held<Replica.RecordOf<"Turn">>
  readonly retryOpen: boolean
}

/**
 * A thread as the person sees it open: the thread, while the replica holds it, its messages, oldest
 * first, their own part in it, the sequence of its latest activity, how far they have read it, the
 * task it tracks, and its agents' turns, oldest first.
 */
export interface ThreadDetail {
  readonly thread: Option.Option<Pending.Held<Replica.RecordOf<"Thread">>>
  readonly messages: ReadonlyArray<Pending.Held<Replica.RecordOf<"ThreadMessage">>>
  readonly participation: Option.Option<Pending.Held<Replica.RecordOf<"ThreadParticipation">>>
  readonly latest: number
  readonly readThrough: number
  readonly task: Option.Option<Pending.Held<Replica.RecordOf<"Task">>>
  readonly turns: ReadonlyArray<TurnView>
}

const byCreated = Order.mapInput(
  DateTime.Order,
  ({ record }: Pending.Held<Replica.RecordOf<"Turn">>) => record.value.createdAt
)

/** Where `turn`'s agent stands on its thread, from the thread's turns and who takes part in it. */
const standingOf = (
  turn: Replica.RecordOf<"Turn">["value"],
  turns: ReadonlyArray<Replica.RecordOf<"Turn">["value"]>,
  participations: ReadonlyArray<Replica.RecordOf<"ThreadParticipation">["value"]>
): Turn.Standing => {
  const agents = turns.filter(({ memberId }) => memberId === turn.memberId)
  return {
    active: agents.some(({ status }) => Turn.active(status)),
    latest: TurnStore.latestOf(agents)?.id,
    participating: participations.some(({ id, status }) => id === turn.participationId && status === "active")
  }
}

/**
 * A thread's turns as the person sees them, oldest first, each with whether nothing but who may
 * direct its agent keeps it from running again, by where its agent stands among the thread's turns
 * and `participations`.
 */
export const viewTurns = (
  turns: ReadonlyArray<Pending.Held<Replica.RecordOf<"Turn">>>,
  participations: ReadonlyArray<Replica.RecordOf<"ThreadParticipation">["value"]>
): ReadonlyArray<TurnView> => {
  const values = turns.map(({ record }) => record.value)
  return Array.sort(turns, byCreated).map((turn) => ({
    turn,
    retryOpen:
      Turn.whyNotRetryable(turn.record.value, standingOf(turn.record.value, values, participations)) === undefined
  }))
}

/**
 * A notification as the person's inbox shows it: the thread it comes from, with its opening
 * message, and the message its activity is about, when the replica holds them.
 */
export interface InboxEntry {
  readonly notification: Pending.Held<Replica.RecordOf<"Notification">>
  readonly thread: Option.Option<Thread.Thread>
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
  readonly message: Option.Option<ThreadMessage.ThreadMessage>
}

/** The message an activity is about, when it names one. */
const messageIdOf = (activity: Replica.RecordOf<"ThreadActivity"> | undefined): unknown =>
  activity !== undefined && Predicate.hasProperty(activity.value.details, "messageId")
    ? activity.value.details.messageId
    : undefined

/** An action of the person's the server has not completed, its payload decoded, and why it was refused. */
export interface ActionView {
  readonly key: string
  readonly tag: string
  readonly payload: unknown
  readonly rejection: Option.Option<CoreError.Rejection>
}

type QueryError = IndexedDbQueryBuilder.IndexedDbQueryError

/**
 * A store, open for as long as the scope that opened it. Its reads are the replica as the person's
 * unfinished actions leave it, and fail when the replica cannot be read, or a commit cannot be
 * written to it.
 */
export class Store extends Context.Service<
  Store,
  {
    readonly write: Write
    /** The records of `kind` at `place`, and again after each change to them or to the person's actions. */
    readonly list: <Kind extends ReplicaRecord.Kind>(
      kind: Kind,
      place: ReplicaRecord.Place
    ) => Stream.Stream<ReadonlyArray<Pending.Held<Replica.RecordOf<Kind>>>, QueryError>
    /** Every record of `kind`, wherever it sits, and again after each change to them or to the person's actions. */
    readonly every: <Kind extends ReplicaRecord.Kind>(
      kind: Kind
    ) => Stream.Stream<ReadonlyArray<Pending.Held<Replica.RecordOf<Kind>>>, QueryError>
    /** The workspace's members, and again after each change to them or to the person's actions. */
    readonly members: Stream.Stream<ReadonlyArray<Member.Member>, QueryError>
    /** The workspace's contacts, and again after each change to them or to the person's actions. */
    readonly contacts: Stream.Stream<ReadonlyArray<Contact.Contact>, QueryError>
    /** The workspace's members and contacts together, and again after each change to either. */
    readonly people: Stream.Stream<People, QueryError>
    /** The threads of `groupId`, each with its opening message, and again after each change. */
    readonly threads: (groupId: GroupId.GroupId) => Stream.Stream<ReadonlyArray<ThreadView>, QueryError>
    /** Every task the replica holds, with the thread that tracks it and its group's name, and again after each change. */
    readonly tasks: Stream.Stream<ReadonlyArray<TaskView>, QueryError>
    /** The thread `threadId` as the person sees it open, and again after each change. */
    readonly thread: (threadId: ThreadId.ThreadId) => Stream.Stream<ThreadDetail, QueryError>
    /** Every group the replica holds, each with how many members it has, and again after each change. */
    readonly groups: Stream.Stream<ReadonlyArray<GroupView>, QueryError>
    /** The group `groupId` as the person sees it open, and again after each change. */
    readonly group: (groupId: GroupId.GroupId) => Stream.Stream<GroupDetail, QueryError>
    /** What the person may do, from their active assignments and the workspace's roles, and again after each change. */
    readonly grants: Stream.Stream<ReadonlyArray<Grant.Grant>, QueryError>
    /** The person's notifications as their inbox shows them, and again after each change. */
    readonly inbox: Stream.Stream<ReadonlyArray<InboxEntry>, QueryError>
    /** What matches `query` in the workspace as the person sees it now, nothing for an empty one. */
    readonly search: (query: string) => Effect.Effect<SearchResults, QueryError>
    /** The person's actions the server has not completed, and again after each change to them. */
    readonly actions: Stream.Stream<ReadonlyArray<ActionView>, QueryError>
    /** Who has the workspace open and where they type, while the host can be reached; no one while it can't. */
    readonly present: Stream.Stream<ReadonlyArray<Presence.Present>>
    readonly dismiss: Replica.Replica["Service"]["dismiss"]
    /** The person's draft at a place, which stays in this browser. */
    readonly draft: Drafts.Drafts["Service"]["get"]
    /** Keep the person's draft at a place, or forget it, given no text. */
    readonly saveDraft: Drafts.Drafts["Service"]["save"]
  }
>()("@amends-dev/app-v2/store/Store") {}

/** The first value `stream` gives, for a read made once; a read of the replica always gives one. */
const readOnce = <A, E>(stream: Stream.Stream<A, E>): Effect.Effect<A, E> =>
  Effect.flatMap(Stream.runHead(stream), (head) => Effect.orDie(Effect.fromOption(head)))

/** The prefix of every database the person's stores keep on the host at `apiUrl`. */
const databasePrefix = (apiUrl: string, humanId: Identity.HumanId) => `amends/${apiUrl}/${humanId}/`

/**
 * Apply each `ReplicaChanged` to the replica. Eventlog logs a handler's failure and records the
 * entry anyway, so a failure completes `failed` instead, which ends the store's reads.
 */
const layerReplicaChanges = (failed: Deferred.Deferred<never, QueryError>) =>
  EventLog.group(ReplicaSync.Changes, (handlers) =>
    handlers.handle("ReplicaChanged", ({ payload }) =>
      Effect.flatMap(Replica.Replica, (replica) => replica.apply(payload)).pipe(
        Effect.catch((error) => Effect.asVoid(Deferred.fail(failed, error)))
      )
    )
  )

/** Find a record as the person sees it: as the replica holds it, and their unfinished actions leave it. */
const findSeen =
  (replica: Replica.Replica["Service"], author: Pick<Options, "workspaceId" | "memberId">): Pending.Find =>
  (key) =>
    Effect.gen(function* () {
      const record = yield* replica.get(key)
      const pending = yield* Effect.flatMap(replica.getActions, (actions) => Pending.unfinished(actions, author))
      return Pending.find(key, record, pending)
    })

/**
 * Hold each of `group`'s actions until the server completes it, with the records `Pending` says it
 * creates, from its payload and what the person sees. A local handler runs before eventlog journals
 * the action, so one that fails fails the write itself.
 */
const layerActions = <Events extends Event.Any>(
  group: EventGroup.EventGroup<Events>,
  author: Pick<Options, "workspaceId" | "memberId">
): Layer.Layer<Event.ToService<Events>, never, Replica.Replica | Crypto.Crypto | EventLog.Registry> =>
  EventLog.group(group, (handlers) => {
    // Every action is held alike, so its handler is built from the group's own events.
    let built: EventLog.Handlers<unknown, Event.Any> = handlers as never
    for (const tag of Object.keys(group.events)) {
      const { creates } = Pending.effectsOf(tag)
      built = built.handle(tag, ({ payload, entry }) =>
        Effect.gen(function* () {
          const action = {
            ...author,
            key: Request.Key.make(entry.idString),
            writtenAt: DateTime.makeUnsafe(EventJournal.entryIdMillis(entry.id))
          }
          const replica = yield* Replica.Replica
          yield* replica.hold({
            key: action.key,
            tag,
            payload: entry.payload,
            writtenAt: action.writtenAt,
            creates: creates === undefined ? [] : yield* creates(payload, action, findSeen(replica, author))
          })
        }).pipe(Effect.orDie)
      ) as never
    }
    return built as never
  }) as never

/** How long to wait before watching presence again after the host could not be reached. */
const presenceRetry = "5 seconds"

/** Who is present in the workspace, as the host reports it, and no one for a while when it can't be reached. */
const watchPresence = (options: Options) =>
  Stream.unwrap(
    Effect.map(Api.memberClient(options.apiUrl, options.token, options.workspaceId), (client) =>
      Stream.unwrap(client.presence.watch())
    )
  ).pipe(
    Stream.catchCause(() => Stream.succeed<ReadonlyArray<Presence.Present>>([])),
    Stream.repeat(Schedule.spaced(presenceRetry))
  )

/** As often as eventlog tries a remote again: quickly at first, then every ten seconds. */
const reconnecting = Schedule.min([Schedule.exponential("200 millis", 1.5), Schedule.spaced("10 seconds")])

/**
 * Register the browser's key, then join the host's sync server as the event log's remote until its
 * connection drops. Eventlog's remote asks for changes from the position it first asked from for as
 * long as it lives, which after a drop the server would answer with a reset, and a reset leaves out
 * how the actions committed before it ended; a remote built anew asks from what the replica holds.
 */
const connectOnce = (options: Options, identity: EventLog.Identity["Service"]) =>
  Effect.gen(function* () {
    const client = yield* Api.client(options.apiUrl, options.token)
    yield* client.me.registerSyncKey({ params: { publicKey: identity.publicKey } })
    const dropped = yield* Deferred.make<void>()
    let connected = false
    const hooks = RpcClient.ConnectionHooks.of({
      onConnect: Effect.sync(() => {
        connected = true
      }),
      // Attempts that never connected are the client's own to retry.
      onDisconnect: Effect.suspend(() =>
        connected ? Effect.asVoid(Deferred.succeed(dropped, undefined)) : Effect.void
      )
    })
    yield* Layer.build(
      SyncClient.layer(options.apiUrl).pipe(Layer.provide(Layer.succeed(RpcClient.ConnectionHooks, hooks)))
    )
    yield* Deferred.await(dropped)
  }).pipe(Effect.scoped)

/** Stay joined to the host's sync server for as long as the store is open, trying again until it can. */
const connect = (options: Options, identity: EventLog.Identity["Service"]) =>
  connectOnce(options, identity).pipe(
    Effect.tapCause((cause) => Effect.logWarning("The store could not reach its host", cause)),
    Effect.retry(reconnecting),
    Effect.forever
  )

/**
 * Open the store `options` names: its replica, its event log, and its remote in the background.
 *
 * @category layers
 */
export const layer = (options: Options) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const identity = yield* SyncKey.forPerson(options.apiUrl, options.humanId)
      const failed = yield* Deferred.make<never, QueryError>()
      const named = databasePrefix(options.apiUrl, options.humanId) + options.workspaceId
      const handlers = Layer.mergeAll(
        layerActions(WorkspaceSync.Actions, options),
        layerActions(GroupSync.Actions, options),
        layerActions(ThreadSync.Actions, options),
        layerActions(TaskSync.Actions, options),
        layerActions(TurnSync.Actions, options),
        layerActions(NotificationSync.Actions, options),
        layerActions(ConnectionSync.Actions, options),
        layerActions(AgentSync.Actions, options),
        layerActions(ChannelSync.Actions, options),
        layerReplicaChanges(failed)
      )
      const eventLog = EventLog.layer(SyncSchema.SyncSchema, handlers).pipe(
        Layer.provide(EventJournal.layerIndexedDb({ database: `${named}/journal` })),
        Layer.provide(Layer.succeed(EventLog.Identity, identity)),
        Layer.provide(Layer.succeed(EventLog.CurrentStoreId, EventLogMessage.StoreId.make(options.workspaceId)))
      )
      const remote = Layer.effectDiscard(Effect.forkScoped(connect(options, identity)))
      const store = Layer.effect(
        Store,
        Effect.gen(function* () {
          const replica = yield* Replica.Replica
          const drafts = yield* Drafts.Drafts
          // One watch of the host's presence, shared by whoever reads it, and dropped once no one does.
          const present = yield* Stream.share(watchPresence(options), {
            capacity: 1,
            strategy: "sliding",
            replay: 1,
            idleTimeToLive: presenceRetry
          })
          const untilFailed = <A, E>(stream: Stream.Stream<A, E>) =>
            Stream.interruptWhen(stream, Deferred.await(failed))
          const unfinished = Stream.mapEffect(replica.actions, (actions) => Pending.unfinished(actions, options))
          /** What `read` gives, as the person's unfinished actions leave it. */
          const withPending = <A, B>(
            read: Stream.Stream<A, QueryError>,
            view: (records: A, pending: ReadonlyArray<Pending.Unfinished>) => B
          ) =>
            untilFailed(Stream.map(Stream.zipLatest(read, unfinished), ([records, pending]) => view(records, pending)))
          const list = <Kind extends ReplicaRecord.Kind>(kind: Kind, place: ReplicaRecord.Place) =>
            withPending(replica.list(kind, place), (records, pending) => Pending.overlay(kind, place, records, pending))
          const every = <Kind extends ReplicaRecord.Kind>(kind: Kind) =>
            withPending(replica.every(kind), (records, pending) => Pending.overlay(kind, undefined, records, pending))
          const members = Stream.map(list("Member", workspacePlace), (held) => held.map(({ record }) => record.value))
          const contacts = Stream.map(list("Contact", workspacePlace), (held) => held.map(({ record }) => record.value))
          return Store.of({
            write: yield* makeWrite,
            list,
            every,
            members,
            contacts,
            people: Stream.zipLatestWith(members, contacts, (members, contacts): People => ({ members, contacts })),
            threads: (groupId) =>
              withPending(replica.threads(groupId), (threads, pending) =>
                Pending.overlay(
                  "Thread",
                  ReplicaRecord.Place.cases.Group.make({ groupId }),
                  threads.map(({ thread }) => thread),
                  pending
                ).map((thread): ThreadView => {
                  const threadId = thread.record.value.id
                  const place = ReplicaRecord.Place.cases.Thread.make({ threadId })
                  const held = threads.find((records) => records.thread.value.id === threadId)
                  const messages = Array.sort(
                    Pending.overlay("ThreadMessage", place, held?.messages ?? [], pending).map(
                      ({ record }) => record.value
                    ),
                    byPublished
                  )
                  const positions = Pending.overlay("ThreadPosition", place, held?.positions ?? [], pending)
                  const readThrough = readThroughOf(positions)
                  return {
                    thread,
                    opening: Array.head(messages),
                    task: Option.map(
                      Array.head(Pending.overlay("Task", place, held?.tasks ?? [], pending)),
                      ({ record }) => record.value
                    ),
                    ...summarizeReplies(messages),
                    lastActiveAt: deriveLastActiveAt(thread.record.value, messages),
                    unread: (held?.activities ?? []).filter(
                      ({ value }) => value.newActivity && value.sequence > readThrough
                    ).length
                  }
                })
              ),
            tasks: Stream.map(
              Stream.zipLatestAll(
                every("Task"),
                every("Thread"),
                every("ThreadMessage"),
                list("Group", workspacePlace),
                members
              ),
              ([tasks, threads, messages, groups, members]) =>
                viewTasks({
                  memberId: options.memberId,
                  tasks: tasks.map(({ record }) => record.value),
                  threads,
                  messages: messages.map(({ record }) => record.value),
                  groups: groups.map(({ record }) => record.value),
                  members
                })
            ),
            thread: (threadId) =>
              withPending(replica.thread(threadId), (contents, pending): ThreadDetail => {
                const place = ReplicaRecord.Place.cases.Thread.make({ threadId })
                const participations = Pending.overlay("ThreadParticipation", place, contents.participations, pending)
                return {
                  // A thread the person started sits in its group among their unfinished actions.
                  thread: Array.findFirst(
                    Pending.overlay("Thread", undefined, Option.toArray(contents.thread), pending),
                    ({ record }) => record.value.id === threadId
                  ),
                  messages: Array.sort(
                    Pending.overlay("ThreadMessage", place, contents.messages, pending),
                    Order.mapInput(
                      byPublished,
                      ({ record }: Pending.Held<Replica.RecordOf<"ThreadMessage">>) => record.value
                    )
                  ),
                  participation: Array.findFirst(participations, ({ record }) =>
                    ThreadParticipation.Participant.matchOrElse(
                      record.value.participant,
                      { Member: ({ memberId }) => memberId === options.memberId },
                      () => false
                    )
                  ),
                  latest: contents.activities.reduce((latest, { value }) => Math.max(latest, value.sequence), 0),
                  readThrough: readThroughOf(Pending.overlay("ThreadPosition", place, contents.positions, pending)),
                  task: Array.head(Pending.overlay("Task", place, contents.tasks, pending)),
                  turns: viewTurns(
                    Pending.overlay("Turn", place, contents.turns, pending),
                    participations.map(({ record }) => record.value)
                  )
                }
              }),
            groups: Stream.map(
              Stream.zipLatest(list("Group", workspacePlace), every("GroupMembership")),
              ([groups, memberships]) => countMembers(groups, memberships)
            ),
            group: (groupId) => {
              const place = ReplicaRecord.Place.cases.Group.make({ groupId })
              return Stream.map(
                Stream.zipLatest(
                  list("Group", workspacePlace),
                  Stream.zipLatest(list("GroupMembership", place), list("GroupFollow", place))
                ),
                ([groups, [memberships, follows]]): GroupDetail => ({
                  group: Array.findFirst(groups, ({ record }) => record.value.id === groupId),
                  memberships,
                  follow: Array.findFirst(follows, ({ record }) => record.value.memberId === options.memberId)
                })
              )
            },
            grants: Stream.map(
              Stream.zipLatest(list("Role", workspacePlace), list("Assignment", workspacePlace)),
              ([roles, assignments]) =>
                GrantResolver.grantsOf(
                  assignments.flatMap(({ record }) =>
                    record.value.memberId === options.memberId && record.value.status === "active" ? [record.value] : []
                  ),
                  (roleId) => roles.find(({ record }) => record.value.id === roleId)?.record.value
                )
            ),
            inbox: withPending(replica.inbox, ({ notifications, threads }, pending) =>
              Pending.overlay("Notification", undefined, notifications, pending).map((notification): InboxEntry => {
                const source = notification.record.value.thread
                const held =
                  source === undefined ? undefined : threads.find(({ thread }) => thread.value.id === source.threadId)
                const messageId = messageIdOf(held?.activities.find(({ value }) => value.sequence === source?.sequence))
                return {
                  notification,
                  thread: Option.fromUndefinedOr(held?.thread.value),
                  opening: Array.head(
                    Array.sort(
                      (held?.messages ?? []).map(({ value }) => value),
                      byPublished
                    )
                  ),
                  message: Option.fromUndefinedOr(held?.messages.find(({ value }) => value.id === messageId)?.value)
                }
              })
            ),
            search: (query) =>
              readOnce(
                Stream.zipLatestAll(list("Group", workspacePlace), members, every("Thread"), every("ThreadMessage"))
              ).pipe(
                Effect.map(([groups, members, threads, messages]) =>
                  findMatches(query, {
                    memberId: options.memberId,
                    groups: groups.map(({ record }) => record.value),
                    members,
                    threads: threads.map(({ record }) => record.value),
                    messages: messages.map(({ record }) => record.value)
                  })
                )
              ),
            actions: untilFailed(
              Stream.mapEffect(replica.actions, (actions) =>
                Effect.forEach(actions, ({ key, tag, payload, rejection }) =>
                  Effect.map(Pending.decodePayload(tag, payload), (decoded): ActionView => ({
                    key,
                    tag,
                    payload: decoded,
                    rejection
                  }))
                )
              )
            ),
            present,
            dismiss: replica.dismiss,
            draft: drafts.get,
            saveDraft: drafts.save
          })
        })
      )
      return Layer.mergeAll(store, remote).pipe(
        Layer.provide(eventLog),
        Layer.provide(Replica.layer(`${named}/replica`)),
        Layer.provide(Drafts.layer(`${named}/drafts`))
      )
    })
  )

/**
 * Delete every store the person kept on the host at `apiUrl`, and the identity they synced with,
 * as signing out does. A store still open is deleted once it closes.
 *
 * @category destructors
 */
export const forgetPerson = Effect.fnUntraced(function* (apiUrl: string, humanId: Identity.HumanId) {
  const { indexedDB } = yield* IndexedDb.IndexedDb
  const prefix = databasePrefix(apiUrl, humanId)
  const databases = yield* Effect.tryPromise(() => indexedDB.databases())
  for (const { name } of databases) if (name?.startsWith(prefix) === true) indexedDB.deleteDatabase(name)
  yield* SyncKey.forget(apiUrl, humanId)
})
