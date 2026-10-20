import * as Option from "effect/Option"
import { SignInComposition } from "./composition.ts"
import { Model, SignInForm } from "./definition.ts"

/** An empty form, or one for `email`, with `notice` over it when there is one. */
export const init = SignInComposition.makeInit((email: string, notice?: string) => ({
  model: Model.make({
    form: SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.fromUndefinedOr(notice) })
  })
}))
