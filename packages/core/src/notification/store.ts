import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { Notification } from "./notification.ts";
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
 * Both storage adapters implement this contract.
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
   * Projection write, enlisted with the source activity and checkpoint.
   * Validate before writing. Invalid records, foreign workspaces, reused IDs,
   * and duplicate (source log, source entry, recipient kind, recipient ID)
   * associations conflict atomically. Never upsert or retry internally; reject
   * missing, foreign, or expired transaction handles.
   */
  readonly insert: (
    record: Notification.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Pending-only projection write. Preserve source/history; reject missing, terminal, or incompatible records. */
  readonly acknowledge: (
    id: Notification.Id,
    acknowledgment: Notification.Acknowledgment,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Settle pending agent input for this ended participation, preserving source and recipient history. */
  readonly discardPendingForParticipation: (
    id: ThreadParticipationId.Id,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/notification/store/Service",
) {}

export * as NotificationStore from "./store.ts";
