import * as Option from "effect/Option"
import { CheckCode, SendCode } from "./command.ts"
import { SignInComposition } from "./composition.ts"
import { Message, OutMessage, SignInForm } from "./definition.ts"

export const update = SignInComposition.makeUpdate((model, message) => {
  const { form } = model
  /** The form as `step` makes it, or as it is, when the step does not fit where the form has got to. */
  const at = (next: SignInForm | undefined) => ({ model: next === undefined ? model : { form: next } })
  return Message.match(message, {
    TypedEmail: ({ email }) =>
      at(
        SignInForm.matchOrElse(
          form,
          { EnteringEmail: ({ error }) => SignInForm.EnteringEmail({ email, error }) },
          () => undefined
        )
      ),
    SubmittedEmail: () =>
      SignInForm.matchOrElse(
        form,
        {
          EnteringEmail: ({ email }) => ({
            model: { form: SignInForm.SendingCode({ email }) },
            commands: [SendCode({ email })]
          })
        },
        () => ({ model })
      ),
    SucceededSendCode: () =>
      at(
        SignInForm.matchOrElse(
          form,
          { SendingCode: ({ email }) => SignInForm.EnteringCode({ email, code: "", error: Option.none() }) },
          () => undefined
        )
      ),
    FailedSendCode: ({ error }) =>
      at(
        SignInForm.matchOrElse(
          form,
          { SendingCode: ({ email }) => SignInForm.EnteringEmail({ email, error: Option.some(error) }) },
          () => undefined
        )
      ),
    ClickedChangeEmail: () =>
      at(
        SignInForm.matchOrElse(
          form,
          { EnteringCode: ({ email }) => SignInForm.EnteringEmail({ email, error: Option.none() }) },
          () => undefined
        )
      ),
    ClickedSendAgain: () =>
      SignInForm.matchOrElse(
        form,
        {
          EnteringCode: ({ email }) => ({
            model: { form: SignInForm.SendingCode({ email }) },
            commands: [SendCode({ email })]
          })
        },
        () => ({ model })
      ),
    TypedCode: ({ code }) =>
      at(
        SignInForm.matchOrElse(
          form,
          { EnteringCode: ({ email, error }) => SignInForm.EnteringCode({ email, code, error }) },
          () => undefined
        )
      ),
    SubmittedCode: () =>
      SignInForm.matchOrElse(
        form,
        {
          EnteringCode: ({ email, code }) => ({
            model: { form: SignInForm.CheckingCode({ email, code }) },
            commands: [CheckCode({ email, code })]
          })
        },
        () => ({ model })
      ),
    SucceededSignIn: ({ session }) =>
      SignInForm.matchOrElse(
        form,
        {
          CheckingCode: ({ email }) => ({
            model: { form: SignInForm.EnteringEmail({ email, error: Option.none() }) },
            outMessage: OutMessage.SignedIn({ session })
          })
        },
        () => ({ model })
      ),
    FailedSignIn: ({ error }) =>
      at(
        SignInForm.matchOrElse(
          form,
          { CheckingCode: ({ email, code }) => SignInForm.EnteringCode({ email, code, error: Option.some(error) }) },
          () => undefined
        )
      )
  })
})
