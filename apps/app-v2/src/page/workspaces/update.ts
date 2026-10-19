import * as Option from "effect/Option"
import { WorkspacesComposition } from "./composition.ts"
import { Message, OutMessage, Workspaces } from "./definition.ts"

export const update = WorkspacesComposition.makeUpdate((model, message) =>
  Message.match(message, {
    SucceededLoadWorkspaces: ({ memberships }) => ({ model: { workspaces: Workspaces.Loaded({ memberships }) } }),
    FailedLoadWorkspaces: ({ error }) => ({ model: { workspaces: Workspaces.Failed({ error }) } }),
    ClickedWorkspace: ({ workspaceId }) =>
      Option.match(
        Workspaces.matchOrElse(
          model.workspaces,
          {
            Loaded: ({ memberships }) =>
              Option.fromUndefinedOr(memberships.find(({ workspace }) => workspace.id === workspaceId))
          },
          () => Option.none()
        ),
        {
          onNone: () => ({ model }),
          onSome: (membership) => ({ model, outMessage: OutMessage.OpenedWorkspace({ membership }) })
        }
      )
  })
)
