import * as Option from "effect/Option"
import * as Update from "foldkit/update"
import { ApplicationComposition, WorkspaceBinding, signOut } from "./composition.ts"
import { ApplicationDefinition } from "./definition.ts"
import { Message } from "./message.ts"
import { openedWorkspaceId } from "./model.ts"

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedSignOut: () => Update.combine(model, [signOut]),
    CompletedSignOut: () => ({ model }),
    ChangedViewport: ({ viewport }) =>
      Update.combine(model, [
        ApplicationDefinition.stepFields(() => ({ viewport: () => viewport })),
        ...Option.toArray(
          Option.map(openedWorkspaceId(model), (workspaceId) =>
            WorkspaceBinding.informViewport(workspaceId, { viewport })
          )
        )
      ])
  })
)
