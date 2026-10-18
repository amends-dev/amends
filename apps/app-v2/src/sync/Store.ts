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

import type { CoreError } from "@amends-dev/core/error"
import type { GroupId } from "@amends-dev/core/group"
import type { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import type { Task } from "@amends-dev/core/task"
import { type Thread, type ThreadId, type ThreadMessage, ThreadParticipation } from "@amends-dev/core/thread"
import { Turn, TurnStore } from "@amends-dev/core/turn"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
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
import * as Stream from "effect/Stream"
import * as Api from "../api.ts"
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

const byPublished = Order.mapInput(DateTime.Order, (message: ThreadMessage.ThreadMessage) => message.publishedAt)

/** How far the member has read a thread, from their positions in it; nothing read is 0. */
const readThroughOf = (positions: ReadonlyArray<Pending.Held<Replica.RecordOf<"ThreadPosition">>>) =>
  positions.reduce((through, { record }) => Math.max(through, record.value.readThrough), 0)

/** Write an action, `write("ThreadMessagePosted", { threadId, text, mentions })`, as eventlog's client does. */
export type Write = Effect.Success<typeof makeWrite>

/** A thread as its group lists it for the person: its opening message, its task, and how much they have not read. */
export interface ThreadView {
  readonly thread: Pending.Held<Replica.RecordOf<"Thread">>
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
  readonly task: Option.Option<Task.Task>
  /** Its activities that count as new, past the member's position. */
  readonly unread: number
}

/** One of a thread's turns, and whether nothing but who may direct its agent keeps it from running again. */
export interface TurnView {
  readonly turn: Pending.Held<Replica.RecordOf<"Turn">>
  readonly retryOpen: boolean
}

/**
 * A thread as the person sees it open: its messages, oldest first, their own part in it, the
 * sequence of its latest activity, how far they have read it, the task it tracks, and its agents'
 * turns, oldest first.
 */
export interface ThreadDetail {
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
    /** The threads of `groupId`, each with its opening message, and again after each change. */
    readonly threads: (groupId: GroupId.GroupId) => Stream.Stream<ReadonlyArray<ThreadView>, QueryError>
    /** The thread `threadId` as the person sees it open, and again after each change. */
    readonly thread: (threadId: ThreadId.ThreadId) => Stream.Stream<ThreadDetail, QueryError>
    /** The person's notifications as their inbox shows them, and again after each change. */
    readonly inbox: Stream.Stream<ReadonlyArray<InboxEntry>, QueryError>
    /** The person's actions the server has not completed, and again after each change to them. */
    readonly actions: Stream.Stream<ReadonlyArray<ActionView>, QueryError>
    readonly dismiss: Replica.Replica["Service"]["dismiss"]
    /** The person's draft at a place, which stays in this browser. */
    readonly draft: Drafts.Drafts["Service"]["get"]
    /** Keep the person's draft at a place, or forget it, given no text. */
    readonly saveDraft: Drafts.Drafts["Service"]["save"]
  }
>()("@amends-dev/app-v2/sync/Store") {}

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
          const untilFailed = <A, E>(stream: Stream.Stream<A, E>) =>
            Stream.interruptWhen(stream, Deferred.await(failed))
          const unfinished = Stream.mapEffect(replica.actions, (actions) => Pending.unfinished(actions, options))
          /** What `read` gives, as the person's unfinished actions leave it. */
          const withPending = <A, B>(
            read: Stream.Stream<A, QueryError>,
            view: (records: A, pending: ReadonlyArray<Pending.Unfinished>) => B
          ) =>
            untilFailed(Stream.map(Stream.zipLatest(read, unfinished), ([records, pending]) => view(records, pending)))
          return Store.of({
            write: yield* makeWrite,
            list: (kind, place) =>
              withPending(replica.list(kind, place), (records, pending) =>
                Pending.overlay(kind, place, records, pending)
              ),
            every: (kind) =>
              withPending(replica.every(kind), (records, pending) =>
                Pending.overlay(kind, undefined, records, pending)
              ),
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
                  const messages = Pending.overlay("ThreadMessage", place, held?.messages ?? [], pending)
                  const positions = Pending.overlay("ThreadPosition", place, held?.positions ?? [], pending)
                  const readThrough = readThroughOf(positions)
                  return {
                    thread,
                    opening: Array.head(
                      Array.sort(
                        messages.map(({ record }) => record.value),
                        byPublished
                      )
                    ),
                    task: Option.map(
                      Array.head(Pending.overlay("Task", place, held?.tasks ?? [], pending)),
                      ({ record }) => record.value
                    ),
                    unread: (held?.activities ?? []).filter(
                      ({ value }) => value.newActivity && value.sequence > readThrough
                    ).length
                  }
                })
              ),
            thread: (threadId) =>
              withPending(replica.thread(threadId), (contents, pending): ThreadDetail => {
                const place = ReplicaRecord.Place.cases.Thread.make({ threadId })
                const participations = Pending.overlay("ThreadParticipation", place, contents.participations, pending)
                return {
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
