import { Schema } from "effect";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("JournalCommitId"));
export type Id = typeof Id.Type;

/** One transaction, potentially spanning several logs and projection stores. */
export const Record = Schema.Struct({
  id: Id,
  /** Total entries appended across every log in this commit. */
  entryCount: Schema.Natural,
  recordedAt: Schema.DateTimeUtcFromString,
});

export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Commit from "./commit.ts";
