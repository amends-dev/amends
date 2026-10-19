/** Starting a team or a conversation, each an action written to the person's store. */

import { Group } from "@amends-dev/core/group"
import { Thread } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { GroupsDefinition, Message } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Create the team `name`, with the person as its first member, public when `isPublic`. */
export const CreateTeam = GroupsDefinition.command("CreateTeam", {
  args: { ...Stores.AsMember, name: Schema.String, isPublic: Schema.Boolean },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ name, isPublic, ...member }) =>
      Stores.decoded(
        Group.CreateTeamInput,
        { name, memberIds: [member.memberId], visibility: isPublic ? "Public" : "Private" },
        failed("A team needs a name.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("TeamCreated", input))),
        Effect.catch(Effect.succeed)
      )
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
        { memberIds: [withMemberId], text, mentions: [] },
        failed("A conversation needs a first message.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("DirectThreadStarted", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

export const EffectsLayer = Layer.mergeAll(CreateTeam.layer, StartConversation.layer)
