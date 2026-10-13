/**
 * A group membership is one member's admission to one group: who may read its threads. It begins
 * when a team group is created with them, a member adds them, they join a public group, a direct
 * group is established with them, or they join the workspace and so its general group. It ends
 * when they leave, are removed, or are removed from the workspace. This module holds its record
 * and the inputs of the operations on it; `GroupMembershipService` is those operations. A thread
 * participation and a follow each name the admission they are held through, and end with it.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as GroupId from "./GroupId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * Identifies one admission; a later readmission uses a fresh ID.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("GroupMembershipId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;

/**
 * Whether the admission is current or has ended.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["active", "removed"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type;

/**
 * One member's admission to one group, from when they were admitted until it ended, if it has.
 * What `GroupMembershipFacts.Added` records and `GroupMembershipStore` keeps.
 *
 * @category schemas
 * @since 0.1.0
 */
export const GroupMembership = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  memberId: MemberId.Id,
  admittedAt: Schema.DateTimeUtcFromString,
  status: Status,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface GroupMembership extends Schema.Schema.Type<typeof GroupMembership> {}

/**
 * A page of a group's current admissions in admission-ID order, after the exclusive cursor.
 *
 * @category options
 * @since 0.1.0
 */
export const ListOptions = Schema.Struct({
  after: Schema.optionalKey(Id),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}

/**
 * A page of a member's active admissions in group-ID order, after the exclusive group cursor.
 *
 * @category options
 * @since 0.1.0
 */
export const ByMemberOptions = Schema.Struct({
  afterGroupId: Schema.optionalKey(GroupId.Id),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface ByMemberOptions extends Schema.Schema.Type<typeof ByMemberOptions> {}

/**
 * Add an active workspace member to an existing group in the bound workspace.
 *
 * @category options
 * @since 0.1.0
 */
export const AddInput = Schema.Struct({
  groupId: GroupId.Id,
  memberId: MemberId.Id,
});

/**
 * @category options
 * @since 0.1.0
 */
export interface AddInput extends Schema.Schema.Type<typeof AddInput> {}

/**
 * The admission to end, in the group named: one admission, never whichever is currently active.
 *
 * @category options
 * @since 0.1.0
 */
export const RemoveInput = Schema.Struct({
  groupId: GroupId.Id,
  membershipId: Id,
});

/**
 * @category options
 * @since 0.1.0
 */
export interface RemoveInput extends Schema.Schema.Type<typeof RemoveInput> {}

/**
 * The admission to leave: the actor's own, in the group named; the same shape as `RemoveInput`.
 *
 * @category options
 * @since 0.1.0
 */
export const LeaveInput = RemoveInput;

/**
 * @category options
 * @since 0.1.0
 */
export interface LeaveInput extends Schema.Schema.Type<typeof LeaveInput> {}

/**
 * The ending of one admission, with the reason: removed by a member, left, or the member's removal
 * from the workspace. What `GroupMembershipFacts.Removed` records; the journal envelope records who
 * did it and when.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Removal = Schema.Struct({
  ...RemoveInput.fields,
  workspaceId: WorkspaceId.Id,
  memberId: MemberId.Id,
  reason: Schema.Literals(["removed", "left", "workspace-removed"]),
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Removal extends Schema.Schema.Type<typeof Removal> {}
