/**
 * A thread is one conversation in exactly one group, with participants and an ordered timeline of
 * typed activity. This module holds its record, the views a group's lists show of it, and the
 * inputs of the operations that start and rename one; `ThreadService` is those operations. The
 * messages, participations, and activity hang off the thread by its ID, in modules of their own.
 *
 * @since 0.1.0
 */
import { DateTime, Schema } from "effect";
import * as GroupId from "../group/GroupId.ts";
import * as Text from "../text/Text.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as ThreadId from "./ThreadId.ts";
import * as ThreadMessage from "./ThreadMessage.ts";
import type * as ThreadActivityKind from "./ThreadActivityKind.ts";
import * as Task from "../task/Task.ts";

/**
 * Names a thread; `ThreadId.Id`, where models that only refer to threads import it from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = ThreadId.Id;

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = ThreadId.Id;

/**
 * A thread's title: a trimmed line of 1 to 200 characters without hidden ones. It is the thread's
 * own text, independent of every message in it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Title = Schema.Trimmed.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200),
  Text.isName,
);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Title = typeof Title.Type;

/**
 * A thread as created and since renamed. Its group, which never changes, is whose members may
 * read it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Thread = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  /** Its title, or null, when readers show its opening message instead. */
  title: Schema.NullOr(Title),
  /**
   * The thread this one was derived from, or null. Set at creation, never changed, and no grant
   * of access to either thread: the originating thread may be in another group.
   */
  origin: Schema.NullOr(Id),
  /** Who started the conversation: a member, or the contact whose message a channel received. */
  createdBy: ThreadMessage.Author,
  createdAt: Schema.DateTimeUtcFromString,
});

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
  threadId: ThreadId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  occurredAt: Schema.DateTimeUtcFromString,
});

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
  threadId: ThreadId.Id,
});

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
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

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
  unread: Schema.Boolean,
});

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
 * @category utils
 * @since 0.1.0
 */
export const isUnread = (
  latest: Latest,
  readThrough: number | null,
  admittedAt: DateTime.Utc,
): boolean =>
  readThrough === null
    ? DateTime.isGreaterThan(latest.occurredAt, admittedAt)
    : latest.sequence > readThrough;

/**
 * `thread` as a reader lists it, who read through `readThrough` and joined at `admittedAt`.
 *
 * @category utils
 * @since 0.1.0
 */
export const listItem = (
  thread: Thread,
  task: Task.Task | null,
  latest: Latest,
  readThrough: number | null,
  admittedAt: DateTime.Utc,
): ListItem => ({
  thread,
  task,
  latest,
  readThrough,
  unread: isUnread(latest, readThrough, admittedAt),
});

/**
 * Exclusive boundary for paging a group's threads by when they started, newest first: the last
 * listed thread's creation time and ID.
 *
 * @category schemas
 * @since 0.1.0
 */
export const OpeningCursor = Schema.Struct({
  createdAt: Thread.fields.createdAt,
  threadId: ThreadId.Id,
});

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
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface OpeningOptions extends Schema.Schema.Type<typeof OpeningOptions> {}

/**
 * A readable thread as its group's stream shows it: the task it tracks, if any, the message that
 * opened it, how many replies followed, its latest message, and the reader's position, with
 * `unread` as in `ListItem`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Opening = Schema.Struct({
  thread: Thread,
  task: ListItem.fields.task,
  message: ThreadMessage.ThreadMessage,
  replies: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  latest: Latest,
  readThrough: ListItem.fields.readThrough,
  unread: Schema.Boolean,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Opening extends Schema.Schema.Type<typeof Opening> {}

/**
 * A listed thread as its group's stream shows it, with its opening `message` and `replies`.
 *
 * @category utils
 * @since 0.1.0
 */
export const opening = (
  item: ListItem,
  message: ThreadMessage.ThreadMessage,
  replies: number,
): Opening => ({
  thread: item.thread,
  task: item.task,
  message,
  replies,
  latest: item.latest,
  readThrough: item.readThrough,
  unread: item.unread,
});

/**
 * A thread's new title, and the title the renamer last saw, so a rename made meanwhile is not
 * silently replaced.
 *
 * @category options
 * @since 0.1.0
 */
export const RenameInput = Schema.Struct({
  threadId: Id,
  title: Title,
  expectedTitle: Schema.NullOr(Title),
});

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
  workspaceId: WorkspaceId.Id,
  threadId: Id,
  groupId: GroupId.Id,
  title: Title,
});

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
  groupId: GroupId.Id,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(MemberId.Id),
  title: Schema.optionalKey(Title),
  /** The thread this one splits work out of, which the author can read. */
  origin: Schema.optionalKey(Id),
  /** Create the thread as a task, with these options, at its second position. */
  task: Schema.optionalKey(Task.Options),
});

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
  memberIds: Schema.UniqueArray(MemberId.Id).check(Schema.isMinLength(1)),
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(MemberId.Id),
  title: Schema.optionalKey(Title),
});

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
  task: Schema.NullOr(Task.Task),
});

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
export type TimelineItem = ThreadActivityKind.Item;
