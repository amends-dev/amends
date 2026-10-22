/**
 * A store open in the browser: one person's of one workspace, as eventlog keeps it, the replica its changes keep, and
 * the person's drafts there. Its event log journals into an IndexedDB database of its own. The actions the person
 * writes, `write`, are held in the replica as pending, with what each is expected to create, until the server runs
 * them; each `ReplicaChanged` the server writes back is applied to the replica. The host's sync server is the log's
 * remote, reached in the background once the browser's sync key is registered, and tried again until it is, so a store
 * opens, reads, and takes actions offline; eventlog sends what was written while it could not. A store's databases are
 * named for the host, the person, and the workspace, since positions and entry IDs are only unique within one.
 */

import { type Grant, GrantResolver } from "@amends-dev/core/authorization"
import type { Contact } from "@amends-dev/core/channel"
import type { CoreError } from "@amends-dev/core/error"
import type { GroupId } from "@amends-dev/core/group"
import type { Identity } from "@amends-dev/core/identity"
import type { Presence } from "@amends-dev/core/presence"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import type { ThreadId } from "@amends-dev/core/thread"
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
import type * as Option from "effect/Option"
import * as RpcClient from "effect/rpc/RpcClient"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as Api from "../api.ts"
import { listJumpTargets, type JumpTargets } from "../data/search.ts"
import * as Drafts from "./Drafts.ts"
import * as Pending from "./Pending.ts"
import * as GroupQuery from "./query/groups.ts"
import * as InboxQuery from "./query/inbox.ts"
import * as TaskQuery from "./query/tasks.ts"
import * as ThreadQuery from "./query/threads.ts"
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

/** Write an action, `write("ThreadMessagePosted", { threadId, text, mentions })`, as eventlog's client does. */
export type Write = Effect.Success<typeof makeWrite>

/** The people the workspace's records name: its members, and the contacts its channels heard from. */
export interface People {
  readonly members: ReadonlyArray<Member.Member>
  readonly contacts: ReadonlyArray<Contact.Contact>
}

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
    readonly threads: (groupId: GroupId.GroupId) => Stream.Stream<ReadonlyArray<ThreadQuery.ThreadView>, QueryError>
    /**
     * Every task the replica holds, with the thread that tracks it and the place of its group, and again after each
     * change.
     */
    readonly tasks: Stream.Stream<ReadonlyArray<TaskQuery.TaskView>, QueryError>
    /** The thread `threadId` as the person sees it open, and again after each change. */
    readonly thread: (threadId: ThreadId.ThreadId) => Stream.Stream<ThreadQuery.ThreadDetail, QueryError>
    /** Every group the replica holds, each with how many members it has, and again after each change. */
    readonly groups: Stream.Stream<ReadonlyArray<GroupQuery.GroupView>, QueryError>
    /** The group `groupId` as the person sees it open, and again after each change. */
    readonly group: (groupId: GroupId.GroupId) => Stream.Stream<GroupQuery.GroupDetail, QueryError>
    /** What the person may do, from their active assignments and the workspace's roles, and again after each change. */
    readonly grants: Stream.Stream<ReadonlyArray<Grant.Grant>, QueryError>
    /** The person's notifications as their inbox shows them, and again after each change. */
    readonly inbox: Stream.Stream<ReadonlyArray<InboxQuery.InboxEntry>, QueryError>
    /** Where the person can jump to in the workspace as they see it, and again after each change. */
    readonly jumpTargets: Stream.Stream<JumpTargets, QueryError>
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
                ThreadQuery.deriveThreads(groupId, threads, pending)
              ),
            tasks: Stream.map(
              Stream.zipLatestAll(
                withPending(replica.tasks, (contents, pending) => ({
                  tasks: Pending.overlay("Task", undefined, contents.tasks, pending),
                  threads: Pending.overlay("Thread", undefined, contents.threads, pending),
                  messages: Pending.overlay("ThreadMessage", undefined, contents.messages, pending)
                })),
                list("Group", workspacePlace),
                members
              ),
              ([{ tasks, threads, messages }, groups, members]) =>
                TaskQuery.deriveTasks({
                  memberId: options.memberId,
                  tasks: tasks.map(({ record }) => record.value),
                  threads,
                  messages: messages.map(({ record }) => record.value),
                  groups: groups.map(({ record }) => record.value),
                  members
                })
            ),
            thread: (threadId) =>
              withPending(replica.thread(threadId), (contents, pending) =>
                ThreadQuery.deriveThread(threadId, options.memberId, contents, pending)
              ),
            groups: Stream.map(
              Stream.zipLatest(list("Group", workspacePlace), every("GroupMembership")),
              ([groups, memberships]) => GroupQuery.countMembers(groups, memberships)
            ),
            group: (groupId) => {
              const place = ReplicaRecord.Place.cases.Group.make({ groupId })
              return Stream.map(
                Stream.zipLatest(
                  list("Group", workspacePlace),
                  Stream.zipLatest(list("GroupMembership", place), list("GroupFollow", place))
                ),
                ([groups, [memberships, follows]]): GroupQuery.GroupDetail => ({
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
            inbox: withPending(replica.inbox, InboxQuery.deriveInbox),
            jumpTargets: Stream.zipLatestAll(
              list("Group", workspacePlace),
              members,
              every("Thread"),
              every("ThreadMessage")
            ).pipe(
              Stream.map(([groups, members, threads, messages]) =>
                listJumpTargets({
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
