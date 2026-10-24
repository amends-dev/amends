/** Starting the conversation, an action written to the person's store. */

import { Thread, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { Message, UnsentConversationDefinition } from "./definition.ts"

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Start a conversation with `memberIds`, `text` its first message. */
export const StartConversation = UnsentConversationDefinition.makeCommand("StartConversation", {
  args: { ...Stores.AsMember, memberIds: Schema.Array(MemberId.MemberId), text: Schema.String },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ memberIds, text, ...member }) =>
      Stores.decoded(
        Thread.StartDirectInput,
        { memberIds, text, mentions: ThreadMessage.mentionedIn(text) },
        failed("A conversation needs a first message.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("DirectThreadStarted", input))),
        Effect.catch(Effect.succeed)
      )
  }
})

export const EffectsLayer = Layer.mergeAll(StartConversation.layer)
