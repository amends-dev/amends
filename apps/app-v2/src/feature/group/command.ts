/** What the person does to the group and their part in it, each an action written to their store. */

import { Group, GroupId, GroupMembership } from "@amends-dev/core/group"
import { MemberId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { GroupDefinition, Message } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Rename the team `groupId` to `name`, from the name the person saw. */
export const RenameGroup = GroupDefinition.command("RenameGroup", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId, name: Schema.String, expectedName: Schema.String },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, name, expectedName, ...member }) =>
      Stores.decoded(Group.RenameInput, { groupId, name, expectedName }, failed("A team needs a name.")).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("GroupRenamed", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/** Follow `groupId`. */
export const FollowGroup = GroupDefinition.command("FollowGroup", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, ...member }) =>
      write(member, (store) => store.write("GroupFollowed", { groupId, memberId: member.memberId }))
  }
})

/** Stop following `groupId`. */
export const UnfollowGroup = GroupDefinition.command("UnfollowGroup", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, ...member }) =>
      write(member, (store) => store.write("GroupUnfollowed", { groupId, memberId: member.memberId }))
  }
})

/** Join `groupId`. */
export const JoinGroup = GroupDefinition.command("JoinGroup", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, ...member }) => write(member, (store) => store.write("GroupJoined", { groupId }))
  }
})

/** Leave `groupId`, ending the person's admission `membershipId`. */
export const LeaveGroup = GroupDefinition.command("LeaveGroup", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId, membershipId: GroupMembership.GroupMembershipId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, membershipId, ...member }) =>
      write(member, (store) => store.write("GroupLeft", { groupId, membershipId }))
  }
})

/** Admit `admitMemberId` to `groupId`. */
export const AdmitMember = GroupDefinition.command("AdmitMember", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId, admitMemberId: MemberId.MemberId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, admitMemberId, ...member }) =>
      write(member, (store) => store.write("GroupMemberAdded", { groupId, memberId: admitMemberId }))
  }
})

/** End the admission `membershipId` to `groupId`. */
export const RemoveMember = GroupDefinition.command("RemoveMember", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId, membershipId: GroupMembership.GroupMembershipId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, membershipId, ...member }) =>
      write(member, (store) => store.write("GroupMemberRemoved", { groupId, membershipId }))
  }
})

export const EffectsLayer = Layer.mergeAll(
  RenameGroup.layer,
  FollowGroup.layer,
  UnfollowGroup.layer,
  JoinGroup.layer,
  LeaveGroup.layer,
  AdmitMember.layer,
  RemoveMember.layer
)
