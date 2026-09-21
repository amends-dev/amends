import { Schema } from "effect";
import { GroupId } from "../id.ts";
import { MemberId } from "../../workspace/member/id.ts";
import { WorkspaceId } from "../../workspace/id.ts";

/** Identifies one admission; a later readmission uses a fresh ID. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("GroupMembershipId"));
export type Id = typeof Id.Type;
export const Status = Schema.Literals(["active", "removed"]);
export type Status = typeof Status.Type;

export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  memberId: MemberId.Id,
  admittedAt: Schema.DateTimeUtcFromString,
  status: Status,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** Add an active workspace member to an existing group in the bound workspace. */
export const AddInput = Schema.Struct({
  groupId: GroupId.Id,
  memberId: MemberId.Id,
});
export interface AddInput extends Schema.Schema.Type<typeof AddInput> {}

export * as GroupMembership from "./membership.ts";
