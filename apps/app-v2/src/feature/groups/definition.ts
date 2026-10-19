/**
 * The groups the person can see in a workspace, as a list to pick one from: the teams they belong
 * to by name and their conversations by the other members in them, then the public teams they may
 * join; as a page to browse, the groups they belong to and the public teams they may join, on a tab
 * each, narrowed by a search; and the modal where they start a team, or a conversation with another
 * member. It reports the group the person picks and when they ask to browse, and its parent tells it
 * which group is open.
 */

import { Grant } from "@amends-dev/core/authorization"
import { Group, GroupId, GroupMembership } from "@amends-dev/core/group"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { groupName, isJoinable } from "../../seen.ts"

/** A group the person can see, whether it is still being created, and how many members it has. */
export const GroupItem = Schema.Struct({ group: Group.Group, pending: Schema.Boolean, members: Schema.Int })
export type GroupItem = typeof GroupItem.Type

/** What the person is starting: a team, by name, or a conversation with another member. */
export const Starting = defineTaggedUnion({
  Team: { name: Schema.String, isPublic: Schema.Boolean },
  Conversation: { memberId: Schema.Option(MemberId.MemberId), text: Schema.String }
})
export type Starting = typeof Starting.Type

/** Which groups the browse page lists: those the person belongs to, or the public teams they may join. */
export const BrowseTab = Schema.Literals(["Yours", "Discover"])
export type BrowseTab = typeof BrowseTab.Type

/**
 * The groups, the workspace's members, the person's own admissions, what they may do, the group
 * picked, the browse page's tab and search, what they are starting and the dialog it is in, and why
 * the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groups: Schema.Array(GroupItem),
  members: Schema.Array(Member.Member),
  memberships: Schema.Array(GroupMembership.GroupMembership),
  grants: Schema.Array(Grant.Grant),
  selected: Schema.Option(GroupId.GroupId),
  browse: Schema.Struct({ tab: BrowseTab, query: Schema.String }),
  starting: Schema.Option(Starting),
  dialog: DialogBlock.Model,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedGroups: { groups: Schema.Array(GroupItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedMemberships: { memberships: Schema.Array(GroupMembership.GroupMembership) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  FailedRead: { error: Schema.String },
  ClickedGroup: { groupId: GroupId.GroupId },
  InformedOfOpenGroup: { groupId: Schema.Option(GroupId.GroupId) },
  ClickedBrowse: {},
  ChoseBrowseTab: { tab: BrowseTab },
  TypedBrowseQuery: { query: Schema.String },
  ClickedNewTeam: {},
  TypedTeamName: { name: Schema.String },
  ToggledTeamPublic: { isPublic: Schema.Boolean },
  SubmittedTeam: {},
  ClickedNewConversation: {},
  ChoseConversationMember: { memberId: Schema.Option(MemberId.MemberId) },
  TypedConversationText: { text: Schema.String },
  SubmittedConversation: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SelectedGroup: { groupId: GroupId.GroupId },
  RequestedBrowse: {}
})
export type OutMessage = typeof OutMessage.Type

export const GroupsDefinition = Block.makeDefinition("Groups", { Model, Message, OutMessage })

/** Whether the person belongs to `group`: a conversation of theirs, or a team they hold an admission to. */
export const belongsTo = (model: Model, group: Group.Group): boolean =>
  group.kind === "Team"
    ? model.memberships.some((membership) => membership.groupId === group.id)
    : group.memberIds.includes(model.memberId)

/** The groups the person belongs to, as the sidebar lists them: their teams and their conversations. */
export const yours = (model: Model): ReadonlyArray<GroupItem> =>
  model.groups.filter(({ group }) => belongsTo(model, group))

/** The public teams the person may join and does not belong to. */
export const discoverable = (model: Model): ReadonlyArray<GroupItem> =>
  model.groups.filter(({ group }) => isJoinable(group) && !belongsTo(model, group))

/** The groups of `items` whose name, as the person reads it, contains `query` in any case: all of them for none. */
export const matching = (model: Model, items: ReadonlyArray<GroupItem>, query: string): ReadonlyArray<GroupItem> => {
  const wanted = query.trim().toLowerCase()
  return wanted === ""
    ? items
    : items.filter(({ group }) => groupName(group, model.members, model.memberId).toLowerCase().includes(wanted))
}

/** The workspace's other active members, whom the person may start a conversation with. */
export const others = (model: Model): ReadonlyArray<Member.Member> =>
  model.members.filter((member) => member.id !== model.memberId && member.status === "active")
