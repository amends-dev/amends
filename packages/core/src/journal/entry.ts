import { Schema } from "effect";
import { Commit } from "./commit.ts";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("LogEntryId"));
export type Id = typeof Id.Type;
export const LogId = Schema.NonEmptyString.pipe(Schema.brand("LogId"));
export type LogId = typeof LogId.Type;

/** A commit's position within one log. Different logs have independent cursors. */
export const Position = Schema.Natural.pipe(Schema.brand("LogPosition"));
export type Position = typeof Position.Type;

export const Metadata = Schema.Struct({
  id: Id,
  logId: LogId,
  position: Position,
  commitId: Commit.Id,
  /** Zero-based entry order within this commit's batch for this log. */
  index: Schema.Natural,
  recordedAt: Schema.DateTimeUtcFromString,
});
export interface Metadata extends Schema.Schema.Type<typeof Metadata> {}

export * as Entry from "./entry.ts";
