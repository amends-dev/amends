import { DateTime, Schema } from "effect";
import * as Audience from "../journal/audience.ts";
import * as MemberId from "../workspace/member/id.ts";
import * as WorkspaceId from "../workspace/id.ts";
import * as Text from "../text/text.ts";
import * as GroupId from "./id.ts";

export const Id = GroupId.Id;

export type Id = GroupId.Id;

/** A team group's name as recorded; names chosen now are `NewName`. */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));

export type Name = typeof Name.Type;

/** A name chosen for a team group: 1 to 80 characters, without hidden ones. */
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName);

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
 * latest message came after the reader last read it or, if they never have, after they
 * joined. `pending` counts the reader's pending notifications from the group's threads: the
 * activity addressed to them, as opposed to activity they merely have not seen.
 */
export const ListItem = Schema.Struct({
  group: Record,
  latestActivityAt: Schema.NullOr(Latest.fields.occurredAt),
  readAt: Schema.NullOr(Latest.fields.occurredAt),
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

/** What a reader's grants on a group let them do to it, as one grant resolution answers them. */
export interface Grants {
  readonly manage: boolean;
  readonly rename: boolean;
  readonly moderate: boolean;
}

/** A group's activity as it stands to one reader. */
export interface Activity {
  readonly latestActivityAt: DateTime.Utc | null;
  readonly readAt: DateTime.Utc | null;
  readonly following: boolean;
  readonly pending: number;
}

/**
 * Whether a group whose latest message was at `latestActivityAt` has activity new to a reader who
 * last read it at `readAt`, or, never having read it, was admitted at `admittedAt`.
 */
export const hasNewActivity = (
  latestActivityAt: DateTime.Utc | null,
  readAt: DateTime.Utc | null,
  admittedAt: DateTime.Utc,
): boolean =>
  latestActivityAt !== null && DateTime.isGreaterThan(latestActivityAt, readAt ?? admittedAt);

/**
 * `group` as a reader admitted at `admittedAt` lists it, with its `activity` as it stands to them
 * and what their `grants` let them do: a direct group keeps the members it started with and is
 * named by them, so none of it; any member tidies a private group, while removing people from a
 * public one is moderation.
 */
export const listItem = (
  group: Record,
  admittedAt: DateTime.Utc,
  activity: Activity,
  grants: Grants,
): ListItem => {
  const team = group.kind === "Team";
  return {
    group,
    latestActivityAt: activity.latestActivityAt,
    readAt: activity.readAt,
    newActivity: hasNewActivity(activity.latestActivityAt, activity.readAt, admittedAt),
    following: activity.following,
    pending: activity.pending,
    manageable: team && grants.manage,
    membersRemovable: team && grants.manage && (group.visibility === "Private" || grants.moderate),
    renamable: team && grants.rename,
  };
};

/**
 * A team group's new name, and the name the renamer last saw, so a rename made meanwhile is not
 * silently replaced.
 */
export const RenameInput = Schema.Struct({ groupId: Id, name: NewName, expectedName: Name });

export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/** What renaming a team group records. */
export const Renamed = Schema.Struct({ workspaceId: WorkspaceId.Id, groupId: Id, name: Name });

export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}

/**
 * A new team group, private unless it says otherwise, with its first members: its creator is
 * admitted only when listed, and the list may be empty.
 */
export const CreateTeamInput = Schema.Struct({
  name: NewName,
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
