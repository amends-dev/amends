/**
 * A commit: one transaction of the store, which may append to several logs, and whatever else the
 * host enlists in it. Each log it touches records its entries as one batch, at that log's next
 * position; every entry names the commit that wrote it, and `Store.Transaction` gives a commit its
 * ID.
 *
 * @since 0.2.0
 */

import * as Schema from "effect/Schema"

/**
 * Names a commit, as storage assigns it. `Store.CommitUncertain` reports it, so a commit whose
 * outcome was not confirmed can be looked up.
 *
 * @category schemas
 * @since 0.2.0
 */
export const CommitId = Schema.NonEmptyString.pipe(Schema.brand("LogCommitId"))

/**
 * @category schemas
 * @since 0.2.0
 */
export type CommitId = typeof CommitId.Type

/**
 * A commit as each of its log batches carries it: its ID, how many entries it appended across
 * every log, and when it was recorded.
 *
 * @category schemas
 * @since 0.2.0
 */
export const Commit = Schema.Struct({
  id: CommitId,
  /** Total entries appended across every log in this commit. */
  entryCount: Schema.Natural,
  recordedAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.2.0
 */
export interface Commit extends Schema.Schema.Type<typeof Commit> {}
