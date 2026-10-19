import type { GroupMembership } from "@amends-dev/core/group"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { AdmitMember, FollowGroup, JoinGroup, LeaveGroup, RemoveMember, RenameGroup, UnfollowGroup } from "./command.ts"
import { DialogBinding, GroupComposition } from "./composition.ts"
import { GroupDefinition, Message, type Model, mayRename, ownAdmission, teamName } from "./definition.ts"

/** Whose store the action is written to, and the group it acts on. */
const inGroup = ({ workspaceId, memberId, groupId }: Model) => ({ workspaceId, memberId, groupId })

/** Show the settings' General section. */
const showGeneralTab = GroupDefinition.stepFields(() => ({ settingsTab: () => "General" as const }))

/** Start the draft of the team's name from its name, for someone who may rename the team, so its field is live. */
const startRenaming = GroupDefinition.step((model: Model) => ({
  model: mayRename(model) ? modifyFields(model, { renaming: () => teamName(model) }) : model
}))

/** Write the draft of the team's name, unless it is the name the team has. */
const writeRenamingWhenChanged = GroupDefinition.step((model: Model) =>
  Option.match(Option.product(model.renaming, teamName(model)), {
    onNone: () => ({ model }),
    onSome: ([name, expectedName]) =>
      name === expectedName ? { model } : { model, commands: [RenameGroup({ ...inGroup(model), name, expectedName })] }
  })
)

/** End the person's admission `membershipId` to the group. */
const writeLeaving = (membershipId: GroupMembership.GroupMembershipId) =>
  GroupDefinition.step((model: Model) => ({ model, commands: [LeaveGroup({ ...inGroup(model), membershipId })] }))

export const update = GroupComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedGroup: ({ group, memberships, follow }) => ({
      model: modifyFields(model, { group: () => group, memberships: () => memberships, follow: () => follow })
    }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    ReceivedPresence: ({ present }) => ({ model: modifyFields(model, { present: () => present }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedSettings: () => Update.combine(model, [showGeneralTab, startRenaming, DialogBinding.requestOpen()]),
    ChoseSettingsTab: ({ tab }) => ({ model: modifyFields(model, { settingsTab: () => tab }) }),
    TypedName: ({ name }) => ({ model: modifyFields(model, { renaming: () => Option.some(name) }) }),
    SubmittedRename: () => Update.combine(model, [writeRenamingWhenChanged, DialogBinding.requestClose()]),
    ClickedFollow: () => ({ model, commands: [FollowGroup(inGroup(model))] }),
    ClickedUnfollow: () => ({ model, commands: [UnfollowGroup(inGroup(model))] }),
    ClickedJoin: () => ({ model, commands: [JoinGroup(inGroup(model))] }),
    ClickedLeave: () =>
      Option.match(ownAdmission(model), {
        onNone: () => ({ model }),
        onSome: ({ membership }) => Update.combine(model, [writeLeaving(membership.id), DialogBinding.requestClose()])
      }),
    ChoseMemberToAdmit: ({ memberId }) => ({ model: modifyFields(model, { admitting: () => memberId }) }),
    SubmittedAdmit: () =>
      Option.match(model.admitting, {
        onNone: () => ({ model }),
        onSome: (admitMemberId) => ({
          model: modifyFields(model, { admitting: () => Option.none() }),
          commands: [AdmitMember({ ...inGroup(model), admitMemberId })]
        })
      }),
    ClickedRemoveMember: ({ membershipId }) => ({
      model,
      commands: [RemoveMember({ ...inGroup(model), membershipId })]
    }),
    ClickedAllThreads: () => ({ model: modifyFields(model, { thread: () => Option.none() }) }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
