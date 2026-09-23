import { Schema } from "effect";
import { Commit } from "../journal/commit.ts";
import { Entry } from "../journal/entry.ts";
import { Event as JournalEvent } from "../journal/event.ts";
import { WorkspaceId } from "../workspace/id.ts";

/**
 * An opaque resume point: the feed resumes after the commit that carried it. Clients store and
 * return it without interpreting it.
 */
export const Cursor = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9][0-9]*)$/),
  Schema.makeFilter((value) => Number.isSafeInteger(Number(value)) || "Cursor is out of range"),
).pipe(Schema.brand("ChangeFeedCursor"));
export type Cursor = typeof Cursor.Type;

/** The cursor that resumes after a journal position. */
export const cursorOf = (position: Entry.Position): Cursor => Cursor.make(String(position));

/** The journal position a cursor resumes after. */
export const positionOf = (cursor: Cursor): Entry.Position => Entry.Position.make(Number(cursor));

/** Consumer-facing event; its payload is the fact's public view, JSON-encoded. */
export const Event = Schema.Struct({
  id: Entry.Id,
  name: Schema.NonEmptyString,
  version: Schema.Finite,
  recordedAt: Schema.DateTimeUtcFromString,
  provenance: JournalEvent.Provenance,
  payload: Schema.Json,
}).annotate({ identifier: "ChangeFeedEvent" });
export interface Event extends Schema.Schema.Type<typeof Event> {}

/**
 * Ready opens every subscription. With `reset`, the consumer must refresh its view: it gave no
 * cursor, an unknown one, or one too far behind to replay. Without it, the commits after the
 * consumer's cursor follow. Its cursor is where delivery starts; null means an empty journal.
 * Committed carries one commit's events that the reader may see, in order, with the cursor
 * that resumes after it.
 */
export const Message = Schema.TaggedUnion({
  Ready: {
    workspaceId: WorkspaceId.Id,
    cursor: Schema.NullOr(Cursor),
    reset: Schema.Boolean,
  },
  Committed: {
    workspaceId: WorkspaceId.Id,
    cursor: Cursor,
    commitId: Commit.Id,
    events: Schema.NonEmptyArray(Event),
  },
}).annotate({ identifier: "ChangeFeedMessage" });
export type Message = typeof Message.Type;

export const WatchOptions = Schema.Struct({
  /** Resume after this cursor; omitted, the subscription starts with a reset. */
  after: Schema.optionalKey(Cursor),
});
export interface WatchOptions extends Schema.Schema.Type<typeof WatchOptions> {}

/** The consumer must open a new subscription and refresh its current view. */
export class Unavailable extends Schema.TaggedError<Unavailable>()("ChangeFeed.Unavailable", {}) {}

export * as ChangeFeed from "./change-feed.ts";
