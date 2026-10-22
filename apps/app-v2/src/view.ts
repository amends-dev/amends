import { centered, centeredAccount } from "@amends-dev/design/centered"
import { button, loadingLine } from "@amends-dev/design/control"
import { paneEmpty } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import { ApplicationComposition, SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { Message } from "./message.ts"
import { Page } from "./model.ts"
import { hasListing, Workspaces } from "./page/workspaces/definition.ts"
import { Route, href, home } from "./route.ts"

export const view = ApplicationComposition.makeView((model, h) => ({
  title: "amends",
  body: Route.isAnyOf(["NotFound"])(model.route)
    ? centered(h, {
        width: "form",
        children: [
          paneEmpty(h, {
            art: "nothing-here",
            level: 1,
            title: "Page not found",
            copy: "This address doesn’t lead to a page in amends.",
            action: button(h, "Go to workspaces", Message.ClickedWorkspaces())
          })
        ]
      })
    : Page.match(model.page, {
        SignedOut: ({ signIn }) =>
          centered(h, {
            width: "form",
            children: [h.block(SignInBinding.embedView({ slotId: "sign-in", model: signIn }))]
          }),
        SignedIn: ({ account, workspaces, workspace }) =>
          Option.match(workspace, {
            onNone: () =>
              centered(h, {
                width: !Route.isAnyOf(["Workspace"])(model.route) && hasListing(workspaces) ? "directory" : "form",
                actions: [centeredAccount(h, account.email), button(h, "Sign out", Message.ClickedSignOut())],
                children: Route.isAnyOf(["Workspace"])(model.route)
                  ? [
                      Workspaces.match(workspaces.workspaces, {
                        Loading: () => loadingLine(h, "Opening workspace…"),
                        Unreachable: () =>
                          paneEmpty(h, {
                            art: "lost-thread",
                            level: 1,
                            title: "Can’t reach the host",
                            copy: "Your destination is saved. Try again when the host is reachable.",
                            action: button(h, "Try again", Message.ClickedRetryWorkspace())
                          }),
                        Loaded: ({ reloadFailed }) =>
                          paneEmpty(h, {
                            art: reloadFailed ? "lost-thread" : "held-back",
                            level: 1,
                            title: reloadFailed ? "Can’t reach the host" : "Workspace unavailable",
                            copy: reloadFailed
                              ? "Try again when the host is reachable."
                              : "This account doesn’t have access to this workspace. It may have been removed, or you may need to join it.",
                            action: button(h, "Try again", Message.ClickedRetryWorkspace())
                          })
                      }),
                      button(h, "Go to workspaces", Message.ClickedWorkspaces())
                    ]
                  : [
                      h.block(
                        WorkspacesBinding.embedView({
                          slotId: "workspaces",
                          model: workspaces,
                          viewInputs: {
                            now: model.now,
                            workspaceHref: (workspaceId) => href(Route.Workspace({ workspaceId, destination: home() }))
                          }
                        })
                      )
                    ]
              }),
            onSome: ({ workspaceId, model: opened }) =>
              h.block(
                WorkspaceBinding.embedView({
                  key: workspaceId,
                  slotId: "workspace",
                  model: opened,
                  viewInputs: {
                    destinationHref: (destination) => href(Route.Workspace({ workspaceId, destination })),
                    email: account.email,
                    appearance: model.appearance,
                    now: model.now,
                    isApplePlatform: model.isApplePlatform
                  }
                })
              )
          })
      })
}))
