/**
 * The groups the person can see in a workspace, as a list to pick one from: the teams by name, and
 * their conversations by the other members in them. It reports the group the person picks.
 */

import { Group, GroupId } from "@amends-dev/core/group"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"

/** A group the person can see, and whether it is still being created. */
export const GroupItem = Schema.Struct({ group: Group.Group, pending: Schema.Boolean })
export type GroupItem = typeof GroupItem.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groups: Schema.Array(GroupItem),
  members: Schema.Array(Member.Member),
  selected: Schema.Option(GroupId.GroupId),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedGroups: { groups: Schema.Array(GroupItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  FailedRead: { error: Schema.String },
  ClickedGroup: { groupId: GroupId.GroupId }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  SelectedGroup: { groupId: GroupId.GroupId }
})
export type OutMessage = typeof OutMessage.Type

export const GroupsDefinition = Block.makeDefinition("Groups", { Model, Message, OutMessage })

/** A group's name: a team's own, or a direct group's other members, by their names, or their IDs until names are read. */
export const nameOf = (group: Group.Group, members: ReadonlyArray<Member.Member>, self: MemberId.MemberId): string =>
  "name" in group
    ? group.name
    : group.memberIds
        .filter((id) => id !== self)
        .map((id) => members.find((member) => member.id === id)?.name ?? id)
        .join(", ")
