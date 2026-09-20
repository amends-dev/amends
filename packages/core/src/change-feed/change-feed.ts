import { Schema } from "effect";
import { Commit } from "../journal/commit.ts";
import { Entry } from "../journal/entry.ts";
import { Event as JournalEvent } from "../journal/event.ts";
import { WorkspaceId } from "../workspace/id.ts";

/** Consumer-facing event; its payload is the fact schema's JSON-encoded representation. */
export const Event = Schema.Struct({
  id: Entry.Id,
  name: Schema.NonEmptyString,
  version: Schema.Finite,
  recordedAt: Schema.DateTimeUtcFromString,
  provenance: Schema.NullOr(JournalEvent.Provenance),
  payload: Schema.Json,
}).annotate({ identifier: "ChangeFeedEvent" });
export interface Event extends Schema.Schema.Type<typeof Event> {}

/** Ready establishes the live boundary; Committed preserves one transaction's event order. */
export const Message = Schema.TaggedUnion({
  Ready: { workspaceId: WorkspaceId.Id },
  Committed: {
    workspaceId: WorkspaceId.Id,
    commitId: Commit.Id,
    events: Schema.NonEmptyArray(Event),
  },
}).annotate({ identifier: "ChangeFeedMessage" });
export type Message = typeof Message.Type;

/** The consumer must open a new subscription and refresh its current view. */
export class Unavailable extends Schema.TaggedError<Unavailable>()("ChangeFeed.Unavailable", {}) {}

export * as ChangeFeed from "./change-feed.ts";
