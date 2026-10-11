import { Context, Effect, Schema } from "effect";
import type { DateTime, Option } from "effect";
import type { Store } from "../journal/store.ts";

import { Notification } from "./notification.ts";
import { GroupId } from "../group/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ThreadParticipationId } from "../thread/ThreadParticipationId.ts";
import { StoreInput } from "../journal/StoreInput.ts";
import type { WorkspaceId } from "../workspace/id.ts";

/** Exclusive keyset boundary for listing; not a journal position or live delivery cursor. */
export const Cursor = Schema.Struct({
  recordedAt: Notification.Record.fields.recordedAt,
  id: Notification.Id,
});
export interface Cursor extends Schema.Schema.Type<typeof Cursor> {}

export const ReadOptions = Schema.Struct({
  after: Schema.optionalKey(Cursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/** Reading newest first: the page before an exclusive boundary, or the newest page without one. */
export const LatestOptions = Schema.Struct({
  before: Schema.optionalKey(Cursor),
  limit: ReadOptions.fields.limit,
});
export interface LatestOptions extends Schema.Schema.Type<typeof LatestOptions> {}

/** A recipient's pending notifications from one group's thread activity. */
export const PendingCount = Schema.Struct({
  groupId: Notification.ThreadReference.fields.groupId,
  count: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface PendingCount extends Schema.Schema.Type<typeof PendingCount> {}

export class Failure extends Schema.TaggedError<Failure>()("NotificationStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("NotificationStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Workspace-bound notification read model. Reads use the current transaction
 * when present, otherwise committed state, and return isolated records. These
 * internal reads do not authorize callers; application operations must do so.
 * Every storage adapter implements this contract.
 *
 * The journal settles notifications as Pending, Discarded, or Informational, an agent's as
 * Accepted when a turn takes them, and a contact's when a delivery does. A human recipient's Seen is private state, written by markSeen
 * outside the journal and kept when projections are rebuilt: a notification projected again as
 * Pending reads as Seen, with its first time, once its recipient has seen it.
 */
/**
 * A range of one thread's timeline positions: after one, through another.
 *
 * @category schemas
 */
export const ThreadRange = Schema.Struct({
  afterSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  throughSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export interface ThreadRange extends Schema.Schema.Type<typeof ThreadRange> {}

/**
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
  /** Find a notification in this workspace; None if absent. */
  readonly get: (id: Notification.Id) => Effect.Effect<Option.Option<Notification.Record>, Failure>;

  /**
   * The recipient's pending notifications, matching their kind and ID: at most limit records
   * after the exclusive cursor, ordered by recordedAt ascending, then ID in binary lexical order.
   * Each call reads its current view; pages do not constitute a fixed snapshot.
   */
  readonly listPendingByRecipient: (
    recipient: Notification.Recipient,
    options: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Failure>;

  /**
   * The recipient's newest notifications first: at most limit records before the exclusive
   * cursor, ordered by recordedAt descending, then ID in descending binary lexical order. Each
   * call reads its current view.
   */
  readonly listLatestByRecipient: (
    recipient: Notification.Recipient,
    options: LatestOptions,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Failure>;

  /** Same ordering and pagination, restricted to Pending records. */
  readonly listLatestPendingByRecipient: (
    recipient: Notification.Recipient,
    options: LatestOptions,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Failure>;

  /**
   * Every notification of the recipient from one thread's activity in a range of timeline
   * positions, whatever its state, ordered by position, then ID in binary lexical order: what the
   * recipient was told there.
   */
  readonly listByThread: (
    recipient: Notification.Recipient,
    threadId: ThreadId.Id,
    range: ThreadRange,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Failure>;
  /**
   * The recipient's pending notifications from one thread's activity at or before a timeline
   * position, ordered by that position, then ID in binary lexical order.
   */
  readonly listPendingByThread: (
    recipient: Notification.Recipient,
    threadId: ThreadId.Id,
    throughSequence: number,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Failure>;

  /** How many pending notifications the recipient has, from anywhere. */
  readonly countPendingByRecipient: (
    recipient: Notification.Recipient,
  ) => Effect.Effect<number, Failure>;

  /**
   * How many pending notifications the recipient has from thread activity in each of these
   * groups, for groups with any. Read one page of groups at a time.
   */
  readonly countPendingByGroup: (
    recipient: Notification.Recipient,
    groupIds: ReadonlyArray<GroupId.Id>,
  ) => Effect.Effect<ReadonlyArray<PendingCount>, Failure>;

  /**
   * Projection write, enlisted with the source activity and checkpoint.
   * Reused IDs and duplicate (source log, source entry, recipient kind, recipient ID)
   * associations conflict atomically. Never upsert or retry internally; reject missing, foreign,
   * or expired transaction handles.
   */
  readonly insert: (
    record: Notification.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Insert several records in one projection write, with insert's conflicts,
   * including duplicates within the request. Any conflict fails the call and writes none of them.
   * An empty request writes nothing.
   */
  readonly insertMany: (
    records: ReadonlyArray<Notification.Record>,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Record that their human recipients have seen these notifications, outside the journal. Each
   * must be a human's notification in this workspace that is pending or already seen; otherwise
   * the call conflicts and writes nothing. A notification seen before keeps its first time. The
   * write joins the caller's transaction when there is one and is atomic on its own otherwise.
   */
  readonly markSeen: (
    ids: ReadonlyArray<Notification.Id>,
    seenAt: DateTime.Utc,
  ) => Effect.Effect<void, Failure | Conflict>;
  /**
   * Record that `by` accepted these pending notifications, in its commit: a turn, which takes
   * pending notifications of one agent in this workspace, or a delivery, which takes pending
   * notifications of contacts. Anything else conflicts and writes nothing. An empty request writes
   * nothing.
   */
  readonly accept: (
    ids: ReadonlyArray<Notification.Id>,
    by: Notification.AcceptedBy,
    acceptedAt: DateTime.Utc,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Settle pending agent input for this ended participation, preserving source and recipient history. */
  readonly discardPendingForParticipation: (
    id: ThreadParticipationId.Id,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Settle what a member had pending from a group's threads once they no longer belong to it,
   * keeping it as history: a person's unseen notifications as `access-lost`, and an agent's
   * pending input as `participation-ended`, since every participation it held there ended with
   * the departure. A person's seen ones and everyone else's stay.
   */
  readonly discardPendingForGroup: (
    memberId: MemberId.Id,
    groupId: GroupId.Id,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/notification/store/Service",
) {}

/** Seen and Accepted are recorded with markSeen and accept, never inserted. */
const unsettled = (record: Notification.Record) =>
  !Notification.State.isAnyOf(["Seen", "Accepted"])(record.state);
const settled = (operation: string) => () =>
  new Conflict({ operation, message: "Seen and Accepted are recorded with markSeen and accept" });

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Notification.Id, id), driver.get),
    listPendingByRecipient: Effect.fn("NotificationStore.listPendingByRecipient")(
      function* (recipient, options) {
        return yield* driver.listPendingByRecipient(
          yield* read("listPendingByRecipient", Notification.Recipient, recipient),
          yield* read("listPendingByRecipient", ReadOptions, options),
        );
      },
    ),
    listLatestByRecipient: Effect.fn("NotificationStore.listLatestByRecipient")(
      function* (recipient, options) {
        return yield* driver.listLatestByRecipient(
          yield* read("listLatestByRecipient", Notification.Recipient, recipient),
          yield* read("listLatestByRecipient", LatestOptions, options),
        );
      },
    ),
    listLatestPendingByRecipient: Effect.fn("NotificationStore.listLatestPendingByRecipient")(
      function* (recipient, options) {
        return yield* driver.listLatestPendingByRecipient(
          yield* read("listLatestPendingByRecipient", Notification.Recipient, recipient),
          yield* read("listLatestPendingByRecipient", LatestOptions, options),
        );
      },
    ),
    listByThread: Effect.fn("NotificationStore.listByThread")(
      function* (recipient, threadId, range) {
        return yield* driver.listByThread(
          yield* read("listByThread", Notification.Recipient, recipient),
          yield* read("listByThread", ThreadId.Id, threadId),
          yield* read("listByThread", ThreadRange, range),
        );
      },
    ),
    listPendingByThread: Effect.fn("NotificationStore.listPendingByThread")(
      function* (recipient, threadId, throughSequence) {
        return yield* driver.listPendingByThread(
          yield* read("listPendingByThread", Notification.Recipient, recipient),
          yield* read("listPendingByThread", ThreadId.Id, threadId),
          yield* read("listPendingByThread", Schema.Int, throughSequence),
        );
      },
    ),
    countPendingByRecipient: (recipient) =>
      Effect.flatMap(
        read("countPendingByRecipient", Notification.Recipient, recipient),
        driver.countPendingByRecipient,
      ),
    countPendingByGroup: Effect.fn("NotificationStore.countPendingByGroup")(
      function* (recipient, groupIds) {
        return yield* driver.countPendingByGroup(
          yield* read("countPendingByGroup", Notification.Recipient, recipient),
          yield* read("countPendingByGroup", Schema.Array(GroupId.Id), groupIds),
        );
      },
    ),
    insert: (record) =>
      write("insert", Notification.Record, record).pipe(
        Effect.filterOrFail(unsettled, settled("insert")),
        Effect.flatMap(driver.insert),
      ),
    insertMany: (records) =>
      write("insertMany", Schema.Array(Notification.Record), records).pipe(
        Effect.filterOrFail((records) => records.every(unsettled), settled("insertMany")),
        Effect.flatMap(driver.insertMany),
      ),
    markSeen: Effect.fn("NotificationStore.markSeen")(function* (ids, seenAt) {
      return yield* driver.markSeen(
        yield* write("markSeen", Schema.Array(Notification.Id), ids),
        yield* write("markSeen", Schema.DateTimeUtc, seenAt),
      );
    }),
    accept: Effect.fn("NotificationStore.accept")(function* (ids, by, acceptedAt) {
      return yield* driver.accept(
        yield* write("accept", Schema.Array(Notification.Id), ids),
        yield* write("accept", Notification.AcceptedBy, by),
        yield* write("accept", Schema.DateTimeUtc, acceptedAt),
      );
    }),
    discardPendingForParticipation: (id) =>
      Effect.flatMap(
        write("discardPendingForParticipation", ThreadParticipationId.Id, id),
        driver.discardPendingForParticipation,
      ),
    discardPendingForGroup: Effect.fn("NotificationStore.discardPendingForGroup")(
      function* (memberId, groupId) {
        return yield* driver.discardPendingForGroup(
          yield* write("discardPendingForGroup", MemberId.Id, memberId),
          yield* write("discardPendingForGroup", GroupId.Id, groupId),
        );
      },
    ),
  };
};

export * as NotificationStore from "./store.ts";
