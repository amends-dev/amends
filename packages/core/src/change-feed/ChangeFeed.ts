/**
 * The change feed as a reader sees it: the `Message`s one subscription delivers, from `Ready`
 * through each commit the reader may see and the signals happening meanwhile, the `Change`s a commit
 * makes to what readers show, and the `Cursor` a reader stores to resume after the last commit it
 * received. `ChangeFeedService.watch` serves
 * it, and the HTTP API streams it as server-sent events.
 *
 * @since 0.1.0
 */

import * as Commit from "@amends-dev/log/Commit"
import * as Entry from "@amends-dev/log/Entry"
import * as Schema from "effect/Schema"
import * as Group from "../group/Group.ts"
import * as JournalEvent from "../journal/Event.ts"
import * as Notification from "../notification/Notification.ts"
import * as Signal from "../signal/Signal.ts"
import * as Thread from "../thread/Thread.ts"
import * as ThreadTimeline from "../thread/ThreadTimeline.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * An opaque resume point: the feed resumes after the commit that carried it. Clients store and
 * return it without interpreting it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Cursor = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9][0-9]*)$/),
  Schema.makeFilter((value) => Number.isSafeInteger(Number(value)) || "Cursor is out of range")
).pipe(Schema.brand("ChangeFeedCursor"))
/**
 * @category schemas
 * @since 0.1.0
 */
export type Cursor = typeof Cursor.Type

/**
 * The cursor that resumes after a journal position.
 *
 * @category converting
 * @since 0.1.0
 */
export const cursorOf = (position: Entry.Position): Cursor => Cursor.make(String(position))

/**
 * The journal position a cursor resumes after.
 *
 * @category converting
 * @since 0.1.0
 */
export const positionOf = (cursor: Cursor): Entry.Position => Entry.Position.make(Number(cursor))

/**
 * One event a reader receives: a delivered fact with its payload as the fact's public view,
 * JSON-encoded, and where and when it was recorded.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Event = Schema.Struct({
  id: Entry.EntryId,
  name: Schema.NonEmptyString,
  version: Schema.Finite,
  recordedAt: Schema.DateTimeUtcFromString,
  provenance: JournalEvent.Provenance,
  payload: Schema.Json
}).annotate({ identifier: "ChangeFeedEvent" })
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Event extends Schema.Schema.Type<typeof Event> {}

/**
 * Something a reader's view shows, as it is now, that a commit changed: what the reader puts in
 * place of what they show, rather than reading it again. Each is computed once, after the commit,
 * so it may reflect later commits too; the last change to anything follows its last commit.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Change = Schema.TaggedUnion({
  /** A timeline item as its thread shows it now: one the commit recorded, or about a record it changed. */
  TimelineItem: { item: ThreadTimeline.Item },
  /** A thread's preview as its group's stream shows it now, for a thread whose timeline the commit changed. */
  Preview: { preview: Thread.Preview },
  /** A group's latest activity as its members' groups lists show it now, for a group whose threads the commit changed. */
  GroupLatest: { latest: Group.Latest }
}).annotate({ identifier: "ChangeFeedChange" })
/**
 * @category schemas
 * @since 0.1.0
 */
export type Change = typeof Change.Type

/**
 * What one subscription delivers. Ready opens every subscription. With `reset`, the consumer must refresh its view: it gave no
 * cursor, an unknown one, or one too far behind to replay. Without it, the commits after the
 * consumer's cursor follow. Its cursor is where delivery starts; null means an empty journal.
 * Committed carries one commit for the reader, with the cursor that resumes after it: the events
 * they may see, in order, what it changed in what they may see, and the notifications it created
 * for them, as their inbox lists them. It is sent only when one of these is present. Signal carries something happening now,
 * such as typing, that the reader may see; it has no cursor, is never replayed, and may be missed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Message = Schema.TaggedUnion({
  Ready: {
    workspaceId: WorkspaceId.WorkspaceId,
    cursor: Schema.NullOr(Cursor),
    reset: Schema.Boolean
  },
  Committed: {
    workspaceId: WorkspaceId.WorkspaceId,
    cursor: Cursor,
    commitId: Commit.CommitId,
    events: Schema.Array(Event),
    changes: Schema.Array(Change),
    notifications: Schema.Array(Notification.Notification)
  },
  Signal: {
    workspaceId: WorkspaceId.WorkspaceId,
    signal: Signal.Signal
  }
}).annotate({ identifier: "ChangeFeedMessage" })
/**
 * @category schemas
 * @since 0.1.0
 */
export type Message = typeof Message.Type

/**
 * What a reader asks when it opens the feed.
 *
 * @category options
 * @since 0.1.0
 */
export const WatchOptions = Schema.Struct({
  /** Resume after this cursor; omitted, the subscription starts with a reset. */
  after: Schema.optionalKey(Cursor)
})
/**
 * @category options
 * @since 0.1.0
 */
export interface WatchOptions extends Schema.Schema.Type<typeof WatchOptions> {}
