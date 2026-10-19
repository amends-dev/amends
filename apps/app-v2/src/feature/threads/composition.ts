import * as Option from "effect/Option"
import type { Block } from "foldkit"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { StartThread } from "./command.ts"
import { type Model, ThreadsDefinition } from "./definition.ts"

/**
 * What the person sends from the composer starts a thread, one that tracks a task, in triage, on the Tasks tab;
 * their typing changes nothing here.
 */
const foldComposerOutMessage = ComposerBlock.OutMessage.match({
  ChangedText: () => ThreadsDefinition.stepNoop(),
  SubmittedText: ({ text }) =>
    ThreadsDefinition.step((model: Model) => ({
      model,
      commands: [
        StartThread({
          workspaceId: model.workspaceId,
          memberId: model.memberId,
          groupId: model.groupId,
          text,
          task: model.tab === "Tasks" ? Option.some({}) : Option.none()
        })
      ]
    }))
})

export const ComposerBinding = ThreadsDefinition.bindChild(ComposerBlock, {
  field: "composer",
  init: {
    contextToArgs: ({ workspaceId, memberId, groupId }) => [
      workspaceId,
      memberId,
      Drafts.Place.cases.Thread.make({ groupId })
    ]
  },
  outMessage: { fold: foldComposerOutMessage }
})

export const ThreadsComposition = ThreadsDefinition.makeComposition({ bindings: [ComposerBinding] })
export type ThreadsViewBuilder = Block.ViewBuilderFor<typeof ThreadsComposition>
