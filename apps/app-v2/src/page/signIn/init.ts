import * as Option from "effect/Option"
import { SignInComposition } from "./composition.ts"
import { Model, SignInForm } from "./definition.ts"

/** An empty form, or one for `email`. */
export const init = SignInComposition.makeInit((email: string) => ({
  model: Model.make({ form: SignInForm.EnteringEmail({ email, error: Option.none() }) })
}))
