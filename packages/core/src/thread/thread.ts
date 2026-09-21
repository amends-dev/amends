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
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}
export const StartInGroupInput = Schema.Struct({
  groupId: GroupId.Id,
  text: ThreadMessage.Text,
  mentions: Schema.UniqueArray(MemberId.Id),
});
export interface StartInGroupInput extends Schema.Schema.Type<typeof StartInGroupInput> {}
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
