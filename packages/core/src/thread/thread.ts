import { Schema } from "effect";
import { GroupId } from "../group/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { ThreadId } from "./id.ts";
import { ThreadMessage } from "./message/message.ts";
import { ThreadMessageActivity } from "./message/activity.ts";
import type { ThreadActivityKind } from "./activity/kind.ts";
export const Id = ThreadId.Id;
export type Id = ThreadId.Id;
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  /** Who started the conversation: a member, or the contact whose message a channel received. */
  createdBy: ThreadMessage.Author,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}
/**
 * A thread's latest content activity: the timeline position and time of its latest message.
 * Quiet participation changes do not count, so they never make a thread unread.
 */
export const Latest = Schema.Struct({
  threadId: ThreadId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  occurredAt: Schema.DateTimeUtcFromString,
});
export interface Latest extends Schema.Schema.Type<typeof Latest> {}

/** Exclusive boundary for listing a group's threads by latest activity, newest first. */
export const ListCursor = Schema.Struct({
  latestActivityAt: Latest.fields.occurredAt,
  threadId: ThreadId.Id,
});
export interface ListCursor extends Schema.Schema.Type<typeof ListCursor> {}
export const ListOptions = Schema.Struct({
  before: Schema.optionalKey(ListCursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}
/**
 * A readable thread with its latest activity and the reader's position. `unread` holds when the
 * latest message is past the position or, for a thread never read, came after the reader joined.
 */
export const ListItem = Schema.Struct({
  thread: Record,
  latest: Latest,
  readThrough: Schema.NullOr(Latest.fields.sequence),
  unread: Schema.Boolean,
});
export interface ListItem extends Schema.Schema.Type<typeof ListItem> {}
export const StartInGroupInput = Schema.Struct({
  groupId: GroupId.Id,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(MemberId.Id),
});
export interface StartInGroupInput extends Schema.Schema.Type<typeof StartInGroupInput> {}
/** The other members of a direct group; the author always belongs to it. */
export const StartDirectInput = Schema.Struct({
  memberIds: Schema.UniqueArray(MemberId.Id).check(Schema.isMinLength(1)),
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(MemberId.Id),
});
export interface StartDirectInput extends Schema.Schema.Type<typeof StartDirectInput> {}
export const Started = Schema.Struct({
  thread: Record,
  message: ThreadMessage.Record,
  activity: ThreadMessageActivity.Published.Activity,
});
export interface Started extends Schema.Schema.Type<typeof Started> {}
/**
 * One resolved timeline item: an activity with the records it references. Each domain that records
 * activity adds its kinds' items, so this covers every registered kind.
 */
export type TimelineItem = ThreadActivityKind.Item;
export * as Thread from "./thread.ts";
