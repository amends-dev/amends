import { WorkspaceComposition } from "./composition.ts"
import { Message, OutMessage } from "./definition.ts"

export const update = WorkspaceComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedAllWorkspaces: () => ({ model, outMessage: OutMessage.ClosedWorkspace() })
  })
)
