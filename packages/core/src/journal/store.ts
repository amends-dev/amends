import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import { Commit } from "./commit.ts";
import { Entry as LogEntry } from "./entry.ts";
import { Event } from "./event.ts";
import { Occurrence } from "./occurrence.ts";

/** Domain journals provide a fact header; generic logs provide only payload bytes. */
export const Content = Schema.Struct({
  payload: Schema.Uint8Array,
  fact: Schema.optionalKey(Event.Header),
});
export interface Content extends Schema.Schema.Type<typeof Content> {}

/** Complete persisted entry, with queryable metadata beside the payload. */
export const Entry = Schema.Struct({ ...LogEntry.Metadata.fields, ...Content.fields });
export interface Entry extends Schema.Schema.Type<typeof Entry> {}

export const Cursor = Schema.Struct({ position: LogEntry.Position, index: Schema.Natural });
export interface Cursor extends Schema.Schema.Type<typeof Cursor> {}

/** Entry pagination is independent of the complete-batch replay cursor. */
export const ReadFactsOptions = Schema.Struct({
  name: Schema.optionalKey(Event.Header.fields.name),
  subject: Schema.optionalKey(Event.Header.fields.subject),
  version: Schema.optionalKey(Event.Header.fields.version),
  after: Schema.optionalKey(Cursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter((options) => {
    if (options.name === undefined && options.subject === undefined)
      return "A fact name or subject is required";
    if (options.version !== undefined && options.name === undefined)
      return "A fact version requires a fact name";
    return undefined;
  }),
);
export interface ReadFactsOptions extends Schema.Schema.Type<typeof ReadFactsOptions> {}

/** All entries written to one log by one commit. */
export const Batch = Schema.Struct({
  logId: LogEntry.LogId,
  position: LogEntry.Position,
  commit: Commit.Record,
  entries: Schema.NonEmptyArray(Entry),
});
export interface Batch extends Schema.Schema.Type<typeof Batch> {}

export const ReadOptions = Schema.Struct({
  after: Schema.optionalKey(LogEntry.Position),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/** Identifies one append occurrence within a workspace and log, across retries. */
export const IdempotencyKey = Occurrence.Key;
export type IdempotencyKey = typeof IdempotencyKey.Type;

export const AppendOptions = Schema.Struct({
  /** None requires an empty log; Some requires the specified current position. */
  expectedAfter: Schema.optionalKey(Schema.Option(LogEntry.Position)),
  idempotencyKey: Schema.optionalKey(IdempotencyKey),
});
export interface AppendOptions extends Schema.Schema.Type<typeof AppendOptions> {}

export const AppendInput = Schema.Struct({
  logId: LogEntry.LogId,
  entries: Schema.Array(Content),
  ...AppendOptions.fields,
}).check(
  Schema.makeFilter((input) =>
    input.idempotencyKey === undefined || input.entries.length > 0
      ? undefined
      : "A keyed append must contain at least one entry",
  ),
);
export interface AppendInput extends Schema.Schema.Type<typeof AppendInput> {}

/** A durable key binds the exact slice written by one append, not its entire commit. */
export const AppendReceipt = Schema.Struct({
  logId: LogEntry.LogId,
  key: IdempotencyKey,
  commitId: Commit.Id,
  firstIndex: Schema.Natural,
  entryCount: Schema.Int.check(Schema.isGreaterThan(0)),
  entries: Schema.NonEmptyArray(Entry),
}).check(
  Schema.makeFilter((receipt) => {
    if (receipt.entries.length !== receipt.entryCount) return "Incomplete keyed append receipt";
    const ids = new Set<LogEntry.Id>();
    for (const [offset, entry] of receipt.entries.entries()) {
      if (
        entry.logId !== receipt.logId ||
        entry.commitId !== receipt.commitId ||
        entry.position !== receipt.entries[0].position ||
        entry.index !== receipt.firstIndex + offset ||
        ids.has(entry.id)
      )
        return "Entries must match their keyed append receipt";
      ids.add(entry.id);
    }
    return undefined;
  }),
);
export interface AppendReceipt extends Schema.Schema.Type<typeof AppendReceipt> {}

/** Compare encoded append intent byte for byte, preserving payload order. */
export const samePayloads = (
  left: ReadonlyArray<Uint8Array>,
  right: ReadonlyArray<Uint8Array>,
): boolean =>
  left.length === right.length &&
  left.every((bytes, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      bytes.length === other.length &&
      bytes.every((byte, offset) => byte === other[offset])
    );
  });

const sameHeader = Schema.toEquivalence(Schema.UndefinedOr(Event.Header));
/** Native retries compare the complete content, including structured attribution. */
export const sameContents = (
  left: ReadonlyArray<Content>,
  right: ReadonlyArray<Content>,
): boolean =>
  samePayloads(
    left.map((entry) => entry.payload),
    right.map((entry) => entry.payload),
  ) && left.every((entry, index) => sameHeader(entry.fact, right[index]?.fact));

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
     * Resolve a matching idempotency key first: return its original entries without
     * appending or checking expectedAfter. Different bytes, fact metadata, or count conflict.
     * Persist the key and append slice in this same transaction; rollback releases it.
     * Copy input bytes and reject expired handles. Returned entries are provisional.
     */
    readonly append: (
      request: AppendInput,
    ) => Effect.Effect<ReadonlyArray<Entry>, Failure | Conflict>;
  }
>()("@amends/core/journal/store/Transaction") {}

export interface TransactionOptions {
  /**
   * Internal observer of a confirmed native commit. Run once, uninterruptibly, after COMMIT
   * succeeds; never on rollback or an uncertain outcome. It must not access storage or wait
   * for consumers: the adapter may still hold its connection. Failures are logged, never
   * reported as a failed write. Adapters use notifyCommit to apply that policy consistently.
   */
  readonly onCommit?: Effect.Effect<void, unknown>;
}

/** Run a local commit observer without changing the already committed transaction's outcome. */
export const notifyCommit = (
  commitId: Commit.Id,
  options?: TransactionOptions,
): Effect.Effect<void> =>
  options?.onCommit === undefined
    ? Effect.void
    : options.onCommit.pipe(
        Effect.catchCause((cause) =>
          Effect.logError("Post-commit observer failed", cause).pipe(
            Effect.annotateLogs({ commitId }),
          ),
        ),
      );

export interface Interface {
  /** Lookup is workspace-bound and sees this transaction's staged keys when present. */
  readonly getAppend: (
    logId: LogEntry.LogId,
    key: IdempotencyKey,
  ) => Effect.Effect<Option.Option<AppendReceipt>, Failure>;
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
    options?: TransactionOptions,
  ) => Effect.Effect<A, E | Failure | Conflict | CommitUncertain, Exclude<R, Transaction>>;

  /** Reads use the current transaction when present, otherwise committed state. */
  readonly getEntry: (
    logId: LogEntry.LogId,
    entryId: LogEntry.Id,
  ) => Effect.Effect<Option.Option<Entry>, Failure>;
  readonly get: (
    logId: LogEntry.LogId,
    commitId: Commit.Id,
  ) => Effect.Effect<Option.Option<Batch>, Failure>;
  /**
   * Read complete batches for this log after the exclusive cursor, in increasing
   * position order. A commit touching other logs does not appear here. Never split
   * a batch across pages. Empty logs return an empty page. Isolate returned bytes
   * and records from caller mutation.
   */
  readonly read: (
    logId: LogEntry.LogId,
    options: ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Batch>, Failure>;

  /** Filter in storage and page individual facts by (position, index), across versions by default. */
  readonly readFacts: (
    logId: LogEntry.LogId,
    options: ReadFactsOptions,
  ) => Effect.Effect<ReadonlyArray<Entry>, Failure>;

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
    logId: LogEntry.LogId,
    after: Option.Option<LogEntry.Position>,
  ) => Effect.Effect<void, Failure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/store/Service",
) {}

export * as Store from "./store.ts";
