import type { Block } from "foldkit"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { StartConversation } from "./command.ts"
import { type Model, UnsentConversationDefinition } from "./definition.ts"

/**
 * What the person sends from the composer starts the conversation; their typing changes nothing here, and the composer
 * offers no commands before the conversation exists.
 */
const foldComposerOutMessage = ComposerBlock.OutMessage.match({
  ChangedText: () => UnsentConversationDefinition.makeNoopStep(),
  SubmittedText: ({ text }) =>
    UnsentConversationDefinition.makeStep((model: Model) => ({
      model,
      commands: [
        StartConversation({
          workspaceId: model.workspaceId,
          memberId: model.memberId,
          memberIds: model.memberIds,
          text
        })
      ]
    })),
  RanSlashCommand: () => UnsentConversationDefinition.makeNoopStep()
})

export const ComposerBinding = UnsentConversationDefinition.makeBinding(ComposerBlock, {
  field: "composer",
  init: {
    contextToArgs: ({ workspaceId, memberId, memberIds }) => [
      workspaceId,
      memberId,
      Drafts.Place.cases.Conversation.make({ memberIds })
    ]
  }
}).withOutMessagePolicy({ fold: foldComposerOutMessage })

export const UnsentConversationComposition = UnsentConversationDefinition.makeComposition({
  bindings: [ComposerBinding]
})
export type UnsentConversationViewBuilder = Block.ViewBuilderFor<typeof UnsentConversationComposition>
