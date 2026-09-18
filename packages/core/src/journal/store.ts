import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import { Commit } from "./commit.ts";
import { Entry } from "./entry.ts";

/** All entries written to one log by one commit. */
export const Batch = Schema.Struct({
  logId: Entry.LogId,
  position: Entry.Position,
  commit: Commit.Record,
  entries: Schema.NonEmptyArray(Entry.Record),
});
export interface Batch extends Schema.Schema.Type<typeof Batch> {}

export const ReadOptions = Schema.Struct({
  after: Schema.optionalKey(Entry.Position),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

export const AppendOptions = Schema.Struct({
  /** None requires an empty log; Some requires the specified current position. */
  expectedAfter: Schema.optionalKey(Schema.Option(Entry.Position)),
});
export interface AppendOptions extends Schema.Schema.Type<typeof AppendOptions> {}

export const AppendInput = Schema.Struct({
  logId: Entry.LogId,
  payloads: Schema.Array(Schema.Uint8Array),
  ...AppendOptions.fields,
});
export interface AppendInput extends Schema.Schema.Type<typeof AppendInput> {}

export class Failure extends Schema.TaggedError<Failure>()("JournalStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("JournalStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

export class CommitUncertain extends Schema.TaggedError<CommitUncertain>()(
  "JournalStore.CommitUncertain",
  { commitId: Commit.Id, cause: Schema.Defect() },
) {}

/** Host-owned write handle shared by all logs and participating projection stores. */
export class Transaction extends Context.Service<
  Transaction,
  {
    readonly id: Commit.Id;
    /**
     * Append in request order, assigning unique ids, timestamps, and log positions.
     * Appends to the same log in this transaction share a position and extend its
     * consecutive indexes. Other logs have independent positions. Positions become
     * visible in increasing order, with no late insertion below a visible cursor.
     * Check expectedAfter atomically against the transaction's current log view.
     * Copy input bytes and reject expired handles. Returned entries are provisional.
     */
    readonly append: (
      request: AppendInput,
    ) => Effect.Effect<ReadonlyArray<Entry.Record>, Failure | Conflict>;
  }
>()("@amends/core/journal/store/Transaction") {}

export interface Interface {
  /**
   * Host transaction primitive. Provides Transaction and enlists all log writes
   * and domain projection stores and checkpoints in one serializable commit.
   * The core transaction coordinator calls this once per outer commit. Do not
   * automatically retry the program. Roll back failures and interruption; report an unconfirmed
   * commit outcome as CommitUncertain with its identity for reconciliation.
   * Persistence across restarts depends on the adapter.
   */
  readonly transaction: <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Failure | Conflict | CommitUncertain, Exclude<R, Transaction>>;

  /** Reads use the current transaction when present, otherwise committed state. */
  readonly get: (
    logId: Entry.LogId,
    commitId: Commit.Id,
  ) => Effect.Effect<Option.Option<Batch>, Failure>;
  /**
   * Read complete batches for this log after the exclusive cursor, in increasing
   * position order. A commit touching other logs does not appear here. Never split
   * a batch across pages. Empty logs return an empty page. Isolate returned bytes
   * and records from caller mutation.
   */
  readonly read: (
    logId: Entry.LogId,
    options: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Batch>, Failure>;

  /**
   * Wait outside a transaction for committed entries beyond the exclusive cursor
   * (None means any committed batch). Check durable state around subscribing so
   * an append before or during registration cannot be missed. Observe all writers,
   * including other processes and commits whose acknowledgment was lost. Hosts
   * may use notifications, polling, or both; never hold a write transaction while
   * waiting. Wakeups are hints: callers re-read the log. Coalesce notifications
   * instead of buffering entries, and release waiting resources on interruption.
   */
  readonly waitForAppend: (
    logId: Entry.LogId,
    after: Option.Option<Entry.Position>,
  ) => Effect.Effect<void, Failure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/store/Service",
) {}

export * as Store from "./store.ts";
