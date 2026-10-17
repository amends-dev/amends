/**
 * A thread is one conversation in exactly one group, with participants and an ordered timeline of
 * typed activity. This module holds its record, the views a group's lists show of it, and the
 * inputs of the operations that start and rename one; `ThreadService` is those operations. The
 * messages, participations, and activity hang off the thread by its ID, in modules of their own.
 *
 * @since 0.1.0
 */

import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as Task from "../task/Task.ts"
import * as Text from "../text/Text.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as ThreadActivityKind from "./ThreadActivityKind.ts"
import * as ThreadId from "./ThreadId.ts"
import * as ThreadMessage from "./ThreadMessage.ts"

/**
 * A thread's title: a trimmed line of 1 to 200 characters without hidden ones. It is the thread's
 * own text, independent of every message in it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Title = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(200), Text.isName)

/**
 * @category schemas
 * @since 0.1.0
 */
export type Title = typeof Title.Type

/**
 * A thread as created and since renamed. Its group, which never changes, is whose members may
 * read it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Thread = Schema.Struct({
  id: ThreadId.ThreadId,
  workspaceId: WorkspaceId.WorkspaceId,
  groupId: GroupId.GroupId,
  /** Its title, or null, when readers show its opening message instead. */
  title: Schema.NullOr(Title),
  /**
   * The thread this one was derived from, or null. Set at creation, never changed, and no grant
   * of access to either thread: the originating thread may be in another group.
   */
  origin: Schema.NullOr(ThreadId.ThreadId),
  /** Who started the conversation: a member, or the contact whose message a channel received. */
  createdBy: ThreadMessage.Author,
  createdAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Thread extends Schema.Schema.Type<typeof Thread> {}

/**
 * A thread's latest content activity: the timeline position and time of its latest message.
 * Quiet participation changes do not count, so they never make a thread unread.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Latest = Schema.Struct({
  threadId: ThreadId.ThreadId,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  occurredAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Latest extends Schema.Schema.Type<typeof Latest> {}

/**
 * Exclusive boundary for listing a group's threads by latest activity, newest first: the last
 * listed thread's latest activity time and ID.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ListCursor = Schema.Struct({
  latestActivityAt: Latest.fields.occurredAt,
  threadId: ThreadId.ThreadId
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ListCursor extends Schema.Schema.Type<typeof ListCursor> {}

/**
 * One page of a group's threads by latest activity: at most `limit`, after the exclusive `before`
 * cursor, or the newest without one.
 *
 * @category options
 * @since 0.1.0
 */
export const ListOptions = Schema.Struct({
  before: Schema.optionalKey(ListCursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category options
 * @since 0.1.0
 */
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}

/**
 * A readable thread with the task it tracks, if any, its latest activity, and the reader's
 * position. `unread` holds when the latest message is past the position or, for a thread never
 * read, came after the reader joined.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ListItem = Schema.Struct({
  thread: Thread,
  /** The task the thread tracks, or null. */
  task: Schema.NullOr(Task.Task),
  latest: Latest,
  readThrough: Schema.NullOr(Latest.fields.sequence),
  unread: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ListItem extends Schema.Schema.Type<typeof ListItem> {}

/**
 * Whether a thread whose latest message is `latest` is unread by a reader who read through
 * `readThrough`, or, having never read it, joined its group at `admittedAt`: a thread never read
 * is new only if its latest message came after the reader joined.
 *
 * @category predicates
 * @since 0.1.0
 */
export const isUnread = (latest: Latest, readThrough: number | null, admittedAt: DateTime.Utc): boolean =>
  readThrough === null ? DateTime.isGreaterThan(latest.occurredAt, admittedAt) : latest.sequence > readThrough

/**
 * A thread as every reader's list shows it: with its task, if any, and its latest activity.
 *
 * @category models
 * @since 0.1.0
 */
export type Listed = Pick<ListItem, "thread" | "task" | "latest">

/**
 * A listed thread as one reader lists it, who read through `readThrough` and joined at
 * `admittedAt`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const listItem = (listed: Listed, readThrough: number | null, admittedAt: DateTime.Utc): ListItem => ({
  thread: listed.thread,
  task: listed.task,
  latest: listed.latest,
  readThrough,
  unread: isUnread(listed.latest, readThrough, admittedAt)
})

/**
 * Exclusive boundary for paging a group's threads by when they started, newest first: the last
 * listed thread's creation time and ID.
 *
 * @category schemas
 * @since 0.1.0
 */
export const OpeningCursor = Schema.Struct({
  createdAt: Thread.fields.createdAt,
  threadId: ThreadId.ThreadId
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface OpeningCursor extends Schema.Schema.Type<typeof OpeningCursor> {}

/**
 * One page of a group's threads by when they started: at most `limit`, after the exclusive
 * `before` cursor, or the newest without one.
 *
 * @category options
 * @since 0.1.0
 */
export const OpeningOptions = Schema.Struct({
  before: Schema.optionalKey(OpeningCursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category options
 * @since 0.1.0
 */
export interface OpeningOptions extends Schema.Schema.Type<typeof OpeningOptions> {}

/**
 * A thread as its group's stream shows it to everyone who may read it: the task it tracks, if any,
 * the message that opened it, how many replies followed, and its latest message. The change feed
 * delivers it as a commit changes it; a reader's stream adds how far they read it, as `Opening`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Preview = Schema.Struct({
  thread: Thread,
  task: ListItem.fields.task,
  message: ThreadMessage.ThreadMessage,
  replies: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  latest: Latest
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Preview extends Schema.Schema.Type<typeof Preview> {}

/**
 * A readable thread as one reader's stream shows it: its preview, and the reader's position, with
 * `unread` as in `ListItem`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Opening = Schema.Struct({
  ...Preview.fields,
  readThrough: ListItem.fields.readThrough,
  unread: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Opening extends Schema.Schema.Type<typeof Opening> {}

/**
 * A thread's preview as the reader of a listed thread sees it, with their position from `item`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const opening = (preview: Preview, item: Pick<ListItem, "readThrough" | "unread">): Opening => ({
  thread: preview.thread,
  task: preview.task,
  message: preview.message,
  replies: preview.replies,
  latest: preview.latest,
  readThrough: item.readThrough,
  unread: item.unread
})

/**
 * A thread's new title, and the title the renamer last saw, so a rename made meanwhile is not
 * silently replaced.
 *
 * @category options
 * @since 0.1.0
 */
export const RenameInput = Schema.Struct({
  threadId: ThreadId.ThreadId,
  title: Title,
  expectedTitle: Schema.NullOr(Title)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/**
 * What renaming a thread records: its new title. The group is the fact's audience.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Renamed = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  threadId: ThreadId.ThreadId,
  groupId: GroupId.GroupId,
  title: Title
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}

/**
 * What starts a thread in a group: the opening message, whom it mentions, a title if the author
 * gives one, the thread it is derived from if any, and the task it is created as, if one.
 *
 * @category options
 * @since 0.1.0
 */
export const StartInGroupInput = Schema.Struct({
  groupId: GroupId.GroupId,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(MemberId.MemberId),
  title: Schema.optionalKey(Title),
  /** The thread this one splits work out of, which the author can read. */
  origin: Schema.optionalKey(ThreadId.ThreadId),
  /** Create the thread as a task, with these options, at its second position. */
  task: Schema.optionalKey(Task.Options)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface StartInGroupInput extends Schema.Schema.Type<typeof StartInGroupInput> {}

/**
 * What starts a thread in a direct group: the other members of the group, which the author always
 * belongs to, the opening message, and a title if the author gives one.
 *
 * @category options
 * @since 0.1.0
 */
export const StartDirectInput = Schema.Struct({
  memberIds: Schema.UniqueArray(MemberId.MemberId).check(Schema.isMinLength(1)),
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(MemberId.MemberId),
  title: Schema.optionalKey(Title)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface StartDirectInput extends Schema.Schema.Type<typeof StartDirectInput> {}

/**
 * What a start returns: the thread, its opening message, and the task it was created as, or null.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Started = Schema.Struct({
  thread: Thread,
  message: ThreadMessage.ThreadMessage,
  task: Schema.NullOr(Task.Task)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Started extends Schema.Schema.Type<typeof Started> {}

/**
 * One resolved timeline item: an activity with the records it references. Each domain that records
 * activity adds its kinds' items, so this covers every registered kind; `ThreadTimeline.Item` is
 * its schema.
 *
 * @category models
 * @since 0.1.0
 */
export type TimelineItem = ThreadActivityKind.Item
