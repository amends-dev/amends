/**
 * A commit: one transaction of a workspace's storage, which may append to several logs and write
 * projection stores and checkpoints. Each log it touches records its entries as one batch, at that
 * log's next position; every entry names the commit that wrote it, and `Store.Transaction` gives a
 * commit its ID.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Names a commit, as storage assigns it. `Store.CommitUncertain` reports it, so a commit whose
 * outcome was not confirmed can be looked up.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("JournalCommitId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;

/**
 * A commit as each of its log batches carries it: its ID, how many entries it appended across
 * every log, and when it was recorded.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Record = Schema.Struct({
  id: Id,
  /** Total entries appended across every log in this commit. */
  entryCount: Schema.Natural,
  recordedAt: Schema.DateTimeUtcFromString,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Record extends Schema.Schema.Type<typeof Record> {}
