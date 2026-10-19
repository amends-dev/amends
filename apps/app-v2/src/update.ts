import { SignOut } from "./command.ts"
import { ApplicationComposition, SignInBinding } from "./composition.ts"
import { Message } from "./message.ts"
import { Page } from "./model.ts"

export const update = ApplicationComposition.makeUpdate((model, message) =>
  Message.match(message, {
    // Signing out leaves the address in the form.
    ClickedSignOut: () =>
      SignInBinding.init({
        args: [Page.matchOrElse(model.page, { SignedIn: ({ account }) => account.email }, () => "")],
        toParentModel: (signIn) => ({ page: Page.SignedOut({ signIn }) }),
        commands: [SignOut()]
      }),
    CompletedSignOut: () => ({ model })
  })
)
