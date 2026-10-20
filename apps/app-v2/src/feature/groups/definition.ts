/**
 * The groups the person can see in a workspace, as a list to pick one from: the teams they belong to, general first
 * and then by name, and their conversations by the other members in them; as a page to browse, the teams they belong
 * to and the public teams they may join, on a tab each, narrowed by a search; and the modal where they start a team,
 * or a conversation with another member. It reports the group the person picks and when they ask to browse, and its
 * parent tells it which group is open and when to talk with a member: the conversation of the two when there is one,
 * and otherwise a new one to write the first message of.
 */

import { Grant } from "@amends-dev/core/authorization"
import { Group, GroupId, GroupMembership } from "@amends-dev/core/group"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Array from "effect/Array"
import type * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { foldAccents, groupName, isJoinable } from "../../seen.ts"

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
 * Whether the groups are read, the groups, the workspace's members, the person's own admissions, what they may do,
 * the group picked, the browse page's tab and search, what they are starting and the dialog it is in, and why the
 * last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  isLoaded: Schema.Boolean,
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
  ReceivedGroups: {
    groups: Schema.Array(GroupItem),
    members: Schema.Array(Member.Member),
    memberships: Schema.Array(GroupMembership.GroupMembership),
    grants: Schema.Array(Grant.Grant)
  },
  FailedRead: { error: Schema.String },
  ClickedGroup: { groupId: GroupId.GroupId },
  InformedOfOpenGroup: { groupId: Schema.Option(GroupId.GroupId) },
  ClickedGroupsTitle: {},
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
  RequestedConversationWith: { memberId: MemberId.MemberId },
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

/** General first, then by name as the person reads it, in any case and whatever the accents, then by ID. */
export const byGeneralThenName = (model: Pick<Model, "members" | "memberId">): Order.Order<GroupItem> =>
  Order.combineAll([
    Order.mapInput(Order.Boolean, ({ group }: GroupItem) => !Group.isGeneral(group)),
    Order.mapInput(Order.String, ({ group }: GroupItem) =>
      foldAccents(groupName(group, model.members, model.memberId))
    ),
    Order.mapInput(Order.String, ({ group }: GroupItem) => group.id)
  ])

/** The groups the person belongs to, as the sidebar lists them: their teams and their conversations, in order. */
export const yours = (model: Model): ReadonlyArray<GroupItem> =>
  Array.sort(
    model.groups.filter(({ group }) => belongsTo(model, group)),
    byGeneralThenName(model)
  )

/** The public teams the person may join and does not belong to, in order. */
export const discoverable = (model: Model): ReadonlyArray<GroupItem> =>
  Array.sort(
    model.groups.filter(({ group }) => isJoinable(group) && !belongsTo(model, group)),
    byGeneralThenName(model)
  )

/** The groups of `items` whose name, as the person reads it, contains `query` in any case: all of them for none. */
export const matching = (model: Model, items: ReadonlyArray<GroupItem>, query: string): ReadonlyArray<GroupItem> => {
  const wanted = query.trim().toLowerCase()
  return wanted === ""
    ? items
    : items.filter(({ group }) => groupName(group, model.members, model.memberId).toLowerCase().includes(wanted))
}

/** The conversation of the person and `memberId` alone, when there is one. */
export const conversationWith = (model: Model, memberId: MemberId.MemberId): Option.Option<GroupItem> =>
  Array.findFirst(
    model.groups,
    ({ group }) =>
      group.kind !== "Team" &&
      group.memberIds.length === 2 &&
      group.memberIds.includes(model.memberId) &&
      group.memberIds.includes(memberId)
  )

/** The workspace's other active members, whom the person may start a conversation with. */
export const others = (model: Model): ReadonlyArray<Member.Member> =>
  model.members.filter((member) => member.id !== model.memberId && member.status === "active")
