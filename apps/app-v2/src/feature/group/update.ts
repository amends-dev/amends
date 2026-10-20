import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import {
  AdmitMembers,
  FocusAdmitMembers,
  FollowGroup,
  JoinGroup,
  LeaveGroup,
  RemoveMember,
  RenameGroup,
  UnfollowGroup
} from "./command.ts"
import { closeThread, DialogBinding, GroupComposition, MembersBinding, openSettings } from "./composition.ts"
import {
  chooseToAdmit,
  GroupDefinition,
  inGroup,
  Message,
  type Model,
  OutMessage,
  ownAdmission,
  teamName,
  unchooseToAdmit
} from "./definition.ts"

/** Write the draft of the team's name, unless it is the name the team has. */
const writeRenamingWhenChanged = GroupDefinition.step((model: Model) =>
  Option.match(Option.product(model.renaming, teamName(model)), {
    onNone: () => ({ model }),
    onSome: ([name, expectedName]) =>
      name === expectedName ? { model } : { model, commands: [RenameGroup({ ...inGroup(model), name, expectedName })] }
  })
)

/** Admit the members chosen, one action written for each, and leave none chosen and the phone's own view for it. */
const admitChosen = GroupDefinition.step((model: Model) => ({
  model: modifyFields(model, { admitting: () => [], admitQuery: () => "", isAddViewOpen: () => false }),
  commands: model.admitting.length === 0 ? [] : [AdmitMembers({ ...inGroup(model), admitMemberIds: model.admitting })]
}))

export const update = GroupComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedGroup: ({ group, memberships, follow }) => {
      const received = modifyFields(model, {
        group: () => group,
        isLoaded: () => true,
        memberships: () => memberships,
        follow: () => follow
      })

      return Option.isNone(group) && model.dialog.isOpen
        ? Update.combine(received, [DialogBinding.requestClose()])
        : { model: received }
    },
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    ReceivedPresence: ({ present }) => ({ model: modifyFields(model, { present: () => present }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedTryAgain: () => ({
      model: modifyFields(model, { notice: () => Option.none(), reads: (reads) => reads + 1 })
    }),
    ClickedSettings: () => Update.combine(model, [openSettings("General")]),
    ClickedMembers: () => Update.combine(model, [openSettings("Members")]),
    ChoseSettingsTab: ({ tab }) => ({ model: modifyFields(model, { settingsTab: () => tab }) }),
    TypedName: ({ name }) => ({ model: modifyFields(model, { renaming: () => Option.some(name) }) }),
    SubmittedRename: () => Update.combine(model, [writeRenamingWhenChanged, DialogBinding.requestClose()]),
    ClickedFollow: () => ({ model, commands: [FollowGroup(inGroup(model))] }),
    ClickedUnfollow: () => ({ model, commands: [UnfollowGroup(inGroup(model))] }),
    ClickedJoin: () => ({ model, commands: [JoinGroup(inGroup(model))] }),
    ClickedLeave: () =>
      Option.match(ownAdmission(model), {
        onNone: () => ({ model }),
        onSome: ({ membership }) => ({
          model,
          commands: [LeaveGroup({ ...inGroup(model), membershipId: membership.id })]
        })
      }),
    ClickedAddMembers: () => ({ model: modifyFields(model, { isAddViewOpen: () => true }) }),
    ClickedBackToMembers: () => ({ model: modifyFields(model, { isAddViewOpen: () => false }) }),
    TypedAdmitQuery: ({ query }) => ({ model: modifyFields(model, { admitQuery: () => query }) }),
    PickedAdmitMember: ({ memberId }) => ({ model: chooseToAdmit(model, memberId) }),
    ClickedRemoveAdmitting: ({ memberId }) => ({
      model: unchooseToAdmit(model, memberId),
      commands: [FocusAdmitMembers({})]
    }),
    ClickedAdmit: () => Update.combine(model, [admitChosen, MembersBinding.requestClose()]),
    CompletedFocusAdmitMembers: () => ({ model }),
    ClickedRemoveMember: ({ membershipId }) => ({
      model,
      commands: [RemoveMember({ ...inGroup(model), membershipId })]
    }),
    ClickedAllThreads: () => Update.withOutMessage(Update.combine(model, [closeThread]), OutMessage.ClosedThread()),
    RequestedCloseThread: () => Update.combine(model, [closeThread]),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
