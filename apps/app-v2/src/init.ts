import * as Option from "effect/Option"
import { ApplicationComposition, SignInBinding, WorkspacesBinding } from "./composition.ts"
import type { Flags } from "./flags.ts"
import { Page } from "./model.ts"

/**
 * Start from the session kept from the last visit, listing the person's workspaces, or signed out, in the
 * window's width at the start.
 */
export const init = ApplicationComposition.makeInit((flags: Flags) =>
  Option.match(flags.session, {
    onNone: () =>
      SignInBinding.init({
        args: [""],
        toParentModel: (signIn) => ({ page: Page.SignedOut({ signIn }), viewport: flags.viewport })
      }),
    onSome: (session) =>
      WorkspacesBinding.init({
        args: [],
        toParentModel: (workspaces) => ({
          page: Page.SignedIn({ account: session.account, workspaces, workspace: Option.none() }),
          viewport: flags.viewport
        })
      })
  })
)
