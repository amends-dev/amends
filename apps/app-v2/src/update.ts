import * as Option from "effect/Option"
import { UrlRequest } from "foldkit/navigation"
import { modifyFields } from "foldkit/struct"
import * as Update from "foldkit/update"
import { toString } from "foldkit/url"
import { LoadExternal, Navigate } from "./command.ts"
import {
  ApplicationComposition,
  signOut,
  WorkspaceBinding,
  WorkspacesBinding,
  closeWorkspace,
  restoreRoute
} from "./composition.ts"
import { ApplicationDefinition } from "./definition.ts"
import { Message } from "./message.ts"
import { Page, openedWorkspaceId } from "./model.ts"
import { fromUrl, Route, sameRoute } from "./route.ts"

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ClickedWorkspaces: () => Update.combineSteps(model, [closeWorkspace]),
    ClickedRetryWorkspace: () => Update.combineSteps(model, [WorkspacesBinding.requestReload()]),
    CompletedNavigation: () => ({ model }),
    ClickedLink: ({ request }) =>
      UrlRequest.match(request, {
        Internal: ({ url }) => ({ model, commands: [Navigate({ url: toString(url), replace: false })] }),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] })
      }),
    ChangedUrl: ({ url }) => {
      const route = fromUrl(url)
      if (sameRoute(route, model.route)) return { model }
      const next = modifyFields(model, {
        route: () => route,
        page: (page) =>
          Page.matchOrElse(
            page,
            {
              SignedIn: (page) =>
                Page.SignedIn({
                  ...page,
                  workspace: Option.filter(
                    page.workspace,
                    ({ workspaceId }) => Route.isAnyOf(["Workspace"])(route) && route.workspaceId === workspaceId
                  )
                })
            },
            (page) => page
          )
      })
      return Update.combineSteps(next, [restoreRoute])
    },
    ClickedSignOut: () => Update.combineSteps(model, [signOut]),
    CompletedSignOut: () => ({ model }),
    CompletedShowAppearance: () => ({ model }),
    CompletedKeepAppearance: () => ({ model }),
    ChangedViewport: ({ viewport }) =>
      Update.combineSteps(model, [
        ApplicationDefinition.makeFieldsStep(() => ({ viewport: () => viewport })),
        ...Option.toArray(
          Option.map(openedWorkspaceId(model), (workspaceId) =>
            WorkspaceBinding.informViewport(workspaceId, { viewport })
          )
        )
      ]),
    Ticked: ({ now }) => Update.combineSteps(model, [ApplicationDefinition.makeFieldsStep(() => ({ now: () => now }))]),
    // The search belongs to the open workspace; with none open the key opens nothing.
    PressedSearchKey: () =>
      Update.combineSteps(
        model,
        Option.toArray(
          Option.map(openedWorkspaceId(model), (workspaceId) => WorkspaceBinding.requestSearch(workspaceId))
        )
      )
  })
)
