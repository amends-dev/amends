/**
 * A group as the person has it open: its name, their part in it, its threads, and the thread open
 * among them, and its settings in a modal: a team's name and members, and the person's membership.
 * They follow a group or stop, rename a team, join a public team or leave one, and, where they manage
 * its members, admit and remove them. It reports when its thread opens and when the person closes it, and
 * closes the thread when its parent asks.
 */

import { Grant } from "@amends-dev/core/authorization"
import { Group, GroupFollow, GroupId, GroupMembership, GroupPermissions } from "@amends-dev/core/group"
import { Presence } from "@amends-dev/core/presence"
import { ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { groupTarget, may } from "../../permissions.ts"
import { ThreadBlock } from "../thread/block.ts"
import { ThreadsBlock } from "../threads/block.ts"

/** The group, and whether it is still being created. */
export const GroupItem = Schema.Struct({ group: Group.Group, pending: Schema.Boolean })
export type GroupItem = typeof GroupItem.Type

/** An admission to the group, and whether a change to it is on its way. */
export const MembershipItem = Schema.Struct({ membership: GroupMembership.GroupMembership, pending: Schema.Boolean })
export type MembershipItem = typeof MembershipItem.Type

/** The person's follow of the group, and whether a change to it is on its way. */
export const FollowItem = Schema.Struct({ follow: GroupFollow.GroupFollow, pending: Schema.Boolean })
export type FollowItem = typeof FollowItem.Type

/** The thread open in the group. */
export const OpenThread = Schema.Struct({ threadId: ThreadId.ThreadId, model: ThreadBlock.Model })
export type OpenThread = typeof OpenThread.Type

/** The sections of the group's settings. */
export const SettingsTab = Schema.Literals(["General", "Members"])
export type SettingsTab = typeof SettingsTab.Type

/**
 * The group, while the replica holds it, its admissions, the person's follow of it, the workspace's
 * members, what the person may do, who is present, the name being given the team, the member
 * chosen to admit, the group's threads, the thread open among them, the settings' dialog and the
 * section of it shown, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId,
  group: Schema.Option(GroupItem),
  memberships: Schema.Array(MembershipItem),
  follow: Schema.Option(FollowItem),
  members: Schema.Array(Member.Member),
  grants: Schema.Array(Grant.Grant),
  present: Schema.Array(Presence.Present),
  renaming: Schema.Option(Schema.String),
  admitting: Schema.Option(MemberId.MemberId),
  threads: ThreadsBlock.Model,
  thread: Schema.Option(OpenThread),
  dialog: DialogBlock.Model,
  settingsTab: SettingsTab,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

/** What the threads are made from: the group, as the member. */
export const ChildInitContext = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId
})

export const Message = defineMessageUnion({
  ReceivedGroup: {
    group: Schema.Option(GroupItem),
    memberships: Schema.Array(MembershipItem),
    follow: Schema.Option(FollowItem)
  },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  ReceivedPresence: { present: Schema.Array(Presence.Present) },
  FailedRead: { error: Schema.String },
  ClickedSettings: {},
  ClickedMembers: {},
  ChoseSettingsTab: { tab: SettingsTab },
  TypedName: { name: Schema.String },
  SubmittedRename: {},
  ClickedFollow: {},
  ClickedUnfollow: {},
  ClickedJoin: {},
  ClickedLeave: {},
  ChoseMemberToAdmit: { memberId: Schema.Option(MemberId.MemberId) },
  SubmittedAdmit: {},
  ClickedRemoveMember: { membershipId: GroupMembership.GroupMembershipId },
  ClickedAllThreads: {},
  RequestedCloseThread: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedThread: {},
  ClosedThread: {}
})
export type OutMessage = typeof OutMessage.Type

export const GroupDefinition = Block.makeDefinition("Group", { Model, Message, OutMessage, ChildInitContext })

/** The admissions in force. */
export const admitted = (model: Model): ReadonlyArray<MembershipItem> =>
  model.memberships.filter(({ membership }) => membership.status === "active")

/** The members of the group: a team's admitted ones, and a conversation's own. */
export const membersOf = (model: Model): ReadonlyArray<MemberId.MemberId> =>
  Option.match(model.group, {
    onNone: () => [],
    onSome: ({ group }) =>
      group.kind === "Team" ? admitted(model).map(({ membership }) => membership.memberId) : group.memberIds
  })

/** The person's own admission in force, if they have one. */
export const ownAdmission = (model: Model): Option.Option<MembershipItem> =>
  Option.fromUndefinedOr(admitted(model).find(({ membership }) => membership.memberId === model.memberId))

/** Whether the person belongs to the group: a conversation of theirs, or a team they are admitted to. */
export const belongs = (model: Model): boolean =>
  Option.match(model.group, {
    onNone: () => false,
    onSome: ({ group }) =>
      group.kind === "Team" ? Option.isSome(ownAdmission(model)) : group.memberIds.includes(model.memberId)
  })

/** The team's name, while the group is a team. */
export const teamName = (model: Model): Option.Option<string> =>
  Option.flatMap(model.group, ({ group }) => (group.kind === "Team" ? Option.some(group.name) : Option.none()))

/** Whether the person may rename the group: a team they belong to, where they are granted to. */
export const mayRename = (model: Model): boolean =>
  Option.isSome(teamName(model)) &&
  belongs(model) &&
  may(model.grants, GroupPermissions.Rename, groupTarget(model.workspaceId, model.groupId))
