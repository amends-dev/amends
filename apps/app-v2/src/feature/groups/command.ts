/** Starting a team, joining a public team, or reading a group, each an action written to the person's store. */

import { Group, GroupId } from "@amends-dev/core/group"
import { MemberId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { focusMembersInput } from "../../control/memberPicker.ts"
import * as Stores from "../../store/Stores.ts"
import { GroupsDefinition, Message, startingMembersId } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Why a team could not be made of the name the person gave, which holds no name or one the host would refuse. */
const invalidTeamName = "Use 1 to 80 characters, with no invisible ones."

/** Create the team `name`, `visibility` public or private, with `memberIds` as its first members. */
export const CreateTeam = GroupsDefinition.command("CreateTeam", {
  args: {
    ...Stores.AsMember,
    name: Schema.String,
    visibility: Group.Visibility,
    memberIds: Schema.Array(MemberId.MemberId)
  },
  messages: [Message.SucceededCreateTeam, Message.FailedCreateTeam],
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.SucceededCreateTeam(), (error) =>
      Message.FailedCreateTeam({ error })
    )
    return ({ name, visibility, memberIds, ...member }) =>
      Stores.decoded(
        Group.CreateTeamInput,
        { name, memberIds, visibility },
        Message.FailedCreateTeam({ error: invalidTeamName })
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("TeamCreated", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

/**
 * Move focus to the input of the members picker of the form for what the person is starting, which the chip they
 * removed held.
 */
export const FocusStartingMembers = GroupsDefinition.command("FocusStartingMembers", {
  args: {},
  messages: [Message.CompletedFocusStartingMembers],
  handler: function* () {
    return () => focusMembersInput(startingMembersId).pipe(Effect.as(Message.CompletedFocusStartingMembers()))
  }
})

/** Join the public team `groupId`. */
export const JoinGroup = GroupsDefinition.command("JoinGroup", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId },
  messages: [Message.SucceededJoinGroup, Message.FailedJoinGroup],
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ groupId, ...member }) =>
      Stores.writer(stores, Message.SucceededJoinGroup({ groupId }), (error) =>
        Message.FailedJoinGroup({ groupId, error })
      )(member, (store) => store.write("GroupJoined", { groupId }))
  }
})

/** Record that the person read the group `groupId` now. */
export const MarkGroupRead = GroupsDefinition.command("MarkGroupRead", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, ...member }) => write(member, (store) => store.write("GroupMarkedRead", { groupId }))
  }
})

export const EffectsLayer = Layer.mergeAll(
  CreateTeam.layer,
  FocusStartingMembers.layer,
  JoinGroup.layer,
  MarkGroupRead.layer
)
