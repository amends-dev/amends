import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { UnsentConversationComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = UnsentConversationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedMembers: ({ members }) => ({ model: modifyFields(model, { members: () => members }) }),
    ReceivedConversation: ({ groupId }) =>
      Option.match(groupId, {
        onNone: () => ({ model }),
        onSome: (found) => ({ model, outMessage: OutMessage.FoundConversation({ groupId: found }) })
      }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
