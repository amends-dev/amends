import { centered, centeredAccount } from "@amends-dev/design/centered"
import { button } from "@amends-dev/design/control"
import * as Option from "effect/Option"
import { ApplicationComposition, SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { Message } from "./message.ts"
import { Page } from "./model.ts"
import { hasListing } from "./page/workspaces/definition.ts"

export const view = ApplicationComposition.makeView((model, h) => ({
  title: "amends",
  body: Page.match(model.page, {
    SignedOut: ({ signIn }) =>
      centered(h, {
        width: "form",
        children: [h.block(SignInBinding.embedView({ slotId: "sign-in", model: signIn }))]
      }),
    SignedIn: ({ account, workspaces, workspace }) =>
      Option.match(workspace, {
        onNone: () =>
          centered(h, {
            width: hasListing(workspaces) ? "directory" : "form",
            actions: [centeredAccount(h, account.email), button(h, "Sign out", Message.ClickedSignOut())],
            children: [
              h.block(
                WorkspacesBinding.embedView({ slotId: "workspaces", model: workspaces, viewInputs: { now: model.now } })
              )
            ]
          }),
        onSome: ({ workspaceId, model: opened }) =>
          h.block(
            WorkspaceBinding.embedView({
              key: workspaceId,
              slotId: "workspace",
              model: opened,
              viewInputs: { email: account.email, now: model.now, isApplePlatform: model.isApplePlatform }
            })
          )
      })
  })
}))
