import * as Option from "effect/Option"
import { ApplicationComposition, SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { button } from "./controls.ts"
import { Message } from "./message.ts"
import { Page } from "./model.ts"

export const view = ApplicationComposition.makeView((model, h) => ({
  title: "amends",
  body: Page.match(model.page, {
    SignedOut: ({ signIn }) => h.main([], [h.block(SignInBinding.embedView({ slotId: "sign-in", model: signIn }))]),
    SignedIn: ({ account, workspaces, workspace }) =>
      h.main(
        [],
        [
          h.header([], [h.p([], [account.email]), button(h, "Sign out", Message.ClickedSignOut())]),
          Option.match(workspace, {
            onNone: () => h.block(WorkspacesBinding.embedView({ slotId: "workspaces", model: workspaces })),
            onSome: ({ workspaceId, model: opened }) =>
              h.block(WorkspaceBinding.embedView({ key: workspaceId, slotId: "workspace", model: opened }))
          })
        ]
      )
  })
}))
