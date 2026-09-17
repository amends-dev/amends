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

export interface Interface {
  /** Use the current transaction's view when present, otherwise committed state. */
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
}

/** Persistence is supplied by the host and shares the journal's native transaction. */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/checkpoint/Service",
) {}

export * as Checkpoint from "./checkpoint.ts";
