import { Schema } from "effect";
import { MemberId } from "../workspace/member/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { GroupId } from "./id.ts";

export const Id = GroupId.Id;
export type Id = GroupId.Id;
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;

/** A team group's membership is managed; its name identifies it to people. */
export const TeamRecord = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  kind: Schema.Literal("Team"),
  visibility: Schema.Literal("Private"),
  name: Name,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface TeamRecord extends Schema.Schema.Type<typeof TeamRecord> {}

/** Canonical member order for a direct group; its key depends on nothing else. */
const ascending = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

/** A direct group's fixed members: two or more, in strictly ascending ID order. */
export const DirectMembers = Schema.Array(MemberId.Id).check(
  Schema.makeFilter(
    (ids) =>
      (ids.length >= 2 &&
        ids.every((id, index) => index === 0 || ascending(ids[index - 1]!, id) < 0)) ||
      "Direct-group members must be at least two distinct IDs in ascending order",
  ),
);

/** A direct group's members never change; the same member set always resolves to one group. */
export const DirectRecord = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  kind: Schema.Literal("Direct"),
  memberIds: DirectMembers,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
}).check(
  Schema.makeFilter(
    (record) =>
      record.memberIds.includes(record.createdBy) ||
      "A direct group's creator must be one of its members",
  ),
);
export interface DirectRecord extends Schema.Schema.Type<typeof DirectRecord> {}

export const Record = Schema.Union([TeamRecord, DirectRecord]);
export type Record = typeof Record.Type;

/** Order a direct group's requested members canonically, removing repeats. */
export const directMembers = <Id extends string>(memberIds: ReadonlyArray<Id>): ReadonlyArray<Id> =>
  [...new Set(memberIds)].sort(ascending);

/** Storage key for a direct group's member set. Member IDs change on readmission, so do keys. */
export const directKey = (memberIds: ReadonlyArray<string>): string =>
  JSON.stringify(directMembers(memberIds));

/** The creator is admitted only when explicitly included. Empty groups are allowed. */
/** When any of a group's threads last had content activity. */
export const Latest = Schema.Struct({
  groupId: GroupId.Id,
  occurredAt: Schema.DateTimeUtcFromString,
});
export interface Latest extends Schema.Schema.Type<typeof Latest> {}

export const CreatePrivateTeamInput = Schema.Struct({
  name: Name,
  memberIds: Schema.UniqueArray(MemberId.Id),
});
export interface CreatePrivateTeamInput extends Schema.Schema.Type<typeof CreatePrivateTeamInput> {}

export * as Group from "./group.ts";
