/**
 * A group is a lasting space for threads within a workspace, and the audience of every thread in
 * it. This module holds its record, team or direct, the views lists show of it, and the inputs of
 * the operations that create and rename one; `GroupService` is those operations. Admissions and
 * follows hang off the group by its ID, in `GroupMembership` and `GroupFollow`.
 *
 * @since 0.1.0
 */

import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as Audience from "../journal/Audience.ts"
import * as Text from "../text/Text.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as GroupId from "./GroupId.ts"

/**
 * A team group's name as recorded; names chosen now are `NewName`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type

/**
 * A name chosen for a team group: 1 to 80 characters, without hidden ones.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName)

/**
 * Who can find a team group: only its members see a private one, while anyone in the workspace
 * may find and join a public one. Either way, only members read its threads.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Visibility = Schema.Literals(["Private", "Public"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Visibility = typeof Visibility.Type

/**
 * A team group's membership is managed; its name identifies it to people.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Team = Schema.Struct({
  id: GroupId.GroupId,
  workspaceId: WorkspaceId.WorkspaceId,
  kind: Schema.Literal("Team"),
  visibility: Visibility,
  name: Name,
  createdBy: MemberId.MemberId,
  createdAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Team extends Schema.Schema.Type<typeof Team> {}

/**
 * Every workspace has one general group, a public team group created with the workspace under
 * this ID, so finding it needs no lookup. Every member, person or agent, joins it as they join the
 * workspace, in the same commit, and stays in it until they leave the workspace: nobody leaves it
 * or is removed from it. It may be renamed.
 *
 * @category utils
 * @since 0.1.0
 */
export const GeneralId = GroupId.GroupId.make("general")

/**
 * The general group's name when a workspace is created.
 *
 * @category utils
 * @since 0.1.0
 */
export const generalName: Name = "general"

/**
 * Whether a group is its workspace's general group.
 *
 * @category utils
 * @since 0.1.0
 */
export const isGeneral = (group: { readonly id: string }) => group.id === GeneralId

/** Canonical member order for a direct group; its key depends on nothing else. */
const ascending = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

/**
 * A direct group's fixed members: two or more, in strictly ascending ID order.
 *
 * @category schemas
 * @since 0.1.0
 */
export const DirectMembers = Schema.Array(MemberId.MemberId).check(
  Schema.makeFilter(
    (ids) =>
      (ids.length >= 2 && ids.every((id, index) => index === 0 || ascending(ids[index - 1]!, id) < 0)) ||
      "Direct-group members must be at least two distinct IDs in ascending order"
  )
)

/**
 * A direct group's members never change; the same member set always resolves to one group.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Direct = Schema.Struct({
  id: GroupId.GroupId,
  workspaceId: WorkspaceId.WorkspaceId,
  kind: Schema.Literal("Direct"),
  memberIds: DirectMembers,
  createdBy: MemberId.MemberId,
  createdAt: Schema.DateTimeUtcFromString
}).check(
  Schema.makeFilter(
    (record) => record.memberIds.includes(record.createdBy) || "A direct group's creator must be one of its members"
  )
)

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Direct extends Schema.Schema.Type<typeof Direct> {}

/**
 * A group: a team, whose membership is managed, or a direct group, whose members are fixed. What
 * `GroupFacts.Created` records and `GroupStore` keeps.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Group = Schema.Union([Team, Direct])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Group = typeof Group.Type

/**
 * Order a direct group's requested members canonically, removing repeats.
 *
 * @category utils
 * @since 0.1.0
 */
export const directMembers = <Id extends string>(memberIds: ReadonlyArray<Id>): ReadonlyArray<Id> =>
  [...new Set(memberIds)].sort(ascending)

/**
 * Storage key for a direct group's member set. Member IDs change on readmission, so do keys.
 *
 * @category utils
 * @since 0.1.0
 */
export const directKey = (memberIds: ReadonlyArray<string>): string => JSON.stringify(directMembers(memberIds))

/**
 * When any of a group's threads last had content activity. What `GroupProjection` advances and
 * `GroupStore.getLatest` reads, by which a reader's groups are shown as unread.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Latest = Schema.Struct({
  groupId: GroupId.GroupId,
  occurredAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Latest extends Schema.Schema.Type<typeof Latest> {}

/**
 * One page of groups in group-ID order: at most `limit`, after the exclusive `after` cursor, or
 * the first without one. What `listMine` and `listPublic` take.
 *
 * @category options
 * @since 0.1.0
 */
export const ListOptions = Schema.Struct({
  after: Schema.optionalKey(GroupId.GroupId),
  limit: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category options
 * @since 0.1.0
 */
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}

/**
 * One of the reader's groups with its activity: a sidebar row. `newActivity` holds when its
 * latest message came after the reader last read it or, if they never have, after they
 * joined. `pending` counts the reader's pending notifications from the group's threads: the
 * activity addressed to them, as opposed to activity they merely have not seen.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ListItem = Schema.Struct({
  group: Group,
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
  renamable: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ListItem extends Schema.Schema.Type<typeof ListItem> {}

/**
 * What a reader's grants on a group let them do to it, as one grant resolution answers them.
 *
 * @category models
 * @since 0.1.0
 */
export interface Grants {
  readonly manage: boolean
  readonly rename: boolean
  readonly moderate: boolean
}

/**
 * A group's activity as it stands to one reader: what `listItem` folds into a row.
 *
 * @category models
 * @since 0.1.0
 */
export interface Activity {
  readonly latestActivityAt: DateTime.Utc | null
  readonly readAt: DateTime.Utc | null
  readonly following: boolean
  readonly pending: number
}

/**
 * Whether a group whose latest message was at `latestActivityAt` has activity new to a reader who
 * last read it at `readAt`, or, never having read it, was admitted at `admittedAt`.
 *
 * @category utils
 * @since 0.1.0
 */
export const hasNewActivity = (
  latestActivityAt: DateTime.Utc | null,
  readAt: DateTime.Utc | null,
  admittedAt: DateTime.Utc
): boolean => latestActivityAt !== null && DateTime.isGreaterThan(latestActivityAt, readAt ?? admittedAt)

/**
 * `group` as a reader admitted at `admittedAt` lists it, with its `activity` as it stands to them
 * and what their `grants` let them do: a direct group keeps the members it started with and is
 * named by them, so none of it; any member tidies a private group, while removing people from a
 * public one is moderation.
 *
 * @category utils
 * @since 0.1.0
 */
export const listItem = (group: Group, admittedAt: DateTime.Utc, activity: Activity, grants: Grants): ListItem => {
  const team = group.kind === "Team"
  return {
    group,
    latestActivityAt: activity.latestActivityAt,
    readAt: activity.readAt,
    newActivity: hasNewActivity(activity.latestActivityAt, activity.readAt, admittedAt),
    following: activity.following,
    pending: activity.pending,
    manageable: team && grants.manage,
    membersRemovable: team && grants.manage && (group.visibility === "Private" || grants.moderate),
    renamable: team && grants.rename
  }
}

/**
 * A team group's new name, and the name the renamer last saw, so a rename made meanwhile is not
 * silently replaced.
 *
 * @category options
 * @since 0.1.0
 */
export const RenameInput = Schema.Struct({ groupId: GroupId.GroupId, name: NewName, expectedName: Name })

/**
 * @category options
 * @since 0.1.0
 */
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

/**
 * What renaming a team group records: its new name. The payload of `GroupFacts.Renamed`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Renamed = Schema.Struct({ workspaceId: WorkspaceId.WorkspaceId, groupId: GroupId.GroupId, name: Name })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Renamed extends Schema.Schema.Type<typeof Renamed> {}

/**
 * A new team group, private unless it says otherwise, with its first members: its creator is
 * admitted only when listed, and the list may be empty.
 *
 * @category options
 * @since 0.1.0
 */
export const CreateTeamInput = Schema.Struct({
  name: NewName,
  memberIds: Schema.UniqueArray(MemberId.MemberId),
  visibility: Schema.optionalKey(Visibility)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateTeamInput extends Schema.Schema.Type<typeof CreateTeamInput> {}

/**
 * A public group as someone browsing the workspace sees it: how many belong to it, and whether
 * the reader is one of them.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PublicItem = Schema.Struct({
  group: Team,
  members: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  joined: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface PublicItem extends Schema.Schema.Type<typeof PublicItem> {}

/**
 * How many members one of several groups has, and whether one member is among them: what
 * `GroupMembershipStore.summarize` answers for each group that has any.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Summary = Schema.Struct({
  groupId: GroupId.GroupId,
  members: Schema.Int.check(Schema.isGreaterThan(0)),
  joined: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Summary extends Schema.Schema.Type<typeof Summary> {}

/**
 * The readers of one group: its current members. The audience the facts about a group and its
 * threads are published to.
 *
 * @category utils
 * @since 0.1.0
 */
export const audienceOf = (groupId: GroupId.GroupId): Audience.Scope => Audience.make("group", groupId)
