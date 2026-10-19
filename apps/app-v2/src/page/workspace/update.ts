import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { WorkspaceComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = WorkspaceComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedAllWorkspaces: () => ({ model, outMessage: OutMessage.ClosedWorkspace() }),
    ClickedAllThreads: () => ({
      model: modifyFields(model, {
        pane: Option.map((pane) => modifyFields(pane, { thread: () => Option.none() }))
      })
    })
  })
)
