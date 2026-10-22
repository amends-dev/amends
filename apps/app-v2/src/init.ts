import * as Option from "effect/Option"
import type { Url } from "foldkit/url"
import { ShowAppearance } from "./command.ts"
import { ApplicationComposition, SignInBinding, WorkspacesBinding } from "./composition.ts"
import type { Flags } from "./flags.ts"
import { Page } from "./model.ts"
import { fromUrl } from "./route.ts"

/**
 * Start from the session kept from the last visit, listing the person's workspaces, or signed out, in the
 * Appearance kept with it, which the page shows, and the window's width and at the time now at the start, on the
 * platform the page runs on.
 */
export const init = ApplicationComposition.makeInit((flags: Flags, url: Url) =>
  Option.match(flags.session, {
    onNone: () =>
      SignInBinding.init({
        args: [""],
        commands: [ShowAppearance({ appearance: flags.appearance })],
        toParentModel: (signIn) => ({
          route: fromUrl(url),
          page: Page.SignedOut({ signIn }),
          appearance: flags.appearance,
          viewport: flags.viewport,
          now: flags.now,
          isApplePlatform: flags.isApplePlatform
        })
      }),
    onSome: (session) =>
      WorkspacesBinding.init({
        args: [session.account.email],
        commands: [ShowAppearance({ appearance: flags.appearance })],
        toParentModel: (workspaces) => ({
          route: fromUrl(url),
          page: Page.SignedIn({ account: session.account, workspaces, workspace: Option.none() }),
          appearance: flags.appearance,
          viewport: flags.viewport,
          now: flags.now,
          isApplePlatform: flags.isApplePlatform
        })
      })
  })
)
