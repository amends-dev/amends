/**
 * Where a log entry is and what recorded it: its ID, its log, the position of the batch its commit
 * wrote to that log, and its index in that batch. A position is a batch cursor, so an entry is
 * located by its log, position, and index, and each log's positions are its own. `Log` and `Store`
 * build their entries on this metadata.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Commit from "./Commit.ts"

/**
 * Names one log entry within its workspace. A fact event's ID is its entry's.
 *
 * @category schemas
 * @since 0.1.0
 */
export const EntryId = Schema.NonEmptyString.pipe(Schema.brand("LogEntryId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type EntryId = typeof EntryId.Type

/**
 * Names a log within a workspace, such as the workspace journal's. Reopening the same ID addresses
 * the same history.
 *
 * @category schemas
 * @since 0.1.0
 */
export const LogId = Schema.NonEmptyString.pipe(Schema.brand("LogId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type LogId = typeof LogId.Type

/**
 * A commit's position within one log. Different logs have independent cursors.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Position = Schema.Natural.pipe(Schema.brand("LogPosition"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Position = typeof Position.Type

/**
 * What every stored entry carries beside its payload: where it is, which commit recorded it, and
 * when.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Metadata = Schema.Struct({
  id: EntryId,
  logId: LogId,
  position: Position,
  commitId: Commit.CommitId,
  /** Zero-based entry order within this commit's batch for this log. */
  index: Schema.Natural,
  recordedAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Metadata extends Schema.Schema.Type<typeof Metadata> {}
