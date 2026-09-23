import { Schema } from "effect";
import { GroupId } from "../group/id.ts";
import { ThreadId } from "../thread/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";

/** How far a human member has read a thread, by timeline sequence. Private to that member. */
export const ThreadPosition = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  memberId: MemberId.Id,
  threadId: ThreadId.Id,
  readThrough: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ThreadPosition extends Schema.Schema.Type<typeof ThreadPosition> {}

/** When a human member last caught up with a group's threads. Private to that member. */
export const GroupCaughtUp = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  memberId: MemberId.Id,
  groupId: GroupId.Id,
  caughtUpAt: Schema.DateTimeUtcFromString,
});
export interface GroupCaughtUp extends Schema.Schema.Type<typeof GroupCaughtUp> {}

export const MarkThreadReadInput = Schema.Struct({
  threadId: ThreadId.Id,
  throughSequence: ThreadPosition.fields.readThrough,
});
export interface MarkThreadReadInput extends Schema.Schema.Type<typeof MarkThreadReadInput> {}

export const MarkGroupReadInput = Schema.Struct({ groupId: GroupId.Id });
export interface MarkGroupReadInput extends Schema.Schema.Type<typeof MarkGroupReadInput> {}

export * as ReadState from "./read-state.ts";
