import { Schema } from "effect";
import * as GroupId from "./GroupId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";

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

/** A page of a group's current admissions in admission-ID order, after the exclusive cursor. */
export const ListOptions = Schema.Struct({
  after: Schema.optionalKey(Id),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}

/** A page of a member's active admissions in group-ID order, after the exclusive group cursor. */
export const ByMemberOptions = Schema.Struct({
  afterGroupId: Schema.optionalKey(GroupId.Id),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

export interface ByMemberOptions extends Schema.Schema.Type<typeof ByMemberOptions> {}

/** Add an active workspace member to an existing group in the bound workspace. */
export const AddInput = Schema.Struct({
  groupId: GroupId.Id,
  memberId: MemberId.Id,
});

export interface AddInput extends Schema.Schema.Type<typeof AddInput> {}

/** Address one admission, never whichever admission is currently active. */
export const RemoveInput = Schema.Struct({
  groupId: GroupId.Id,
  membershipId: Id,
});

export interface RemoveInput extends Schema.Schema.Type<typeof RemoveInput> {}

export const LeaveInput = RemoveInput;

export interface LeaveInput extends Schema.Schema.Type<typeof LeaveInput> {}

/** Terminal change; the journal envelope records its performer and occurrence time. */
export const Removal = Schema.Struct({
  ...RemoveInput.fields,
  workspaceId: WorkspaceId.Id,
  memberId: MemberId.Id,
  reason: Schema.Literals(["removed", "left", "workspace-removed"]),
});

export interface Removal extends Schema.Schema.Type<typeof Removal> {}
