export { Identity }
import { Group, GroupMembership, GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification, NotificationInbox } from "@amends-dev/core/notification"
import {
  Thread,
  ThreadMessage,
  ThreadParticipation,
  ThreadTimeline,
  ThreadId,
  ThreadParticipationId
} from "@amends-dev/core/thread"
import { Member, WorkspaceId, MemberId } from "@amends-dev/core/workspace"
import * as ApiErrors from "@amends-dev/http/ApiErrors"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import { perClient, type ApiClient, type WorkspaceApi } from "../api/client.ts"
import { command } from "../api/failures.ts"
import { collectionKey, itemKey, itemKeys, workspaceKey } from "../api/keys.ts"
import type { RequestKey } from "../api/mutation.ts"

export {
  Group,
  GroupMembership,
  Member,
  Notification,
  NotificationInbox,
  Thread,
  ThreadMessage,
  ThreadParticipation,
  ThreadTimeline
}

/** How many threads or timeline items one page reads. */
export const pageSize = 50

const split = (key: string) => {
  const [workspaceId = "", id = ""] = key.split("\u0000")
  return { workspaceId, id }
}
const joined = (workspaceId: string, id: string) => `${workspaceId}\u0000${id}`
const valid = (workspaceId: string) => Option.isSome(Schema.decodeOption(WorkspaceId.WorkspaceId)(workspaceId))

/** The later of two times, either of which may be unknown. */
const later = (left: DateTime.Utc | null, right: DateTime.Utc | undefined) =>
  right !== undefined && (left === null || DateTime.isGreaterThan(right, left)) ? right : left
/** `times` with `id` at `time`, unless it already holds that time or a later one. */
const moveForward = (times: ReadonlyMap<string, DateTime.Utc>, id: string, time: DateTime.Utc) => {
  const known = times.get(id)
  return known === undefined || DateTime.isGreaterThan(time, known) ? new Map(times).set(id, time) : times
}
/** Each group's latest activity, as the change feed delivered it, in one workspace. */
const groupLatestOf = Atom.family((_workspaceId: string) => Atom.make<ReadonlyMap<string, DateTime.Utc>>(new Map()))
/** When the reader read each group, as the change feed told their sessions, in one workspace. */
const groupReadTimesOf = Atom.family((_workspaceId: string) => Atom.make<ReadonlyMap<string, DateTime.Utc>>(new Map()))
/** Note a group's latest activity, which the change feed delivered; it only moves forward. */
export const deliverGroupLatest = (registry: AtomRegistry.AtomRegistry, workspaceId: string, latest: Group.Latest) =>
  registry.update(groupLatestOf(workspaceId), (times) => moveForward(times, latest.groupId, latest.occurredAt))
/** Note when the reader read a group; read times only move forward. */
export const recordGroupRead = (
  registry: AtomRegistry.AtomRegistry,
  workspaceId: string,
  groupId: string,
  readAt: DateTime.Utc
) => registry.update(groupReadTimesOf(workspaceId), (times) => moveForward(times, groupId, readAt))
/**
 * A group as the reader's groups list shows it with its latest activity and read time, given what
 * the list showed. Both only move forward. New activity is as the server decides it: after the
 * group was read, or, never read, after the reader joined, which activity delivered later than
 * what was shown is.
 */
export const groupWith = (
  item: Group.ListItem,
  latest: DateTime.Utc | undefined,
  readAt: DateTime.Utc | undefined
): Group.ListItem => {
  const latestActivityAt = later(item.latestActivityAt, latest)
  const read = later(item.readAt, readAt)
  if (latestActivityAt === item.latestActivityAt && read === item.readAt) return item
  const newActivity =
    latestActivityAt === null
      ? false
      : read !== null
        ? DateTime.isGreaterThan(latestActivityAt, read)
        : item.newActivity || latestActivityAt !== item.latestActivityAt
  return Object.assign({}, item, { latestActivityAt, readAt: read, newActivity })
}
/** The reader's groups with the latest activity the change feed delivered and the read times it told. */
export const withDeliveredGroupActivity = (
  items: ReadonlyArray<Group.ListItem>,
  latest: ReadonlyMap<string, DateTime.Utc>,
  readTimes: ReadonlyMap<string, DateTime.Utc>
): ReadonlyArray<Group.ListItem> =>
  latest.size === 0 && readTimes.size === 0
    ? items
    : items.map((item) => groupWith(item, latest.get(item.group.id), readTimes.get(item.group.id)))

/** Every group the reader belongs to, read page by page, in group-ID order. */
const groupsOf = perClient((client: ApiClient, workspaceId: string) => {
  const read = client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client
        const groups: Array<Group.ListItem> = []
        let after: GroupId.GroupId | undefined
        while (true) {
          const page = yield* api.groups.list({
            query: after === undefined ? { limit: 100 } : { limit: 100, after }
          })
          groups.push(...page)
          const last = page.at(-1)
          if (page.length < 100 || last === undefined) return groups
          after = last.group.id
        }
      })
    )
    .pipe(Atom.withReactivity([workspaceKey(workspaceId, "groups")]))
  const latest = groupLatestOf(workspaceId)
  const readTimes = groupReadTimesOf(workspaceId)
  // Refreshing the groups reads them again; what the change feed delivered and told stays in place.
  return Atom.readable(
    (get) => AsyncResult.map(get(read), (items) => withDeliveredGroupActivity(items, get(latest), get(readTimes))),
    (refresh) => refresh(read)
  )
})
export const groupsRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId) ? groupsOf(client, workspaceId) : undefined

/** Every public group the reader may join, read page by page, in group-ID order. */
const publicGroupsOf = perClient((client: ApiClient, workspaceId: string) =>
  client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client
        const groups: Array<Group.PublicItem> = []
        let after: GroupId.GroupId | undefined
        while (true) {
          const page = yield* api.groups.listPublic({
            query: after === undefined ? { limit: 100 } : { limit: 100, after }
          })
          groups.push(...page)
          const last = page.at(-1)
          if (page.length < 100 || last === undefined) return groups
          after = last.group.id
        }
      })
    )
    .pipe(Atom.withReactivity([workspaceKey(workspaceId, "public-groups")]))
)
export const publicGroupsRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId) ? publicGroupsOf(client, workspaceId) : undefined

/** A group's current admissions, read page by page: whom its messages can mention. */
const rosterOf = perClient((client: ApiClient, key: string) => {
  const { workspaceId, id } = split(key)
  return client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client
        const params = { groupId: GroupId.GroupId.make(id) }
        const admissions: Array<GroupMembership.GroupMembership> = []
        let after: GroupMembership.GroupMembershipId | undefined
        while (true) {
          const page = yield* api.groups.members({
            params,
            query: after === undefined ? { limit: 100 } : { limit: 100, after }
          })
          admissions.push(...page)
          const last = page.at(-1)
          if (page.length < 100 || last === undefined) return admissions
          after = last.id
        }
      })
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "rosters", id)))
})
export const rosterRead = (client: ApiClient, workspaceId: string, groupId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(GroupId.GroupId)(groupId))
    ? rosterOf(client, joined(workspaceId, groupId))
    : undefined

/** One thread's record: its title, group, and who started it. */
const threadOf = perClient((client: ApiClient, key: string) => {
  const { workspaceId, id } = split(key)
  return client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client
        return yield* api.threads.get({ params: { threadId: ThreadId.ThreadId.make(id) } })
      })
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "threads", id)))
})
export const threadRead = (client: ApiClient, workspaceId: string, threadId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(ThreadId.ThreadId)(threadId))
    ? threadOf(client, joined(workspaceId, threadId))
    : undefined

/** A thread's current participants, read page by page: whether the reader follows it. */
const participantsOf = perClient((client: ApiClient, key: string) => {
  const { workspaceId, id } = split(key)
  return client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client
        const params = { threadId: ThreadId.ThreadId.make(id) }
        const participants: Array<ThreadParticipation.Summary> = []
        let after: ThreadParticipationId.ThreadParticipationId | undefined
        while (true) {
          const page = yield* api.threads.participants({
            params,
            query: after === undefined ? { limit: 100 } : { limit: 100, after }
          })
          participants.push(...page)
          const last = page.at(-1)
          if (page.length < 100 || last === undefined) return participants
          after = last.id
        }
      })
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "participants", id)))
})
export const participantsRead = (client: ApiClient, workspaceId: string, threadId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(ThreadId.ThreadId)(threadId))
    ? participantsOf(client, joined(workspaceId, threadId))
    : undefined

/** What the reader may do across the workspace, as permission names. */
export const permissionsRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId)
    ? client.query("assignments", "permissions", {
        reactivityKeys: [workspaceKey(workspaceId, "permissions")]
      })
    : undefined

/** The workspace's members, to name authors. */
export const membersRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId)
    ? client.query("members", "list", {
        reactivityKeys: [workspaceKey(workspaceId, "members")]
      })
    : undefined

/**
 * A view that pages back from the newest end. `items` are in the order the view shows them;
 * `complete` means nothing older remains. `earlier` counts the reader's requests for older items,
 * so a read can tell a request for more from a refresh.
 */
export interface Paged<A> {
  readonly items: ReadonlyArray<A>
  readonly complete: boolean
  readonly earlier: number
}
export interface PagedRead<A, E> {
  readonly atom: Atom.Atom<AsyncResult.AsyncResult<Paged<A>, E>>
  /** Written with the next request count to read one page further back. */
  readonly earlier: Atom.Writable<number>
}
const previousOf = <A>(get: Atom.AtomContext): Option.Option<Paged<A>> =>
  Option.flatMap(get.self<AsyncResult.AsyncResult<Paged<A>, unknown>>(), (result) => AsyncResult.value(result))

/** Newest start first, then ID in descending binary order: the stream's page order. */
const newerThan = (left: Thread.Thread, right: Thread.Thread) =>
  DateTime.toEpochMillis(left.createdAt) - DateTime.toEpochMillis(right.createdAt) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
/** The previews the change feed delivered for one group's threads, by thread, each as it is now. */
const deliveredPreviewsOf = Atom.family((_key: string) => Atom.make<ReadonlyMap<string, Thread.Preview>>(new Map()))
/** How far the reader read each thread, as the change feed told their sessions, in one workspace. */
const readPositionsOf = Atom.family((_workspaceId: string) => Atom.make<ReadonlyMap<string, number>>(new Map()))
/** Put a preview the change feed delivered in its group's delivered previews, returning its group's key. */
export const deliverPreview = (registry: AtomRegistry.AtomRegistry, workspaceId: string, preview: Thread.Preview) => {
  const key = joined(workspaceId, preview.thread.groupId)
  registry.update(deliveredPreviewsOf(key), (previews) => new Map(previews).set(preview.thread.id, preview))
  return key
}
/** Forget the delivered previews of the groups with these keys, as `deliverPreview` returned them. */
export const forgetDeliveredPreviews = (registry: AtomRegistry.AtomRegistry, keys: Iterable<string>) => {
  for (const key of keys) registry.set(deliveredPreviewsOf(key), new Map())
}
/** Note how far the reader read a thread; positions only move forward. */
export const recordReadPosition = (
  registry: AtomRegistry.AtomRegistry,
  workspaceId: string,
  threadId: string,
  readThrough: number
) =>
  registry.update(readPositionsOf(workspaceId), (positions) =>
    readThrough > (positions.get(threadId) ?? 0) ? new Map(positions).set(threadId, readThrough) : positions
  )
/**
 * A thread as the reader's stream shows it with its latest preview and position, given what the
 * stream showed before. Its position only moves forward. Unread is as the server decides it: past
 * the position read, or, never read, with new activity since the reader joined, which a preview
 * delivered later than what was shown has.
 */
export const openingWith = (
  preview: Thread.Preview,
  before: Thread.Opening | undefined,
  position: number | undefined
): Thread.Opening => {
  const read = before?.readThrough ?? null
  const readThrough = position === undefined ? read : Math.max(position, read ?? 0)
  const unread =
    readThrough !== null
      ? preview.latest.sequence > readThrough
      : before === undefined || before.unread || preview.latest.sequence > before.latest.sequence
  return Thread.opening(preview, { readThrough, unread })
}
/**
 * A stream as it shows with the previews the change feed delivered and the positions it told:
 * each thread read, with its delivered preview and the reader's position, then the delivered
 * threads that started after the newest one read, oldest first.
 */
export const withDeliveredPreviews = (
  paged: Paged<Thread.Opening>,
  delivered: ReadonlyMap<string, Thread.Preview>,
  positions: ReadonlyMap<string, number>
): Paged<Thread.Opening> => {
  if (delivered.size === 0 && positions.size === 0) return paged
  const shown = new Set(paged.items.map((item) => item.thread.id))
  const newest = paged.items.at(-1)?.thread
  const started = [...delivered.values()]
    .filter(
      (preview) => !shown.has(preview.thread.id) && (newest === undefined || newerThan(preview.thread, newest) > 0)
    )
    .toSorted((left, right) => newerThan(left.thread, right.thread))
  const items = [
    ...paged.items.map((item) =>
      openingWith(delivered.get(item.thread.id) ?? item, item, positions.get(item.thread.id))
    ),
    ...started.map((preview) => openingWith(preview, undefined, positions.get(preview.thread.id)))
  ]
  return { ...paged, items }
}

const streamOf = perClient((client: ApiClient, key: string): PagedRead<Thread.Opening, unknown> => {
  const { workspaceId, id } = split(key)
  const earlier = Atom.make(0)
  const read = client.runtime
    .atom(
      Effect.fnUntraced(function* (get) {
        const api = yield* client
        const requested = get(earlier)
        const previous = previousOf<Thread.Opening>(get)
        // The oldest thread shown stays shown: a refresh reads down to it, and a request for
        // more reads one page past it. New threads arrive at the newest end.
        const reach = Option.flatMap(previous, (view) => Option.fromUndefinedOr(view.items[0]))
        const more = Option.isNone(previous) || requested > previous.value.earlier
        const params = { groupId: GroupId.GroupId.make(id) }
        const newestFirst: Array<Thread.Opening> = []
        let before: Thread.OpeningCursor | undefined
        let complete = false
        while (true) {
          const page = yield* api.threads.openings({
            params,
            query: before === undefined ? { limit: pageSize } : { limit: pageSize, before }
          })
          newestFirst.push(...page)
          const last = page.at(-1)
          if (page.length < pageSize || last === undefined) {
            complete = true
            break
          }
          before = { createdAt: last.thread.createdAt, threadId: last.thread.id }
          if (Option.isNone(reach)) break
          // A refresh stops once it reaches the oldest thread shown; a request for more once a
          // page of older threads follows it.
          const done = more
            ? newestFirst.filter((item) => newerThan(item.thread, reach.value.thread) < 0).length >= pageSize
            : newerThan(last.thread, reach.value.thread) <= 0
          if (done) break
        }
        return { items: newestFirst.toReversed(), complete, earlier: requested }
      })
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "streams", id)))
  const delivered = deliveredPreviewsOf(key)
  const positions = readPositionsOf(workspaceId)
  // Refreshing the stream reads it again; what the change feed delivered and told stays in place.
  const atom = Atom.readable(
    (get) => AsyncResult.map(get(read), (paged) => withDeliveredPreviews(paged, get(delivered), get(positions))),
    (refresh) => refresh(read)
  )
  return { atom, earlier }
})
/** A group's stream: its readable threads by when they started, oldest shown first, with what the change feed delivered. */
export const streamRead = (client: ApiClient, workspaceId: string, groupId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(GroupId.GroupId)(groupId))
    ? streamOf(client, joined(workspaceId, groupId))
    : undefined

/**
 * The timeline items the change feed delivered for one thread, by position, each as it is now. They
 * live while the thread's timeline is shown, and a reset forgets them, since what was missed may
 * have changed them.
 */
const deliveredItemsOf = Atom.family((_key: string) => Atom.make<ReadonlyMap<number, ThreadTimeline.Item>>(new Map()))
/** Put a timeline item the change feed delivered in its thread's delivered items, returning its thread's key. */
export const deliverTimelineItem = (
  registry: AtomRegistry.AtomRegistry,
  workspaceId: string,
  item: ThreadTimeline.Item
) => {
  const key = joined(workspaceId, item.activity.threadId)
  registry.update(deliveredItemsOf(key), (items) => new Map(items).set(item.activity.sequence, item))
  return key
}
/** Forget the delivered items of the threads with these keys, as `deliverTimelineItem` returned them. */
export const forgetDeliveredItems = (registry: AtomRegistry.AtomRegistry, keys: Iterable<string>) => {
  for (const key of keys) registry.set(deliveredItemsOf(key), new Map())
}
/**
 * A timeline as it shows with the items the change feed delivered: each item read in its delivered
 * form, then the delivered items that follow the last one read, while they follow on.
 */
export const withDeliveredItems = (
  paged: Paged<ThreadTimeline.Item>,
  delivered: ReadonlyMap<number, ThreadTimeline.Item>
): Paged<ThreadTimeline.Item> => {
  if (delivered.size === 0) return paged
  const items = paged.items.map((item) => delivered.get(item.activity.sequence) ?? item)
  for (let next = (items.at(-1)?.activity.sequence ?? 0) + 1; ; next++) {
    const item = delivered.get(next)
    if (item === undefined) break
    items.push(item)
  }
  return { ...paged, items }
}

const timelineOf = perClient((client: ApiClient, key: string): PagedRead<ThreadTimeline.Item, unknown> => {
  const { workspaceId, id } = split(key)
  const earlier = Atom.make(0)
  const read = client.runtime
    .atom(
      Effect.fnUntraced(function* (get) {
        const api = yield* client
        const requested = get(earlier)
        const previous = previousOf<ThreadTimeline.Item>(get)
        const params = { threadId: ThreadId.ThreadId.make(id) }
        const read = (query: {
          readonly afterSequence?: number
          readonly beforeSequence?: number
          readonly from?: "newest"
        }) => api.threads.timeline({ params, query: { limit: pageSize, ...query } })
        // The oldest item shown stays shown: a refresh reads every item down to it, since the change
        // feed may have missed changes to them, and a request for more reads one page past it.
        const oldest = Option.flatMap(previous, (view) => Option.fromUndefinedOr(view.items[0]?.activity.sequence))
        const more = Option.isNone(previous) || requested > previous.value.earlier
        /** The pages read, oldest first. */
        const pages: Array<ReadonlyArray<ThreadTimeline.Item>> = []
        let complete = false
        let before: number | undefined
        while (true) {
          const page = yield* read(
            before === undefined ? { from: "newest" } : { beforeSequence: before, from: "newest" }
          )
          pages.unshift(page)
          const first = page[0]
          if (page.length < pageSize || first === undefined) {
            complete = true
            break
          }
          before = first.activity.sequence
          if (Option.isNone(oldest)) break
          const done = more
            ? pages.flat().filter((item) => item.activity.sequence < oldest.value).length >= pageSize
            : first.activity.sequence <= oldest.value
          if (done) break
        }
        let items = pages.flat()
        // A refresh shows what was shown, however far back its last page reached.
        if (Option.isSome(oldest) && !more) {
          const shown = items.filter((item) => item.activity.sequence >= oldest.value)
          if (shown.length < items.length) {
            items = shown
            complete = false
          }
        }
        return { items, complete, earlier: requested }
      })
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "timelines", id)))
  const delivered = deliveredItemsOf(key)
  // Refreshing the timeline reads it again; what the change feed delivered stays in place.
  const atom = Atom.readable(
    (get) => AsyncResult.map(get(read), (paged) => withDeliveredItems(paged, get(delivered))),
    (refresh) => refresh(read)
  )
  return { atom, earlier }
})
/** A thread's timeline from its newest activity, oldest shown first, with what the change feed delivered. */
export const timelineRead = (client: ApiClient, workspaceId: string, threadId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(ThreadId.ThreadId)(threadId))
    ? timelineOf(client, joined(workspaceId, threadId))
    : undefined

/** How many notifications one inbox page reads. */
export const inboxPageSize = 25
/** Newest first, then ID in descending binary order: the inbox's page order. */
const recordedAfter = (left: Notification.Notification, right: Notification.Notification) =>
  DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
/** Everything in the reader's inbox, or only what is still pending for them. */
export type InboxFilter = "all" | "pending"
/**
 * The notifications the change feed delivered to the reader in one workspace, each with the source
 * the same commit delivered, in the order they arrived, and how many it has delivered in all. The
 * count only grows while the client runs, so an inbox page can say which deliveries it covers.
 */
interface DeliveredNotifications {
  readonly count: number
  readonly items: ReadonlyArray<{ readonly item: NotificationInbox.Item; readonly delivery: number }>
}
const deliveredNotificationsOf = Atom.family((_workspaceId: string) =>
  Atom.make<DeliveredNotifications>({ count: 0, items: [] }).pipe(Atom.keepAlive)
)
/** Put a notification the change feed delivered in the reader's inbox, with its source if delivered too. */
export const deliverNotification = (
  registry: AtomRegistry.AtomRegistry,
  workspaceId: string,
  item: NotificationInbox.Item
) =>
  registry.update(deliveredNotificationsOf(workspaceId), ({ count, items }) => ({
    count: count + 1,
    items: [...items, { item, delivery: count + 1 }]
  }))
/**
 * What the change feed told the reader's sessions they saw in one workspace: notifications seen by
 * ID, and each thread's reads in the order told, which settle its notifications up to each.
 */
interface SeenMarks {
  readonly notifications: ReadonlyMap<string, DateTime.Utc>
  readonly threads: ReadonlyMap<string, ReadonlyArray<{ readonly readThrough: number; readonly readAt: DateTime.Utc }>>
}
const seenMarksOf = Atom.family((_workspaceId: string) =>
  Atom.make<SeenMarks>({ notifications: new Map(), threads: new Map() })
)
/** Note that the reader saw these notifications at `seenAt`. */
export const recordNotificationsSeen = (
  registry: AtomRegistry.AtomRegistry,
  workspaceId: string,
  notificationIds: ReadonlyArray<string>,
  seenAt: DateTime.Utc
) =>
  registry.update(seenMarksOf(workspaceId), (seen) => {
    const notifications = new Map(seen.notifications)
    for (const id of notificationIds) if (!notifications.has(id)) notifications.set(id, seenAt)
    return { ...seen, notifications }
  })
/** Note that the reader read a thread through `readThrough` at `readAt`. */
export const recordThreadSeen = (
  registry: AtomRegistry.AtomRegistry,
  workspaceId: string,
  threadId: string,
  readThrough: number,
  readAt: DateTime.Utc
) =>
  registry.update(seenMarksOf(workspaceId), (seen) => ({
    ...seen,
    threads: new Map(seen.threads).set(threadId, [...(seen.threads.get(threadId) ?? []), { readThrough, readAt }])
  }))
/**
 * A notification as the reader's sessions were told they saw it: a person's pending notification is
 * seen once they saw it, or read its thread through it, at the first time that did.
 */
export const seenWith = (notification: Notification.Notification, seen: SeenMarks): Notification.Notification => {
  if (!Notification.State.isAnyOf(["Pending"])(notification.state)) return notification
  if (!Notification.Recipient.isAnyOf(["Human"])(notification.recipient)) return notification
  const thread = notification.thread
  const seenAt =
    seen.notifications.get(notification.id) ??
    (thread === undefined
      ? undefined
      : seen.threads.get(thread.threadId)?.find((read) => read.readThrough >= thread.sequence)?.readAt)
  return seenAt === undefined
    ? notification
    : Object.assign({}, notification, { state: Notification.State.cases.Seen.make({ seenAt }) })
}
/** An inbox page, and how many notifications the change feed had delivered when it was read. */
interface InboxPage extends Paged<NotificationInbox.Item> {
  readonly covered: number
}
/**
 * An inbox as it shows with what the change feed delivered and told: notifications delivered after
 * the page was read and not on it, newest first, then the page, each seen as told and with the
 * timeline item delivered at its source's position, and, for the pending inbox, only those still
 * pending.
 */
export const withDeliveredNotifications = (
  page: InboxPage,
  pendingOnly: boolean,
  delivered: DeliveredNotifications,
  seen: SeenMarks,
  sourceOf: (thread: Notification.ThreadReference) => ThreadTimeline.Item | undefined
): Paged<NotificationInbox.Item> => {
  const shown = new Set(page.items.map((item) => item.notification.id))
  const arrived = delivered.items
    .filter(({ item, delivery }) => delivery > page.covered && !shown.has(item.notification.id))
    .map(({ item }) => item)
    .toSorted((left, right) => recordedAfter(right.notification, left.notification))
  const items = [...arrived, ...page.items].flatMap((item): Array<NotificationInbox.Item> => {
    const notification = seenWith(item.notification, seen)
    if (pendingOnly && !Notification.State.isAnyOf(["Pending"])(notification.state)) return []
    const source = (notification.thread && sourceOf(notification.thread)) ?? item.source
    return [source === undefined ? { notification } : { notification, source }]
  })
  return { items, complete: page.complete, earlier: page.earlier }
}
const inboxOf = perClient((client: ApiClient, key: string): PagedRead<NotificationInbox.Item, unknown> => {
  const { workspaceId, id: filter } = split(key)
  const earlier = Atom.make(0)
  const delivered = deliveredNotificationsOf(workspaceId)
  const read = client.runtime
    .atom(
      Effect.fnUntraced(function* (get) {
        const api = yield* client
        const requested = get(earlier)
        // Whatever the change feed delivers from now on may be missing from what this reads.
        const covered = get.once(delivered).count
        const previous = previousOf<NotificationInbox.Item>(get)
        // The oldest notification shown stays shown: a refresh reads down to it, and a request
        // for more reads one page past it. New notifications arrive at the top.
        const reach = Option.flatMap(previous, (view) => Option.fromUndefinedOr(view.items.at(-1)))
        const more = Option.isNone(previous) || requested > previous.value.earlier
        const newestFirst: Array<NotificationInbox.Item> = []
        let before: Pick<Notification.Notification, "recordedAt" | "id"> | undefined
        let complete = false
        while (true) {
          const page = yield* api.notifications.inbox({
            query: {
              limit: inboxPageSize,
              ...(filter === "pending" ? { pendingOnly: true } : {}),
              ...(before === undefined ? {} : { before })
            }
          })
          newestFirst.push(...page)
          const last = page.at(-1)
          if (page.length < inboxPageSize || last === undefined) {
            complete = true
            break
          }
          before = { recordedAt: last.notification.recordedAt, id: last.notification.id }
          if (Option.isNone(reach)) break
          const oldest = reach.value.notification
          const done = more
            ? newestFirst.filter((item) => recordedAfter(item.notification, oldest) < 0).length >= inboxPageSize
            : recordedAfter(last.notification, oldest) <= 0
          if (done) break
        }
        const result: InboxPage = { items: newestFirst, complete, earlier: requested, covered }
        return result
      })
    )
    .pipe(Atom.withReactivity([workspaceKey(workspaceId, "inbox")]))
  const seen = seenMarksOf(workspaceId)
  // Refreshing the inbox reads it again; what the change feed delivered and told stays in place.
  const atom = Atom.readable(
    (get) =>
      AsyncResult.map(get(read), (page) =>
        withDeliveredNotifications(page, filter === "pending", get(delivered), get(seen), (thread) =>
          get(deliveredItemsOf(joined(workspaceId, thread.threadId))).get(thread.sequence)
        )
      ),
    (refresh) => refresh(read)
  )
  return { atom, earlier }
})
/** The reader's inbox, newest first, with each notification's source where they can read it. */
export const inboxRead = (client: ApiClient, workspaceId: string, filter: InboxFilter) =>
  valid(workspaceId) ? inboxOf(client, joined(workspaceId, filter)) : undefined

/** How many notifications are still pending for the reader, in all and from each group's threads. */
export const pendingCountsRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId)
    ? client.query("notifications", "count", {
        reactivityKeys: [workspaceKey(workspaceId, "pending")]
      })
    : undefined

/**
 * Record that the reader saw everything still pending for them up to the newest notification
 * they are shown; what arrived after it stays. Their sessions, this one included, show it seen
 * and refresh the pending counts when its signal arrives through the change feed.
 */
export const markSeenThrough = (api: WorkspaceApi, through: Pick<Notification.Notification, "recordedAt" | "id">) =>
  Effect.gen(function* () {
    const { marked } = yield* api.notifications.markSeenThrough({
      payload: { through: { recordedAt: through.recordedAt, id: through.id } }
    })
    return marked
  })

/**
 * Record that the reader saw a notification; seeing it again keeps the first time. Their
 * sessions, this one included, show it seen and refresh the pending counts when its signal
 * arrives through the change feed.
 */
export const markSeen = (api: WorkspaceApi, notificationId: string) =>
  Effect.gen(function* () {
    yield* api.notifications.markSeen({
      params: { notificationId: yield* command(Notification.NotificationId)(notificationId) }
    })
  })

/**
 * A team group to create: its name, everyone admitted to it, the creator included, and whether
 * anyone in the workspace may find and join it.
 */
export interface NewGroup {
  readonly name: string
  readonly memberIds: ReadonlyArray<string>
  readonly visibility: Group.Visibility
  readonly key: RequestKey
}
/** Whether a name can name a group: it has something besides surrounding whitespace. */
export const isGroupName = (name: string) => Schema.is(Group.NewName)(name.trim())
/**
 * Create a team group, then invalidate the reader's groups and the public ones, as the change feed
 * would when the commit arrives. A retry with the same key returns the first attempt's group.
 */
export const createGroup = (workspace: string) => (api: WorkspaceApi, group: NewGroup) =>
  Effect.gen(function* () {
    const created = yield* api.groups.create({
      headers: { "idempotency-key": group.key },
      payload: yield* command(Group.CreateTeamInput)({
        name: group.name.trim(),
        memberIds: group.memberIds,
        visibility: group.visibility
      })
    })
    yield* Reactivity.invalidate([workspaceKey(workspace, "groups"), workspaceKey(workspace, "public-groups")])
    return created.id as string
  })

/** A team group's new name, and the name the reader last saw. */
export interface GroupRename {
  readonly groupId: string
  readonly name: string
  readonly expectedName: string
}
/**
 * Rename a team group from the name the reader last saw, then invalidate the groups that show
 * it. A rename made meanwhile refuses it as changed, and the groups refresh to show that name.
 */
export const renameGroup = (workspace: string) => (api: WorkspaceApi, rename: GroupRename) =>
  Effect.gen(function* () {
    const renamed = yield* api.groups
      .rename({
        params: { groupId: yield* command(GroupId.GroupId)(rename.groupId) },
        payload: {
          name: yield* command(Group.NewName)(rename.name.trim()),
          expectedName: yield* command(Group.Name)(rename.expectedName)
        }
      })
      .pipe(
        Effect.tapError((error) =>
          Schema.is(ApiErrors.Changed)(error) ? Reactivity.invalidate([workspaceKey(workspace, "groups")]) : Effect.void
        )
      )
    yield* Reactivity.invalidate([workspaceKey(workspace, "groups")])
    return renamed
  })

/**
 * Join a public group as the reader, then invalidate the groups, the public ones, and the inbox,
 * whose sources follow group access. Joining a group already joined returns the same admission.
 */
export const joinGroup = (workspace: string) => (api: WorkspaceApi, groupId: string) =>
  Effect.gen(function* () {
    const admission = yield* api.groups.join({
      params: { groupId: yield* command(GroupId.GroupId)(groupId) }
    })
    yield* Reactivity.invalidate([
      workspaceKey(workspace, "groups"),
      workspaceKey(workspace, "public-groups"),
      workspaceKey(workspace, "inbox")
    ])
    return admission.groupId as string
  })

/** A change to who belongs to a team group: adding members, removing one, or leaving. */
export type MembershipChange =
  | { readonly kind: "add"; readonly groupId: string; readonly memberIds: ReadonlyArray<string> }
  | { readonly kind: "remove"; readonly groupId: string; readonly membershipId: string }
  | { readonly kind: "leave"; readonly groupId: string; readonly membershipId: string }
/**
 * Change a group's members, then invalidate what that changes: its roster and stream, the groups,
 * and the inbox and its counts, whose sources follow group access. Members are added one at a time; one already
 * added, as by someone else meanwhile, counts as added.
 */
export const changeMembership = (workspace: string) => (api: WorkspaceApi, change: MembershipChange) =>
  Effect.gen(function* () {
    const params = { groupId: yield* command(GroupId.GroupId)(change.groupId) }
    const invalidate = Reactivity.invalidate([
      itemKey(workspace, "rosters", change.groupId),
      itemKey(workspace, "streams", change.groupId),
      workspaceKey(workspace, "groups"),
      workspaceKey(workspace, "public-groups"),
      workspaceKey(workspace, "inbox"),
      workspaceKey(workspace, "pending")
    ])
    switch (change.kind) {
      case "add":
        // What was added before a failure stays added, so the reads refresh either way.
        yield* Effect.forEach(change.memberIds, (memberId) =>
          Effect.flatMap(command(MemberId.MemberId)(memberId), (id) =>
            api.groups.addMember({ params, payload: { memberId: id } })
          ).pipe(
            Effect.asVoid,
            Effect.catchReason("CoreError.Conflict", "AlreadyMember", () => Effect.void)
          )
        ).pipe(Effect.ensuring(invalidate))
        return
      case "remove":
      case "leave": {
        const admission = {
          ...params,
          membershipId: yield* command(GroupMembership.GroupMembershipId)(change.membershipId)
        }
        if (change.kind === "remove") yield* api.groups.removeMember({ params: admission })
        else yield* api.groups.leave({ params: admission })
        yield* invalidate
        return
      }
    }
  })

/** Whether text can be sent as a message: it has something besides whitespace. */
export const isMessageText = Schema.is(ThreadMessage.Text)
interface Message {
  readonly text: string
  /** The members the message addresses. */
  readonly mentions: ReadonlyArray<string>
  readonly key: RequestKey
}
/**
 * A message to post: the first of a new thread in a group, the first to some people in their
 * direct group, which it creates when they have none, or a reply in a thread.
 */
export type Post =
  | (Message & { readonly kind: "start"; readonly groupId: string })
  | (Message & { readonly kind: "direct"; readonly memberIds: ReadonlyArray<string> })
  | (Message & { readonly kind: "reply"; readonly threadId: string })
/** Where a posted message went. */
export interface Posted {
  readonly groupId?: string
  readonly threadId: string
}
/**
 * Post one message, then invalidate the reads it changes, as the change feed would when the
 * commit arrives, so it shows even while the feed is away. A retry with the same key returns the
 * first attempt's result.
 */
export const postMessage = (workspace: string) => (api: WorkspaceApi, post: Post) =>
  Effect.gen(function* () {
    const payload = {
      text: yield* command(ThreadMessage.Text)(post.text),
      mentions: yield* command(ThreadMessage.PublishInput.fields.mentions)(post.mentions)
    }
    const headers = { "idempotency-key": post.key }
    switch (post.kind) {
      case "start": {
        const groupId = yield* command(GroupId.GroupId)(post.groupId)
        const started = yield* api.threads.start({
          params: { groupId },
          headers,
          payload
        })
        yield* Reactivity.invalidate([itemKey(workspace, "streams", groupId), workspaceKey(workspace, "groups")])
        return { groupId, threadId: started.thread.id }
      }
      case "direct": {
        const started = yield* api.threads.startDirect({
          headers,
          payload: {
            ...payload,
            memberIds: yield* command(Thread.StartDirectInput.fields.memberIds)(post.memberIds)
          }
        })
        const groupId = started.thread.groupId
        yield* Reactivity.invalidate([itemKey(workspace, "streams", groupId), workspaceKey(workspace, "groups")])
        return { groupId, threadId: started.thread.id }
      }
      case "reply": {
        const threadId = yield* command(ThreadId.ThreadId)(post.threadId)
        yield* api.threads.publish({ params: { threadId }, headers, payload })
        // A reply changes its group's stream, whichever group that is.
        yield* Reactivity.invalidate([itemKey(workspace, "timelines", threadId), collectionKey(workspace, "streams")])
        return { threadId }
      }
    }
  }).pipe(Effect.map((posted): Posted => posted))

/** What the reader has read: a thread through a timeline position, or a group read now. */
export type ReadMark =
  | { readonly kind: "thread"; readonly threadId: string; readonly through: number }
  | { readonly kind: "group"; readonly groupId: string }
/**
 * Record a read mark; positions only move forward on the server. The reader's sessions, this one
 * included, show the position or read time its signal carries, and refresh the pending counts it
 * changes, when the signal arrives through the change feed.
 */
export const markRead = (api: WorkspaceApi, mark: ReadMark) =>
  Effect.gen(function* () {
    if (mark.kind === "thread")
      yield* api.threads.markRead({
        params: { threadId: yield* command(ThreadId.ThreadId)(mark.threadId) },
        payload: {
          throughSequence: yield* command(Thread.Latest.fields.sequence)(mark.through)
        }
      })
    else
      yield* api.groups.markRead({
        params: { groupId: yield* command(GroupId.GroupId)(mark.groupId) }
      })
  })

/** Following a thread, which makes the reader take part in it, or a team group, or stopping. */
export type Follow =
  | { readonly kind: "follow-thread"; readonly threadId: string }
  | {
      readonly kind: "unfollow-thread"
      readonly threadId: string
      readonly participationId: string
    }
  | { readonly kind: "follow-group"; readonly groupId: string; readonly memberId: string }
  | { readonly kind: "unfollow-group"; readonly groupId: string; readonly memberId: string }
/** Follow a thread or a team group, or stop following it. */
export const changeFollow = (api: WorkspaceApi, follow: Follow) =>
  Effect.gen(function* () {
    switch (follow.kind) {
      case "follow-thread":
      case "unfollow-thread": {
        const threadId = yield* command(ThreadId.ThreadId)(follow.threadId)
        if (follow.kind === "follow-thread") yield* api.threads.follow({ params: { threadId } })
        else
          yield* api.threads.unfollow({
            params: { threadId },
            payload: {
              participationId: yield* command(ThreadParticipationId.ThreadParticipationId)(follow.participationId)
            }
          })
        return
      }
      case "follow-group":
      case "unfollow-group": {
        const params = { groupId: yield* command(GroupId.GroupId)(follow.groupId) }
        const payload = { memberId: yield* command(MemberId.MemberId)(follow.memberId) }
        if (follow.kind === "follow-group") yield* api.groups.follow({ params, payload })
        else yield* api.groups.unfollow({ params, payload })
        return
      }
    }
  })

/** Tell a thread's readers that the reader is typing there, for the next few seconds. */
export const sendTyping = (api: WorkspaceApi, threadId: string) =>
  Effect.gen(function* () {
    yield* api.threads.typing({ params: { threadId: yield* command(ThreadId.ThreadId)(threadId) } })
  })
