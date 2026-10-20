/** Starting a team or a conversation, or joining a public team, each an action written to the person's store. */

import { Group, GroupId } from "@amends-dev/core/group"
import { Thread, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { focusMembersInput } from "../../memberPicker.ts"
import * as Stores from "../../store/Stores.ts"
import { GroupsDefinition, Message, teamMembersId } from "./definition.ts"

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

/** Move focus to the input of the members picker of the team form, which the chip the person removed held. */
export const FocusTeamMembers = GroupsDefinition.command("FocusTeamMembers", {
  args: {},
  messages: [Message.CompletedFocusTeamMembers],
  handler: function* () {
    return () => focusMembersInput(teamMembersId).pipe(Effect.as(Message.CompletedFocusTeamMembers()))
  }
})

/** Start a conversation with `withMemberId`, `text` its first message. */
export const StartConversation = GroupsDefinition.command("StartConversation", {
  args: { ...Stores.AsMember, withMemberId: MemberId.MemberId, text: Schema.String },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ withMemberId, text, ...member }) =>
      Stores.decoded(
        Thread.StartDirectInput,
        { memberIds: [withMemberId], text, mentions: ThreadMessage.mentionedIn(text) },
        failed("A conversation needs a first message.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("DirectThreadStarted", input))),
        Effect.catch(Effect.succeed)
      )
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

export const EffectsLayer = Layer.mergeAll(
  CreateTeam.layer,
  FocusTeamMembers.layer,
  StartConversation.layer,
  JoinGroup.layer
)
