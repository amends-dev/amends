import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { TaskBlock } from "../task/block.ts"
import { PostReply, TellTyping } from "./command.ts"
import { type Model, ThreadDefinition } from "./definition.ts"

/**
 * What the person sends from the composer is their reply, and typing is said at once, then at
 * most as often as it lasts; sending says they stopped.
 */
const foldReplyOutMessage = ComposerBlock.OutMessage.match({
  ChangedText: ({ text }) =>
    ThreadDefinition.step((model: Model) => {
      const telling = text !== "" && !model.typingTold
      return {
        model: modifyFields(model, { typingTold: (told) => told || telling }),
        commands: telling ? [TellTyping({ workspaceId: model.workspaceId, threadId: model.threadId })] : []
      }
    }),
  SubmittedText: ({ text }) =>
    ThreadDefinition.step((model: Model) => ({
      model,
      commands: [
        PostReply({ workspaceId: model.workspaceId, memberId: model.memberId, threadId: model.threadId, text }),
        TellTyping({ workspaceId: model.workspaceId, threadId: null })
      ]
    }))
})

export const ReplyBinding = ThreadDefinition.bindChild(ComposerBlock, {
  field: "reply",
  init: {
    contextToArgs: ({ workspaceId, memberId, threadId }) => [
      workspaceId,
      memberId,
      Drafts.Place.cases.Reply.make({ threadId })
    ]
  },
  outMessage: { fold: foldReplyOutMessage }
})

export const TaskBinding = ThreadDefinition.bindChild(TaskBlock, {
  field: "task",
  init: { contextToArgs: ({ workspaceId, memberId, threadId }) => [workspaceId, memberId, threadId] }
})

export const ThreadComposition = ThreadDefinition.makeComposition({ bindings: [ReplyBinding, TaskBinding] })
export type ThreadViewBuilder = Block.ViewBuilderFor<typeof ThreadComposition>
