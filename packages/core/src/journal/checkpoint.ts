import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import { Commit } from "./commit.ts";
import { Entry } from "./entry.ts";
import { Store } from "./store.ts";

/** Each projection version owns progress for one domain log. */
export const Key = Schema.Struct({
  logId: Entry.LogId,
  name: Schema.NonEmptyString,
  version: Schema.Finite,
});
export interface Key extends Schema.Schema.Type<typeof Key> {}

/**
 * The last applied entry. The index tracks successive publications within an
 * open commit; durable checkpoints must end at the last entry of their batch.
 */
export const Cursor = Schema.Struct({
  position: Entry.Position,
  commitId: Commit.Id,
  index: Schema.Natural,
  entryId: Entry.Id,
});
export interface Cursor extends Schema.Schema.Type<typeof Cursor> {}

/** A projection version that every commit to its log applies. */
export const LiveVersion = Schema.Struct({
  name: Key.fields.name,
  version: Key.fields.version,
});
export interface LiveVersion extends Schema.Schema.Type<typeof LiveVersion> {}

/** A log's live projection versions: at most one version of each projection name. */
export const LiveVersions = Schema.Array(LiveVersion).check(
  Schema.makeFilter(
    (versions) =>
      new Set(versions.map(({ name }) => name)).size === versions.length ||
      "A projection name can have only one live version",
  ),
);

export interface Interface {
  /**
   * Progress of a consumer that reads behind the log, such as a projection being rebuilt.
   * Use the current transaction's view when present, otherwise committed state.
   */
  readonly get: (key: Key) => Effect.Effect<Option.Option<Cursor>, Store.Failure>;
  /**
   * Enlist in the active Store.Transaction, alongside the projection's domain
   * writes. Reads followed by set must be serializable, including an absent key:
   * concurrent runners must serialize or fail with Conflict, never both apply
   * the same batch. Reject expired or foreign transaction handles. Do not retry.
   */
  readonly set: (
    key: Key,
    cursor: Cursor,
  ) => Effect.Effect<void, Store.Failure | Store.Conflict, Store.Transaction>;
  /**
   * The projection versions live on this log, in unspecified order. A version is live when
   * every commit since it went live applied it, so it needs no progress of its own. Use the
   * current transaction's view when present, otherwise committed state.
   */
  readonly listLive: (
    logId: Entry.LogId,
  ) => Effect.Effect<ReadonlyArray<LiveVersion>, Store.Failure>;
  /**
   * Replace this log's live versions with exactly these, enlisted in the active
   * Store.Transaction. Invalid input, including two versions of one name, conflicts before
   * any change. Reject expired or foreign transaction handles. Do not retry.
   */
  readonly setLive: (
    logId: Entry.LogId,
    versions: ReadonlyArray<LiveVersion>,
  ) => Effect.Effect<void, Store.Failure | Store.Conflict, Store.Transaction>;
}

/** Persistence is supplied by the host and shares the journal's native transaction. */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/checkpoint/Service",
) {}

export * as Checkpoint from "./checkpoint.ts";
