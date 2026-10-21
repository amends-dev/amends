/**
 * A group as the person has it open: its name, their part in it, its threads, and the thread open
 * among them, and its settings in a modal: a team's name, visibility, and members, and the person's membership.
 * They follow a group or stop, rename a team, join a public team or leave one, and, where they manage
 * its members, admit several at once and remove them. On a phone, where the rail with its Search is in a drawer, its
 * header has a Search button. It reports when its thread opens and when the person closes it, when they follow the
 * group or stop with a slash command, and when they ask for the search, and closes the thread when its parent asks.
 */

import { Grant } from "@amends-dev/core/authorization"
import {
  Group,
  GroupFollow,
  GroupId,
  GroupMembership,
  GroupMembershipPermissions,
  GroupPermissions
} from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Presence } from "@amends-dev/core/presence"
import { ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import { MembersComboboxBlock } from "../../memberPicker.ts"
import { groupTarget, may } from "../../permissions.ts"
import { placeName } from "../../seen.ts"
import type { OfferedSlashCommand } from "../composer/definition.ts"
import { ThreadBlock } from "../thread/block.ts"
import { ThreadsBlock } from "../threads/block.ts"

/** Whose store an action on the group is written to, and the group it acts on. */
export const inGroup = ({ workspaceId, memberId, groupId }: Model) => ({ workspaceId, memberId, groupId })

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
 * The `id` of the members picker of the Members section, which names its elements, such as the input that takes focus.
 */
export const admitMembersId = "group-admit-members"

/**
 * The group, while the replica holds it, whether it was read yet, its admissions, the person's follow of it, the
 * workspace's members, what the person may do, who is present, the name being given the team, the members chosen to
 * admit and the text typed to search for them, whether a phone has moved to its own view for adding them, the group's
 * threads, the thread open among them, the settings' dialog and the section of it shown, with the combobox that
 * chooses whom to admit, how many times the person asked to read the group again, and why the last read or write
 * failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId,
  group: Schema.Option(GroupItem),
  isLoaded: Schema.Boolean,
  memberships: Schema.Array(MembershipItem),
  follow: Schema.Option(FollowItem),
  members: Schema.Array(Member.Member),
  grants: Schema.Array(Grant.Grant),
  present: Schema.Array(Presence.Present),
  renaming: Schema.Option(Schema.String),
  admitting: Schema.Array(MemberId.MemberId),
  admitQuery: Schema.String,
  isAddViewOpen: Schema.Boolean,
  threads: ThreadsBlock.Model,
  thread: Schema.Option(OpenThread),
  dialog: DialogBlock.Model,
  membersCombobox: MembersComboboxBlock.Model,
  settingsTab: SettingsTab,
  reads: Schema.Int,
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
  ClickedTryAgain: {},
  ClickedSettings: {},
  ClickedMembers: {},
  ChoseSettingsTab: { tab: SettingsTab },
  TypedName: { name: Schema.String },
  SubmittedRename: {},
  ClickedFollow: {},
  ClickedUnfollow: {},
  ClickedJoin: {},
  ClickedLeave: {},
  ClickedSearch: {},
  ClickedAddMembers: {},
  ClickedBackToMembers: {},
  TypedAdmitQuery: { query: Schema.String },
  PickedAdmitMember: { memberId: Schema.String },
  ClickedRemoveAdmitting: { memberId: Schema.String },
  ClickedAdmit: {},
  CompletedFocusAdmitMembers: {},
  ClickedRemoveMember: { membershipId: GroupMembership.GroupMembershipId },
  ClickedAllThreads: {},
  RequestedCloseThread: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedThread: {},
  ClosedThread: {},
  OpenedAgent: { agentId: Identity.AgentId },
  OpenedProfile: { memberId: Schema.String, triggerId: Schema.String },
  FollowedGroup: { place: Schema.String },
  UnfollowedGroup: { place: Schema.String },
  RequestedSearch: {}
})
export type OutMessage = typeof OutMessage.Type

export const GroupDefinition = Block.makeDefinition("Group", { Model, Message, OutMessage, ChildInitContext })

/**
 * Whether the person's replica has the group, so that it is shown: `Loading` until the store has answered, `Failed`
 * when it could not be read, and, once it answered without the group, `Unavailable`, as it is for a group the person
 * never had or lost the right to read.
 */
export type Availability = "Available" | "Loading" | "Failed" | "Unavailable"

export const availabilityOf = (model: Model): Availability => {
  if (Option.isSome(model.group)) {
    return "Available"
  }

  if (model.isLoaded) {
    return "Unavailable"
  }

  return Option.isSome(model.notice) ? "Failed" : "Loading"
}

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

/** Whether the person follows the group. */
export const isFollowing = (model: Model): boolean =>
  Option.exists(model.follow, ({ follow }) => follow.status === "active")

/** Whether a change to the person's follow of the group is on its way. */
export const isFollowChanging = (model: Model): boolean => Option.exists(model.follow, ({ pending }) => pending)

/** Where the group is, as a line says it, such as `#general`, once the group is read. */
export const placeOf = (model: Model): Option.Option<string> =>
  Option.map(model.group, ({ group }) => placeName(group, model.members, model.memberId))

/**
 * The slash commands the composer offers, as `apps/ui` does, in a team the person belongs to: following it, or stopping
 * while they follow it, unless a change to that is on its way, and renaming it where they may.
 */
export const slashCommandsOf = (model: Model): ReadonlyArray<OfferedSlashCommand> =>
  Option.match(placeOf(model), {
    onNone: () => [],
    onSome: (place) => {
      if (Option.isNone(teamName(model)) || !belongs(model)) return []

      const following: ReadonlyArray<OfferedSlashCommand> = isFollowing(model)
        ? [{ command: "unfollow", description: `Stop following ${place}` }]
        : [{ command: "follow", description: `Follow ${place} to take part in its new threads` }]
      const renaming: ReadonlyArray<OfferedSlashCommand> = mayRename(model)
        ? [{ command: "rename", description: `Rename ${place}` }]
        : []

      return [...(isFollowChanging(model) ? [] : following), ...renaming]
    }
  })

/** Whether a change to the person's own admission is on its way: their joining, or their leaving. */
export const isMembershipChanging = (model: Model): boolean =>
  model.memberships.some(({ membership, pending }) => pending && membership.memberId === model.memberId)

/**
 * Whether the person may admit members to the group and remove them: a team they belong to, except general, which
 * every member belongs to, where they are granted to manage its members.
 */
export const mayManageMembers = (model: Model): boolean =>
  Option.isSome(teamName(model)) &&
  belongs(model) &&
  !Group.isGeneral({ id: model.groupId }) &&
  may(model.grants, GroupMembershipPermissions.Manage, groupTarget(model.workspaceId, model.groupId))

/** The workspace's active members who are not in the group, whom the person may admit to it. */
export const admissibleMembers = (model: Model): ReadonlyArray<Member.Member> => {
  const memberIds = membersOf(model)

  return model.members.filter((member) => member.status === "active" && !memberIds.includes(member.id))
}

/**
 * The model with `memberId` among the members chosen to admit, unless they cannot be admitted or are chosen already.
 */
export const chooseToAdmit = (model: Model, memberId: string): Model => {
  const member = admissibleMembers(model).find(({ id }) => id === memberId)

  return member === undefined || model.admitting.includes(member.id)
    ? model
    : modifyFields(model, { admitting: (admitting) => [...admitting, member.id], admitQuery: () => "" })
}

/** The model without `memberId` among the members chosen to admit. */
export const unchooseToAdmit = (model: Model, memberId: string): Model =>
  modifyFields(model, { admitting: (admitting) => admitting.filter((id) => id !== memberId) })
