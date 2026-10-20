import type { Block } from "foldkit"
import { modifyFields } from "foldkit/struct"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { TaskBlock } from "../task/block.ts"
import { TurnsBlock } from "../turns/block.ts"
import { PostReply, RevealHighlightedMessage, ScrollMessagesToEnd, TellTyping } from "./command.ts"
import { type Model, OutMessage, ThreadDefinition } from "./definition.ts"

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

/**
 * Going back to the thread from a turn's log shows it at its end, as it opens. Closing the log, which leaves the thread
 * too, and asking for an agent's settings are reported, since the thread's parents and the page act on them.
 */
const foldTurnsOutMessage = TurnsBlock.OutMessage.match({
  ReturnedToThread: () =>
    ThreadDefinition.step((model: Model) => ({
      model,
      commands: [ScrollMessagesToEnd({ threadId: model.threadId, onlyIfNearEnd: false })]
    })),
  ClosedLog: () => ThreadDefinition.stepNoop(),
  OpenedAgent: () => ThreadDefinition.stepNoop()
})

/** Closing a turn's log is the person closing the thread's pane; an agent's settings are the page's to open. */
const forwardTurnsOutMessage = TurnsBlock.OutMessage.match({
  ReturnedToThread: () => undefined,
  ClosedLog: () => OutMessage.ClosedTurnLog(),
  OpenedAgent: ({ agentId }) => OutMessage.OpenedAgent({ agentId })
})

export const TurnsBinding = ThreadDefinition.bindChild(TurnsBlock, {
  field: "turns",
  init: { contextToArgs: ({ workspaceId, memberId, threadId }) => [workspaceId, memberId, threadId] },
  outMessage: { forward: forwardTurnsOutMessage, fold: foldTurnsOutMessage }
})

export const ThreadComposition = ThreadDefinition.makeComposition({
  bindings: [ReplyBinding, TaskBinding, TurnsBinding],
  mounts: [RevealHighlightedMessage]
})
export type ThreadViewBuilder = Block.ViewBuilderFor<typeof ThreadComposition>
