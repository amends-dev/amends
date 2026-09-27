import { Schema } from "effect";
import { Audience } from "../journal/audience.ts";
import { MemberId } from "../workspace/member/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { GroupId } from "./id.ts";

export const Id = GroupId.Id;
export type Id = GroupId.Id;
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;

/**
 * Who can find a team group: only its members see a private one, while anyone in the workspace
 * may find and join a public one. Either way, only members read its threads.
 */
export const Visibility = Schema.Literals(["Private", "Public"]);
export type Visibility = typeof Visibility.Type;

/** A team group's membership is managed; its name identifies it to people. */
export const TeamRecord = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  kind: Schema.Literal("Team"),
  visibility: Visibility,
  name: Name,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface TeamRecord extends Schema.Schema.Type<typeof TeamRecord> {}

/**
 * Every workspace has one general group, a public team group created with the workspace under
 * this ID, so finding it needs no lookup. Every member, person or agent, joins it as they join the
 * workspace, in the same commit, and stays in it until they leave the workspace: nobody leaves it
 * or is removed from it. It may be renamed.
 */
export const GeneralId = Id.make("general");
/** The general group's name when a workspace is created. */
export const generalName: Name = "general";
/** Whether a group is its workspace's general group. */
export const isGeneral = (group: { readonly id: string }) => group.id === GeneralId;

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

/** A page of the reader's groups in group-ID order, after the exclusive cursor. */
export const ListOptions = Schema.Struct({
  after: Schema.optionalKey(GroupId.Id),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}

/**
 * One of the reader's groups with its activity: a sidebar row. `newActivity` holds when its
 * latest message came after the reader last caught up with it or, if they never have, after they
 * joined. `pending` counts the reader's pending notifications from the group's threads: the
 * activity addressed to them, as opposed to activity they merely have not seen.
 */
export const ListItem = Schema.Struct({
  group: Record,
  latestActivityAt: Schema.NullOr(Latest.fields.occurredAt),
  caughtUpAt: Schema.NullOr(Latest.fields.occurredAt),
  newActivity: Schema.Boolean,
  following: Schema.Boolean,
  pending: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** The reader may add people to the group: a team group they may manage. */
  manageable: Schema.Boolean,
  /**
   * The reader may remove others from the group: any member of a private group they may manage,
   * and moderators of a public one.
   */
  membersRemovable: Schema.Boolean,
  /** The reader may rename the group: a team group whose name they may change. */
  renamable: Schema.Boolean,
});
export interface ListItem extends Schema.Schema.Type<typeof ListItem> {}

/**
 * A team group's new name, and the name the renamer last saw, so a rename made meanwhile is not
 * silently replaced.
 */
export const RenameInput = Schema.Struct({ groupId: Id, name: Name, expectedName: Name });
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}
/** What renaming a team group records. */
export const Renamed = Schema.Struct({ workspaceId: WorkspaceId.Id, groupId: Id, name: Name });
export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}

/** A new team group, private unless it says otherwise. */
export const CreateTeamInput = Schema.Struct({
  name: Name,
  memberIds: Schema.UniqueArray(MemberId.Id),
  visibility: Schema.optionalKey(Visibility),
});
export interface CreateTeamInput extends Schema.Schema.Type<typeof CreateTeamInput> {}

/**
 * A public group as someone browsing the workspace sees it: how many belong to it, and whether
 * the reader is one of them.
 */
export const PublicItem = Schema.Struct({
  group: TeamRecord,
  members: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  joined: Schema.Boolean,
});
export interface PublicItem extends Schema.Schema.Type<typeof PublicItem> {}
/** How many members each of several groups has, and whether one member is among them. */
export const Summary = Schema.Struct({
  groupId: Id,
  members: Schema.Int.check(Schema.isGreaterThan(0)),
  joined: Schema.Boolean,
});
export interface Summary extends Schema.Schema.Type<typeof Summary> {}

/** The readers of one group: its current members. */
export const audienceOf = (groupId: Id): Audience.Scope => Audience.make("group", groupId);

export * as Group from "./group.ts";
