import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { AdmitMember, FollowGroup, JoinGroup, LeaveGroup, RemoveMember, RenameGroup, UnfollowGroup } from "./command.ts"
import { GroupComposition } from "./composition.ts"
import { Message, type Model, ownAdmission, teamName } from "./definition.ts"

/** Whose store the action is written to, and the group it acts on. */
const inGroup = ({ workspaceId, memberId, groupId }: Model) => ({ workspaceId, memberId, groupId })

export const update = GroupComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedGroup: ({ group, memberships, follow }) => ({
      model: modifyFields(model, { group: () => group, memberships: () => memberships, follow: () => follow })
    }),
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedGrants: ({ grants }) => ({ model: modifyFields(model, { grants: () => grants }) }),
    ReceivedPresence: ({ present }) => ({ model: modifyFields(model, { present: () => present }) }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedRename: () => ({
      model: modifyFields(model, { renaming: () => Option.some(Option.getOrElse(teamName(model), () => "")) })
    }),
    TypedName: ({ name }) => ({ model: modifyFields(model, { renaming: () => Option.some(name) }) }),
    SubmittedRename: () =>
      Option.match(Option.product(model.renaming, teamName(model)), {
        onNone: () => ({ model }),
        onSome: ([name, expectedName]) => ({
          model: modifyFields(model, { renaming: () => Option.none() }),
          commands: [RenameGroup({ ...inGroup(model), name, expectedName })]
        })
      }),
    ClickedCancelRename: () => ({ model: modifyFields(model, { renaming: () => Option.none() }) }),
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
