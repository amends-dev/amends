import { Context, Schema } from "effect";
import type { DateTime, Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { Notification } from "./notification.ts";
import type { GroupId } from "../group/id.ts";
import type { MemberId } from "../workspace/member/id.ts";
import type { ThreadId } from "../thread/id.ts";
import type { ThreadParticipationId } from "../thread/participation/id.ts";

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
 * The journal settles notifications as Pending or Discarded. A human recipient's Seen is private
 * state beside them, written by markSeen and kept when projections are rebuilt: reads show a
 * seen pending notification as Acknowledged with outcome Seen and its time, and pending reads and
 * counts leave it out.
 */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;

  /** Find a notification in this workspace; None if absent. */
  readonly get: (id: Notification.Id) => Effect.Effect<Option.Option<Notification.Record>, Failure>;

  /**
   * Match the recipient's kind and ID. Return at most limit records after the
   * exclusive cursor, ordered by recordedAt ascending, then ID in binary lexical
   * order. Each call reads its current view; pages do not constitute a fixed snapshot.
   */
  readonly listByRecipient: (
    recipient: Notification.Recipient,
    options: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Failure>;

  /** Same ordering and pagination, restricted to Pending records. */
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
   * Validate before writing. Invalid records, foreign workspaces, reused IDs,
   * and duplicate (source log, source entry, recipient kind, recipient ID)
   * associations conflict atomically, and so does an Acknowledged record: Seen is recorded with
   * markSeen. Never upsert or retry internally; reject missing, foreign, or expired transaction
   * handles.
   */
  readonly insert: (
    record: Notification.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Insert several records in one projection write, with insert's validation and conflicts,
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
  /** Settle pending agent input for this ended participation, preserving source and recipient history. */
  readonly discardPendingForParticipation: (
    id: ThreadParticipationId.Id,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /**
   * Settle a person's pending, unseen notifications from a group's threads once they no longer
   * belong to it, as `access-lost`, keeping them as history. Seen ones and everyone else's stay.
   */
  readonly discardPendingForGroup: (
    memberId: MemberId.Id,
    groupId: GroupId.Id,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/notification/store/Service",
) {}

export * as NotificationStore from "./store.ts";
