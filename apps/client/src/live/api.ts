import { ChangeFeed } from "@amends-dev/core/change-feed"
import { CoreError } from "@amends-dev/core/error"
import { Signal } from "@amends-dev/core/signal"
import { ThreadMessage } from "@amends-dev/core/thread"
import { WorkspaceId } from "@amends-dev/core/workspace"
import * as ApiErrors from "@amends-dev/http/ApiErrors"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { isUnauthorized, type ApiClient } from "../api/client.ts"
import {
  collectionKey,
  directoryKey,
  itemKey,
  workspaceCollections,
  workspaceKey,
  workspaceResources,
  type WorkspaceCollection
} from "../api/keys.ts"
import { errorsOf, retryDelay } from "../api/retry.ts"
import {
  deliverGroupLatest,
  deliverNotification,
  deliverPreview,
  deliverTimelineItem,
  forgetDeliveredItems,
  forgetDeliveredPreviews,
  recordGroupRead,
  recordNotificationsSeen,
  recordReadPosition,
  recordThreadSeen
} from "../conversations/api.ts"
import { posted, typing, typistsAtom } from "../conversations/typing.ts"
import { deliverTurn } from "../turns/api.ts"
import { recordLive, recordMessages } from "./arrivals.ts"
import { watchWake } from "./wake.ts"

export { Signal }

export type ChangeFeedState = Data.TaggedEnum<{
  /** Opening the first connection. */
  Connecting: {}
  /** Changes arrive as they commit. */
  Live: {}
  /** The connection dropped; it resumes after the last change received. */
  Reconnecting: { readonly attempt: number }
  /** Credentials were rejected, or the workspace is no longer available to this member. */
  Ended: { readonly reason: "unauthorized" | "unavailable" }
}>
export const ChangeFeedState = Data.taggedEnum<ChangeFeedState>()

/** Whether a read is one of a group, thread, or turn, which a stale read may name. */
const isCollection = (read: ChangeFeed.Read): read is WorkspaceCollection =>
  (workspaceCollections as ReadonlyArray<string>).includes(read)
/**
 * The keys of the reads a commit made stale, each once, so every stale read refreshes once. An
 * item's key is dropped when its whole collection is stale.
 */
export const staleKeys = (workspaceId: string, stale: ReadonlyArray<ChangeFeed.Stale>): Array<string> => {
  const reads = new Set<string>(),
    collections = new Set<string>(),
    items = new Set<string>()
  for (const { read, id } of stale)
    if (read === "directory") reads.add(directoryKey)
    else if (!isCollection(read)) reads.add(workspaceKey(workspaceId, read))
    else if (id === undefined) collections.add(collectionKey(workspaceId, read))
    else items.add(itemKey(workspaceId, read, id))
  return [
    ...reads,
    ...collections,
    ...[...items].filter((item) => ![...collections].some((prefix) => item.startsWith(`${prefix}:`)))
  ]
}
/** The messages a commit delivered, each in the timeline item that shows it. */
const deliveredMessagesOf = (changes: ReadonlyArray<ChangeFeed.Change>) =>
  changes.flatMap((change) =>
    ChangeFeed.Change.isAnyOf(["TimelineItem"])(change) && "message" in change.item ? [change.item] : []
  )
/** The timeline item a commit delivered at a notification's source, if it delivered that. */
const deliveredSourceOf = (
  changes: ReadonlyArray<ChangeFeed.Change>,
  thread: { readonly threadId: string; readonly sequence: number } | undefined
) => {
  if (thread === undefined) return undefined
  for (const change of changes)
    if (
      ChangeFeed.Change.isAnyOf(["TimelineItem"])(change) &&
      change.item.activity.threadId === thread.threadId &&
      change.item.activity.sequence === thread.sequence
    )
      return change.item
  return undefined
}
/**
 * The reads a signal to the reader's own sessions changes beyond what it carries. Reading a thread
 * settles notifications from it, and seeing notifications settles them, changing the pending
 * counts. Streams take a thread's read position from the signal, the groups list a group's read
 * time, and the inbox what was seen.
 */
export const signalKeys = (workspaceId: string, signal: Signal.Signal): Array<string> =>
  Signal.Signal.matchOrElse(
    signal,
    {
      ThreadRead: () => [workspaceKey(workspaceId, "pending")],
      NotificationsSeen: () => [workspaceKey(workspaceId, "pending")]
    },
    () => []
  )

const unavailable = (cause: Cause.Cause<unknown>) =>
  errorsOf(cause).some(
    (error) => Schema.is(ApiErrors.Denied)(error) && CoreError.DeniedReason.isAnyOf(["NotMember"])(error.reason)
  )
/** How long a connection must stay live before its failure counts as the first in a row. */
const healthy = 10_000
/**
 * Keep one workspace's change stream open, emitting its connection state. Each commit
 * invalidates the reads it affects; a reset invalidates all of them. Reconnection resumes after
 * the last commit received, backing off between failures and retrying at once when the page
 * wakes. Rejected credentials or lost membership end the feed.
 */
const run = Effect.fnUntraced(function* (
  client: ApiClient,
  workspaceId: string,
  states: Queue.Queue<ChangeFeedState, Cause.Done>
) {
  const api = yield* client
  const reactivity = yield* Reactivity.Reactivity
  const registry = yield* AtomRegistry.AtomRegistry
  const typists = typistsAtom(workspaceId)
  const everything = [
    directoryKey,
    ...workspaceResources.map((resource) => workspaceKey(workspaceId, resource)),
    ...workspaceCollections.map((collection) => collectionKey(workspaceId, collection))
  ]
  /** The reads of the reader's own read state, which signals carry and a dropped feed may have missed. */
  const readState = [
    workspaceKey(workspaceId, "groups"),
    workspaceKey(workspaceId, "inbox"),
    workspaceKey(workspaceId, "pending"),
    collectionKey(workspaceId, "streams")
  ]
  const id = Schema.decodeOption(WorkspaceId.WorkspaceId)(workspaceId)
  if (Option.isNone(id)) {
    Queue.offerUnsafe(states, ChangeFeedState.Ended({ reason: "unavailable" }))
    return
  }
  const wake = yield* Queue.sliding<void>(1)
  yield* Effect.acquireRelease(
    Effect.sync(() => watchWake(window, () => Queue.offerUnsafe(wake, undefined))),
    (stop) => Effect.sync(stop)
  )
  type Message = Stream.Success<Effect.Success<ReturnType<typeof api.changeFeed.watch>>>
  let cursor: Extract<Message, { _tag: "Committed" }>["cursor"] | undefined
  let attempt = 0
  let connected = false
  /** The threads whose timelines took items this feed delivered, which a reset forgets. */
  const delivered = { timelines: new Set<string>(), streams: new Set<string>() }
  let liveSince: number | undefined
  const receive = (message: Message): Effect.Effect<void> =>
    ChangeFeed.Message.match(message, {
      Ready: (message) => {
        return Effect.flatMap(Clock.currentTimeMillis, (now) => {
          connected = true
          liveSince = now
          // A feed that resumed after a commit replays the commits it missed, but not its signals.
          const resumed = cursor !== undefined
          if (message.cursor !== null) cursor = message.cursor
          Queue.offerUnsafe(states, ChangeFeedState.Live())
          recordLive(registry, workspaceId, true)
          if (!message.reset) return resumed ? reactivity.invalidate(readState) : Effect.void
          // What was missed may have changed what was delivered: read everything again.
          forgetDeliveredItems(registry, delivered.timelines)
          forgetDeliveredPreviews(registry, delivered.streams)
          delivered.timelines.clear()
          delivered.streams.clear()
          return reactivity.invalidate(everything)
        })
      },
      Committed: (message) => {
        cursor = message.cursor
        const messages = deliveredMessagesOf(message.changes)
        // A member whose message arrived is no longer typing it.
        for (const { activity, message: posting } of messages)
          if (activity.kind === "message.published" && ThreadMessage.Author.isAnyOf(["Member"])(posting.author)) {
            const memberId = posting.author.memberId
            registry.update(typists, (current) => posted(current, activity.threadId, memberId, Date.now()))
          }
        // What the commit changed shows in place, without reading it again.
        for (const change of message.changes)
          ChangeFeed.Change.match(change, {
            TimelineItem: ({ item }) => void delivered.timelines.add(deliverTimelineItem(registry, workspaceId, item)),
            Preview: ({ preview }) => void delivered.streams.add(deliverPreview(registry, workspaceId, preview)),
            GroupLatest: ({ latest }) => deliverGroupLatest(registry, workspaceId, latest),
            Turn: ({ turn }) => deliverTurn(registry, workspaceId, turn)
          })
        // Writes that posted a message wait for the commit that delivers it.
        recordMessages(
          registry,
          workspaceId,
          messages.map((item) => item.message.id)
        )
        // A notification for the reader shows in their inbox with the timeline item it tells of,
        // when the commit delivered that too, and changes their pending counts.
        for (const notification of message.notifications) {
          const source = deliveredSourceOf(message.changes, notification.thread)
          deliverNotification(registry, workspaceId, source === undefined ? { notification } : { notification, source })
        }
        // What it did not deliver, the reader reads again.
        const keys = staleKeys(workspaceId, message.stale)
        return keys.length > 0 ? reactivity.invalidate(keys) : Effect.void
      },
      Signal: (message) => {
        const signal = message.signal
        if (Signal.Signal.isAnyOf(["Typing"])(signal))
          registry.update(typists, (current) => typing(current, signal, Date.now()))
        if (Signal.Signal.isAnyOf(["ThreadRead"])(signal)) {
          recordReadPosition(registry, workspaceId, signal.threadId, signal.readThrough)
          recordThreadSeen(registry, workspaceId, signal.threadId, signal.readThrough, signal.readAt)
        }
        if (Signal.Signal.isAnyOf(["NotificationsSeen"])(signal))
          recordNotificationsSeen(registry, workspaceId, signal.notificationIds, signal.seenAt)
        if (Signal.Signal.isAnyOf(["GroupRead"])(signal))
          recordGroupRead(registry, workspaceId, signal.groupId, signal.readAt)
        const keys = signalKeys(workspaceId, signal)
        return keys.length > 0 ? reactivity.invalidate(keys) : Effect.void
      }
    })
  // Writes stop waiting for commits once the feed is down or gone.
  yield* Effect.addFinalizer(() => Effect.sync(() => recordLive(registry, workspaceId, false)))
  while (true) {
    recordLive(registry, workspaceId, false)
    Queue.offerUnsafe(
      states,
      connected || attempt > 0
        ? ChangeFeedState.Reconnecting({ attempt: Math.max(attempt, 1) })
        : ChangeFeedState.Connecting()
    )
    yield* Queue.clear(wake)
    const connection = api.changeFeed
      .watch({
        query: cursor === undefined ? {} : { after: cursor }
      })
      .pipe(Effect.flatMap(Stream.runForEach(receive)))
    const outcome = yield* Effect.raceFirst(Effect.exit(connection), Queue.take(wake).pipe(Effect.as("wake" as const)))
    // The page woke while connected: the connection may be dead without knowing it.
    if (outcome === "wake") {
      liveSince = undefined
      continue
    }
    const cause = Exit.isFailure(outcome) ? outcome.cause : Cause.empty
    if (isUnauthorized(cause)) {
      Queue.offerUnsafe(states, ChangeFeedState.Ended({ reason: "unauthorized" }))
      return
    }
    if (unavailable(cause)) {
      yield* reactivity.invalidate([directoryKey])
      Queue.offerUnsafe(states, ChangeFeedState.Ended({ reason: "unavailable" }))
      return
    }
    // A connection that stayed up starts over; one that fails as soon as it opens, such as on
    // a replayed commit this client cannot read, keeps backing off.
    const now = yield* Clock.currentTimeMillis
    attempt = liveSince !== undefined && now - liveSince >= healthy ? 1 : attempt + 1
    liveSince = undefined
    Queue.offerUnsafe(states, ChangeFeedState.Reconnecting({ attempt }))
    yield* Effect.raceFirst(Effect.flatMap(retryDelay(attempt, cause), Effect.sleep), Queue.take(wake))
  }
})

const makeFamily = (client: ApiClient) =>
  Atom.family((workspaceId: string) =>
    client.runtime.atom(
      Stream.callback((states: Queue.Queue<ChangeFeedState, Cause.Done>) => run(client, workspaceId, states), {
        bufferSize: 1,
        strategy: "sliding"
      })
    )
  )
const families = new WeakMap<ApiClient, ReturnType<typeof makeFamily>>()
/** One shared stream per workspace, through its client, open while any consumer is mounted. */
export const changeFeed = (client: ApiClient, workspaceId: string) => {
  let family = families.get(client)
  if (!family) {
    family = makeFamily(client)
    families.set(client, family)
  }
  return family(workspaceId)
}
