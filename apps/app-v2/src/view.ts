import { centered } from "@amends-dev/design/centered"
import { button } from "@amends-dev/design/control"
import { inline } from "@amends-dev/design/form"
import * as Option from "effect/Option"
import { ApplicationComposition, SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { button as unstyledButton } from "./controls.ts"
import { Message } from "./message.ts"
import { Page } from "./model.ts"

export const view = ApplicationComposition.makeView((model, h) => ({
  title: "amends",
  body: Page.match(model.page, {
    SignedOut: ({ signIn }) =>
      centered(h, {
        brand: "amends",
        width: "form",
        children: [h.block(SignInBinding.embedView({ slotId: "sign-in", model: signIn }))]
      }),
    SignedIn: ({ account, workspaces, workspace }) =>
      Option.match(workspace, {
        onNone: () =>
          centered(h, {
            brand: "amends",
            width: "directory",
            actions: [inline(h, [account.email]), button(h, "Sign out", Message.ClickedSignOut())],
            children: [h.block(WorkspacesBinding.embedView({ slotId: "workspaces", model: workspaces }))]
          }),
        onSome: ({ workspaceId, model: opened }) =>
          h.main(
            [],
            [
              h.header([], [h.p([], [account.email]), unstyledButton(h, "Sign out", Message.ClickedSignOut())]),
              h.block(WorkspaceBinding.embedView({ key: workspaceId, slotId: "workspace", model: opened }))
            ]
          )
      })
  })
}))
