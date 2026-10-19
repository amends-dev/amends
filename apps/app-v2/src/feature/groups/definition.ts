/**
 * The groups the person can see in a workspace, as a list to pick one from: the teams they belong
 * to by name and their conversations by the other members in them, then the public teams they may
 * join; and where they start a team, or a conversation with another member. It reports the group
 * the person picks, and its parent tells it which group is open.
 */

import { Grant } from "@amends-dev/core/authorization"
import { Group, GroupId, GroupMembership } from "@amends-dev/core/group"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** A group the person can see, and whether it is still being created. */
export const GroupItem = Schema.Struct({ group: Group.Group, pending: Schema.Boolean })
export type GroupItem = typeof GroupItem.Type

/** What the person is starting: a team, by name, or a conversation with another member. */
export const Starting = defineTaggedUnion({
  Team: { name: Schema.String, isPublic: Schema.Boolean },
  Conversation: { memberId: Schema.Option(MemberId.MemberId), text: Schema.String }
})
export type Starting = typeof Starting.Type

/**
 * The groups, the workspace's members, the person's own admissions, what they may do, the group
 * picked, what they are starting, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groups: Schema.Array(GroupItem),
  members: Schema.Array(Member.Member),
  memberships: Schema.Array(GroupMembership.GroupMembership),
  grants: Schema.Array(Grant.Grant),
  selected: Schema.Option(GroupId.GroupId),
  starting: Schema.Option(Starting),
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
  ClickedNewTeam: {},
  TypedTeamName: { name: Schema.String },
  ToggledTeamPublic: { isPublic: Schema.Boolean },
  SubmittedTeam: {},
  ClickedNewConversation: {},
  ChoseConversationMember: { memberId: Schema.Option(MemberId.MemberId) },
  TypedConversationText: { text: Schema.String },
  SubmittedConversation: {},
  ClickedCancelStarting: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SelectedGroup: { groupId: GroupId.GroupId }
})
export type OutMessage = typeof OutMessage.Type

export const GroupsDefinition = Block.makeDefinition("Groups", { Model, Message, OutMessage })

/** Whether the person belongs to `group`: a conversation of theirs, or a team they hold an admission to. */
export const belongsTo = (model: Model, group: Group.Group): boolean =>
  group.kind === "Team"
    ? model.memberships.some((membership) => membership.groupId === group.id)
    : group.memberIds.includes(model.memberId)

/** The workspace's other active members, whom the person may start a conversation with. */
export const others = (model: Model): ReadonlyArray<Member.Member> =>
  model.members.filter((member) => member.id !== model.memberId && member.status === "active")
