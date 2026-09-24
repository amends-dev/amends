import { Schema } from "effect";
import { Commit } from "../journal/commit.ts";
import { Entry } from "../journal/entry.ts";
import { Event as JournalEvent } from "../journal/event.ts";
import { Notification } from "../notification/notification.ts";
import { Signal } from "../signal/signal.ts";
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
 * Committed carries one commit for the reader, with the cursor that resumes after it: the events
 * they may see, in order, and the notifications it created for them, as their inbox lists them.
 * It is sent only when at least one of the two is present. Signal carries something happening now,
 * such as typing, that the reader may see; it has no cursor, is never replayed, and may be missed.
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
    events: Schema.Array(Event),
    notifications: Schema.Array(Notification.Record),
  },
  Signal: {
    workspaceId: WorkspaceId.Id,
    signal: Signal.Value,
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
