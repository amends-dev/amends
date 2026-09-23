import { Schema } from "effect";
import { GroupId } from "../group/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { ThreadId } from "./id.ts";
import { ThreadMessage } from "./message/message.ts";
import { ThreadActivity } from "./activity/activity.ts";
import { ThreadParticipation } from "./participation/participation.ts";
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
  activity: ThreadActivity.MessagePublished,
});
export interface Started extends Schema.Schema.Type<typeof Started> {}
/** Resolve each activity's subject only after authorizing the thread. */
export const TimelineItem = Schema.Union([
  Schema.Struct({
    activity: ThreadActivity.MessagePublished,
    message: ThreadMessage.Record,
  }),
  Schema.Struct({
    activity: Schema.Union([
      ThreadActivity.ParticipationFollowed,
      ThreadActivity.ParticipationEnded,
    ]),
    participant: ThreadParticipation.Summary,
  }),
]);
export type TimelineItem = typeof TimelineItem.Type;
export * as Thread from "./thread.ts";
