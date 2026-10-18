/**
 * The storage contract for notifications, which every storage adapter implements and
 * `NotificationProjection` writes. `NotificationService` reads inboxes through it and marks what a
 * person saw; `GroupService` counts what waits in each group; and `TurnExecution` and
 * `DeliveryExecution` list what an agent or a contact was told in a thread. Reading a thread
 * settles its notifications through `ReadStateStore`. The store checks what it is given and
 * authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */

import type * as Store from "@amends-dev/log/Store"
import * as StoreError from "@amends-dev/log/StoreError"
import * as StoreInput from "@amends-dev/log/StoreInput"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as MemoryBinding from "../journal/MemoryBinding.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as ReadState from "../read-state/ReadState.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Notification from "./Notification.ts"

/**
 * Where a page of a recipient's notifications ends, by recorded time and ID: an exclusive keyset
 * boundary for reading the next page, not a journal position or a live delivery cursor.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Cursor = Schema.Struct({
  recordedAt: Notification.Notification.fields.recordedAt,
  id: Notification.NotificationId
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Cursor extends Schema.Schema.Type<typeof Cursor> {}

/**
 * Reading oldest first: up to `limit` notifications after an exclusive boundary, or from the first
 * without one.
 *
 * @category options
 * @since 0.1.0
 */
export const ReadOptions = Schema.Struct({
  after: Schema.optionalKey(Cursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category options
 * @since 0.1.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * Reading newest first: the page before an exclusive boundary, or the newest page without one.
 *
 * @category options
 * @since 0.1.0
 */
export const LatestOptions = Schema.Struct({
  before: Schema.optionalKey(Cursor),
  limit: ReadOptions.fields.limit
})

/**
 * @category options
 * @since 0.1.0
 */
export interface LatestOptions extends Schema.Schema.Type<typeof LatestOptions> {}

/**
 * A recipient's pending notifications from one group's thread activity, as `countPendingByGroup`
 * counts them.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PendingCount = Schema.Struct({
  groupId: Notification.ThreadReference.fields.groupId,
  count: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface PendingCount extends Schema.Schema.Type<typeof PendingCount> {}

/**
 * A range of one thread's timeline positions, after one and through another, as `listByThread`
 * reads them.
 *
 * @category options
 * @since 0.1.0
 */
export const ThreadRange = Schema.Struct({
  afterSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  throughSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
})

/**
 * @category options
 * @since 0.1.0
 */
export interface ThreadRange extends Schema.Schema.Type<typeof ThreadRange> {}

/**
 * The notification store, bound to one workspace by the host. Reads use the current transaction
 * when present, otherwise committed state, and return isolated records. These reads do not
 * authorize callers; operations must do so.
 *
 * The journal settles notifications as Pending, Discarded, or Informational, an agent's as
 * Accepted when a turn takes them, a contact's when a delivery does, and a person's as Seen when
 * they see it or read its thread through it.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class NotificationStore extends Context.Service<
  NotificationStore,
  {
    /** Find a notification in this workspace; None if absent. */
    readonly get: (
      id: Notification.NotificationId
    ) => Effect.Effect<Option.Option<Notification.Notification>, StoreError.StoreError>

    /**
     * The recipient's pending notifications, matching their kind and ID: at most limit records
     * after the exclusive cursor, ordered by recordedAt ascending, then ID in binary lexical order.
     * Each call reads its current view; pages do not constitute a fixed snapshot.
     */
    readonly listPendingByRecipient: (
      recipient: Notification.Recipient,
      options: ReadOptions
    ) => Effect.Effect<ReadonlyArray<Notification.Notification>, StoreError.StoreError>

    /**
     * The recipient's newest notifications first: at most limit records before the exclusive
     * cursor, ordered by recordedAt descending, then ID in descending binary lexical order. Each
     * call reads its current view.
     */
    readonly listLatestByRecipient: (
      recipient: Notification.Recipient,
      options: LatestOptions
    ) => Effect.Effect<ReadonlyArray<Notification.Notification>, StoreError.StoreError>

    /** Same ordering and pagination, restricted to Pending records. */
    readonly listLatestPendingByRecipient: (
      recipient: Notification.Recipient,
      options: LatestOptions
    ) => Effect.Effect<ReadonlyArray<Notification.Notification>, StoreError.StoreError>

    /**
     * Every notification of the recipient from one thread's activity in a range of timeline
     * positions, whatever its state, ordered by position, then ID in binary lexical order: what the
     * recipient was told there.
     */
    readonly listByThread: (
      recipient: Notification.Recipient,
      threadId: ThreadId.ThreadId,
      range: ThreadRange
    ) => Effect.Effect<ReadonlyArray<Notification.Notification>, StoreError.StoreError>
    /**
     * The recipient's pending notifications from one thread's activity at or before a timeline
     * position, ordered by that position, then ID in binary lexical order.
     */
    readonly listPendingByThread: (
      recipient: Notification.Recipient,
      threadId: ThreadId.ThreadId,
      throughSequence: number
    ) => Effect.Effect<ReadonlyArray<Notification.Notification>, StoreError.StoreError>

    /** How many pending notifications the recipient has, from anywhere. */
    readonly countPendingByRecipient: (
      recipient: Notification.Recipient
    ) => Effect.Effect<number, StoreError.StoreError>

    /**
     * How many pending notifications the recipient has from thread activity in each group, for
     * groups with any, in binary group-ID order.
     */
    readonly countPendingByGroup: (
      recipient: Notification.Recipient
    ) => Effect.Effect<ReadonlyArray<PendingCount>, StoreError.StoreError>

    /**
     * Projection write, enlisted with the source activity and checkpoint. Reused IDs and duplicate
     * (source log, source entry, recipient kind, recipient ID) associations are rejected
     * atomically. Never upsert or retry internally; reject missing, foreign, or expired transaction
     * handles.
     */
    readonly insert: (
      record: Notification.Notification
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Insert several records in one projection write, with insert's rejections, including
     * duplicates within the request. Any rejection fails the call and writes none of them. An empty
     * request writes nothing.
     */
    readonly insertMany: (
      records: ReadonlyArray<Notification.Notification>
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Projection write that records their human recipients saw these notifications. Each must be a
     * human's pending notification in this workspace; otherwise the call is rejected and writes
     * nothing.
     */
    readonly markSeen: (
      ids: ReadonlyArray<Notification.NotificationId>,
      seenAt: DateTime.Utc
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Projection write that records a person saw what was pending for them from a thread's
     * activity up to the position they read it through. Nothing pending there writes nothing.
     */
    readonly markSeenInThread: (
      position: ReadState.ThreadPosition,
      seenAt: DateTime.Utc
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Record that `by` accepted these pending notifications, in its commit: a turn, which takes
     * pending notifications of one agent in this workspace, or a delivery, which takes pending
     * notifications of contacts. Anything else is rejected and writes nothing. An empty request
     * writes nothing.
     */
    readonly accept: (
      ids: ReadonlyArray<Notification.NotificationId>,
      by: Notification.AcceptedBy,
      acceptedAt: DateTime.Utc
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Settle pending agent input for this ended participation, preserving source and recipient
     * history.
     */
    readonly discardPendingForParticipation: (
      id: ThreadParticipationId.ThreadParticipationId
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Settle what a member had pending from a group's threads once they no longer belong to it,
     * keeping it as history: a person's unseen notifications as `access-lost`, and an agent's
     * pending input as `participation-ended`, since every participation it held there ended with
     * the departure. A person's seen ones and everyone else's stay.
     */
    readonly discardPendingForGroup: (
      memberId: MemberId.MemberId,
      groupId: GroupId.GroupId
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/notification/NotificationStore") {}

/** Seen and Accepted are recorded with markSeen and accept, never inserted. */
const unsettled = (record: Notification.Notification) => !Notification.State.isAnyOf(["Seen", "Accepted"])(record.state)
const settled = (operation: string) => () =>
  StoreError.rejected("NotificationStore", operation, "Seen and Accepted are recorded with markSeen and accept")

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it. A record inserted as Seen or Accepted is rejected, since
 * only `markSeen` and `accept` record those.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.WorkspaceId,
  driver: NotificationStore["Service"]
): NotificationStore["Service"] => {
  const read = StoreInput.read("NotificationStore")
  const write = StoreInput.write("NotificationStore", WorkspaceId.rejectForeign(workspaceId))
  return {
    get: (id) => Effect.flatMap(read("get", Notification.NotificationId, id), driver.get),
    listPendingByRecipient: Effect.fn("NotificationStore.listPendingByRecipient")(function* (recipient, options) {
      return yield* driver.listPendingByRecipient(
        yield* read("listPendingByRecipient", Notification.Recipient, recipient),
        yield* read("listPendingByRecipient", ReadOptions, options)
      )
    }),
    listLatestByRecipient: Effect.fn("NotificationStore.listLatestByRecipient")(function* (recipient, options) {
      return yield* driver.listLatestByRecipient(
        yield* read("listLatestByRecipient", Notification.Recipient, recipient),
        yield* read("listLatestByRecipient", LatestOptions, options)
      )
    }),
    listLatestPendingByRecipient: Effect.fn("NotificationStore.listLatestPendingByRecipient")(
      function* (recipient, options) {
        return yield* driver.listLatestPendingByRecipient(
          yield* read("listLatestPendingByRecipient", Notification.Recipient, recipient),
          yield* read("listLatestPendingByRecipient", LatestOptions, options)
        )
      }
    ),
    listByThread: Effect.fn("NotificationStore.listByThread")(function* (recipient, threadId, range) {
      return yield* driver.listByThread(
        yield* read("listByThread", Notification.Recipient, recipient),
        yield* read("listByThread", ThreadId.ThreadId, threadId),
        yield* read("listByThread", ThreadRange, range)
      )
    }),
    listPendingByThread: Effect.fn("NotificationStore.listPendingByThread")(
      function* (recipient, threadId, throughSequence) {
        return yield* driver.listPendingByThread(
          yield* read("listPendingByThread", Notification.Recipient, recipient),
          yield* read("listPendingByThread", ThreadId.ThreadId, threadId),
          yield* read("listPendingByThread", Schema.Int, throughSequence)
        )
      }
    ),
    countPendingByRecipient: (recipient) =>
      Effect.flatMap(
        read("countPendingByRecipient", Notification.Recipient, recipient),
        driver.countPendingByRecipient
      ),
    countPendingByGroup: (recipient) =>
      Effect.flatMap(read("countPendingByGroup", Notification.Recipient, recipient), driver.countPendingByGroup),
    insert: (record) =>
      write("insert", Notification.Notification, record).pipe(
        Effect.filterOrFail(unsettled, settled("insert")),
        Effect.flatMap(driver.insert)
      ),
    insertMany: (records) =>
      write("insertMany", Schema.Array(Notification.Notification), records).pipe(
        Effect.filterOrFail((records) => records.every(unsettled), settled("insertMany")),
        Effect.flatMap(driver.insertMany)
      ),
    markSeen: Effect.fn("NotificationStore.markSeen")(function* (ids, seenAt) {
      return yield* driver.markSeen(
        yield* write("markSeen", Schema.Array(Notification.NotificationId), ids),
        yield* write("markSeen", Schema.DateTimeUtc, seenAt)
      )
    }),
    markSeenInThread: Effect.fn("NotificationStore.markSeenInThread")(function* (position, seenAt) {
      return yield* driver.markSeenInThread(
        yield* write("markSeenInThread", ReadState.ThreadPosition, position),
        yield* write("markSeenInThread", Schema.DateTimeUtc, seenAt)
      )
    }),
    accept: Effect.fn("NotificationStore.accept")(function* (ids, by, acceptedAt) {
      return yield* driver.accept(
        yield* write("accept", Schema.Array(Notification.NotificationId), ids),
        yield* write("accept", Notification.AcceptedBy, by),
        yield* write("accept", Schema.DateTimeUtc, acceptedAt)
      )
    }),
    discardPendingForParticipation: (id) =>
      Effect.flatMap(
        write("discardPendingForParticipation", ThreadParticipationId.ThreadParticipationId, id),
        driver.discardPendingForParticipation
      ),
    discardPendingForGroup: Effect.fn("NotificationStore.discardPendingForGroup")(function* (memberId, groupId) {
      return yield* driver.discardPendingForGroup(
        yield* write("discardPendingForGroup", MemberId.MemberId, memberId),
        yield* write("discardPendingForGroup", GroupId.GroupId, groupId)
      )
    })
  }
}

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Notification.Notification))

/** Whose inbox a notification is in: a membership, a contact, or triage. */
const inboxKey = (recipient: Notification.Recipient) =>
  MemoryDatabase.keyOf(
    recipient._tag,
    Notification.Recipient.isAnyOf(["Triage"])(recipient)
      ? ""
      : Notification.Recipient.isAnyOf(["Contact"])(recipient)
        ? recipient.id
        : recipient.memberId
  )
/** One notification per source entry and recipient identity. */
const sourceKey = ({ source, recipient }: Notification.Notification) =>
  MemoryDatabase.keyOf(
    source.logId,
    source.entryId,
    recipient._tag,
    Notification.Recipient.isAnyOf(["Triage"])(recipient) ? "" : recipient.id
  )
/** Recorded time, then ID in binary order. */
const byRecorded = (left: Notification.Notification, right: Notification.Notification) =>
  DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt) ||
  MemoryDatabase.compareBinary(left.id, right.id)
const isAfter = (record: Notification.Notification, cursor: Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) > 0
const isBefore = (record: Notification.Notification, cursor: Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) < 0

/**
 * Whether `record` comes at or before `cursor` in inbox order, by recorded time and then ID in
 * binary order: what marking a recipient's notifications seen through a point marks.
 *
 * @category predicates
 * @since 0.1.0
 */
export const isAtOrBefore = (record: Notification.Notification, cursor: Cursor): boolean =>
  byRecorded(record, Object.assign({}, record, cursor)) <= 0

/**
 * Whether `record` is the person's pending notification from a thread's activity up to their
 * position in it: what reading the thread through that position marks seen.
 *
 * @category predicates
 * @since 0.1.0
 */
export const isPendingInThread = (record: Notification.Notification, position: ReadState.ThreadPosition): boolean =>
  Notification.Recipient.isAnyOf(["Human"])(record.recipient) &&
  record.recipient.memberId === position.memberId &&
  Notification.State.isAnyOf(["Pending"])(record.state) &&
  record.thread !== undefined &&
  record.thread.threadId === position.threadId &&
  record.thread.sequence <= position.readThrough

/** Store `record` as seen at `seenAt`. */
const markRecordSeen = Effect.fnUntraced(function* (
  notifications: Map<string, string>,
  record: Notification.Notification,
  seenAt: DateTime.Utc
) {
  notifications.set(
    record.id,
    yield* rows.encode(Object.assign({}, record, { state: Notification.State.cases.Seen.make({ seenAt }) }))
  )
})

/** Notification records and recipient reads over the workspace transaction. */
const makeMemory = Effect.fn("NotificationStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* MemoryBinding.MemoryBinding
  const all = Effect.flatMap(read, (space) => rows.all(space.records.of("notifications")))

  const listPending = Effect.fnUntraced(function* (recipient: Notification.Recipient, options: ReadOptions) {
    const target = inboxKey(recipient)
    const after = options.after
    const records = yield* all
    return records
      .filter(
        (record) =>
          inboxKey(record.recipient) === target &&
          Notification.State.isAnyOf(["Pending"])(record.state) &&
          (after === undefined || isAfter(record, after))
      )
      .toSorted(byRecorded)
      .slice(0, options.limit)
  })

  const latest = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: LatestOptions,
    pendingOnly: boolean
  ) {
    const target = inboxKey(recipient)
    const before = options.before
    const records = yield* all
    return records
      .filter(
        (record) =>
          inboxKey(record.recipient) === target &&
          (!pendingOnly || Notification.State.isAnyOf(["Pending"])(record.state)) &&
          (before === undefined || isBefore(record, before))
      )
      .toSorted((left, right) => byRecorded(right, left))
      .slice(0, options.limit)
  })

  /** Write every record or none: an ID or source already recorded is rejected. */
  const insert = Effect.fnUntraced(
    function* (records: ReadonlyArray<Notification.Notification>, operation: string) {
      if (records.length === 0) return
      const space = yield* write
      const stored = yield* rows.all(space.records.of("notifications"))
      const ids = new Set(space.records.of("notifications").keys())
      const sources = new Set(stored.map(sourceKey))
      const written: Array<[string, string]> = []
      for (const record of records) {
        if (ids.has(record.id) || sources.has(sourceKey(record)))
          return yield* StoreError.rejected(
            "NotificationStore",
            operation,
            "Notification ID or source and recipient already recorded"
          )
        ids.add(record.id)
        sources.add(sourceKey(record))
        written.push([record.id, yield* rows.encode(record)])
      }
      for (const [id, row] of written) space.records.of("notifications").set(id, row)
    },
    (effect, _records, operation) => Effect.mapError(effect, StoreError.failed("NotificationStore", operation))
  )

  const driver: NotificationStore["Service"] = {
    get: Effect.fn("NotificationStore.memory.get")(
      function* (id) {
        const space = yield* read
        return yield* rows.get(space.records.of("notifications"), id)
      },
      Effect.mapError(StoreError.failed("NotificationStore", "get"))
    ),
    listPendingByRecipient: Effect.fn("NotificationStore.memory.listPendingByRecipient")(
      listPending,
      Effect.mapError(StoreError.failed("NotificationStore", "listPendingByRecipient"))
    ),
    listLatestByRecipient: Effect.fn("NotificationStore.memory.listLatestByRecipient")(
      (recipient, options) => latest(recipient, options, false),
      Effect.mapError(StoreError.failed("NotificationStore", "listLatestByRecipient"))
    ),
    listLatestPendingByRecipient: Effect.fn("NotificationStore.memory.listLatestPendingByRecipient")(
      (recipient, options) => latest(recipient, options, true),
      Effect.mapError(StoreError.failed("NotificationStore", "listLatestPendingByRecipient"))
    ),
    listByThread: Effect.fn("NotificationStore.memory.listByThread")(
      function* (recipient, threadId, range) {
        const target = inboxKey(recipient)
        const records = yield* all
        return records
          .filter(
            (record) =>
              inboxKey(record.recipient) === target &&
              record.thread !== undefined &&
              record.thread.threadId === threadId &&
              record.thread.sequence > range.afterSequence &&
              record.thread.sequence <= range.throughSequence
          )
          .toSorted(
            (left, right) =>
              (left.thread?.sequence ?? 0) - (right.thread?.sequence ?? 0) ||
              MemoryDatabase.compareBinary(left.id, right.id)
          )
      },
      Effect.mapError(StoreError.failed("NotificationStore", "listByThread"))
    ),
    listPendingByThread: Effect.fn("NotificationStore.memory.listPendingByThread")(
      function* (recipient, threadId, throughSequence) {
        const target = inboxKey(recipient)
        const records = yield* all
        return records
          .filter(
            (record) =>
              inboxKey(record.recipient) === target &&
              Notification.State.isAnyOf(["Pending"])(record.state) &&
              record.thread !== undefined &&
              record.thread.threadId === threadId &&
              record.thread.sequence <= throughSequence
          )
          .toSorted(
            (left, right) =>
              (left.thread?.sequence ?? 0) - (right.thread?.sequence ?? 0) ||
              MemoryDatabase.compareBinary(left.id, right.id)
          )
      },
      Effect.mapError(StoreError.failed("NotificationStore", "listPendingByThread"))
    ),
    countPendingByRecipient: Effect.fn("NotificationStore.memory.countPendingByRecipient")(
      function* (recipient) {
        const target = inboxKey(recipient)
        return (yield* all).filter(
          (record) => inboxKey(record.recipient) === target && Notification.State.isAnyOf(["Pending"])(record.state)
        ).length
      },
      Effect.mapError(StoreError.failed("NotificationStore", "countPendingByRecipient"))
    ),
    countPendingByGroup: Effect.fn("NotificationStore.memory.countPendingByGroup")(
      function* (recipient) {
        const target = inboxKey(recipient)
        const counts = new Map<GroupId.GroupId, number>()
        for (const record of yield* all)
          if (
            inboxKey(record.recipient) === target &&
            Notification.State.isAnyOf(["Pending"])(record.state) &&
            record.thread !== undefined
          )
            counts.set(record.thread.groupId, (counts.get(record.thread.groupId) ?? 0) + 1)
        return [...counts]
          .map(([groupId, count]) => ({ groupId, count }))
          .toSorted((left, right) => MemoryDatabase.compareBinary(left.groupId, right.groupId))
      },
      Effect.mapError(StoreError.failed("NotificationStore", "countPendingByGroup"))
    ),
    markSeen: Effect.fn("NotificationStore.memory.markSeen")(
      function* (ids, seenAt) {
        const notifications = (yield* write).records.of("notifications")
        // Check every notification before recording any of them.
        const pending: Array<Notification.Notification> = []
        for (const id of new Set(ids)) {
          const record = Option.getOrUndefined(yield* rows.get(notifications, id))
          if (
            record === undefined ||
            !Notification.Recipient.isAnyOf(["Human"])(record.recipient) ||
            !Notification.State.isAnyOf(["Pending"])(record.state)
          )
            return yield* StoreError.rejected(
              "NotificationStore",
              "markSeen",
              "Expected a pending notification of a human recipient"
            )
          pending.push(record)
        }
        for (const record of pending) yield* markRecordSeen(notifications, record, seenAt)
      },
      Effect.mapError(StoreError.failed("NotificationStore", "markSeen"))
    ),
    markSeenInThread: Effect.fn("NotificationStore.memory.markSeenInThread")(
      function* (position, seenAt) {
        const notifications = (yield* write).records.of("notifications")
        for (const record of yield* rows.all(notifications))
          if (isPendingInThread(record, position)) yield* markRecordSeen(notifications, record, seenAt)
      },
      Effect.mapError(StoreError.failed("NotificationStore", "markSeenInThread"))
    ),
    accept: Effect.fn("NotificationStore.memory.accept")(
      function* (ids, by, acceptedAt) {
        if (ids.length === 0) return
        const space = yield* write
        // A turn takes pending notifications of one agent; a delivery takes those of contacts.
        const takes = Notification.AcceptedBy.isAnyOf(["Turn"])(by)
          ? (recipient: Notification.Recipient, first: Notification.Recipient | undefined) =>
              Notification.Recipient.isAnyOf(["Agent"])(recipient) &&
              (!Predicate.isTagged(first, "Agent") || first.memberId === recipient.memberId)
          : (recipient: Notification.Recipient) => Notification.Recipient.isAnyOf(["Contact"])(recipient)
        const accepted: Array<Notification.Notification> = []
        for (const id of new Set(ids)) {
          const found = yield* rows.get(space.records.of("notifications"), id)
          const record = Option.getOrUndefined(found)
          if (
            record === undefined ||
            !Notification.State.isAnyOf(["Pending"])(record.state) ||
            !takes(record.recipient, accepted[0]?.recipient)
          )
            return yield* StoreError.rejected(
              "NotificationStore",
              "accept",
              Notification.AcceptedBy.isAnyOf(["Turn"])(by)
                ? "Expected pending notifications of one agent"
                : "Expected pending notifications of contacts"
            )
          accepted.push(record)
        }
        for (const record of accepted) {
          const row = yield* rows.encode(
            Object.assign({}, record, {
              state: Notification.State.cases.Accepted.make({ by, acceptedAt })
            })
          )
          space.records.of("notifications").set(record.id, row)
        }
      },
      Effect.mapError(StoreError.failed("NotificationStore", "accept"))
    ),
    discardPendingForParticipation: Effect.fn("NotificationStore.memory.discardPendingForParticipation")(
      function* (participationId) {
        const space = yield* write
        const records = yield* rows.all(space.records.of("notifications"))
        for (const record of records) {
          if (
            record.participationId !== participationId ||
            !Notification.Recipient.isAnyOf(["Agent"])(record.recipient) ||
            !Notification.State.isAnyOf(["Pending"])(record.state)
          )
            continue
          const row = yield* rows.encode({
            ...record,
            state: Notification.State.cases.Discarded.make({ reason: "participation-ended" })
          })
          space.records.of("notifications").set(record.id, row)
        }
      },
      Effect.mapError(StoreError.failed("NotificationStore", "discardPendingForParticipation"))
    ),
    discardPendingForGroup: Effect.fn("NotificationStore.memory.discardPendingForGroup")(
      function* (memberId, groupId) {
        const space = yield* write
        const records = yield* rows.all(space.records.of("notifications"))
        for (const record of records) {
          const { recipient } = record
          if (
            !Notification.Recipient.isAnyOf(["Human", "Agent"])(recipient) ||
            recipient.memberId !== memberId ||
            record.thread?.groupId !== groupId ||
            !Notification.State.isAnyOf(["Pending"])(record.state)
          )
            continue
          const reason = Notification.Recipient.isAnyOf(["Agent"])(recipient) ? "participation-ended" : "access-lost"
          const row = yield* rows.encode({ ...record, state: Notification.State.cases.Discarded.make({ reason }) })
          space.records.of("notifications").set(record.id, row)
        }
      },
      Effect.mapError(StoreError.failed("NotificationStore", "discardPendingForGroup"))
    ),
    insert: Effect.fn("NotificationStore.memory.insert")((input) => insert([input], "insert")),
    insertMany: Effect.fn("NotificationStore.memory.insertMany")((input) => insert(input, "insertMany"))
  }
  return make(workspaceId, driver)
})

/**
 * Provide `NotificationStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`. It
 * keeps what the contract leaves to storage: an insert writes every record or none, and a reused
 * ID, or a second notification for one source entry and recipient, is rejected. Marking seen is
 * rejected unless each notification is stored, of a human recipient, and pending. Accepting is
 * rejected unless each notification is pending and of one agent, for a turn, or of contacts, for a
 * delivery. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(NotificationStore, makeMemory())
