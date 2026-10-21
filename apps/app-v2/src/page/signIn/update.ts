import * as Option from "effect/Option"
import { CheckCode, FocusCode, SendCode } from "./command.ts"
import { SignInComposition } from "./composition.ts"
import { type CodeError, type EmailError, Message, OutMessage, SignInForm } from "./definition.ts"

/** Why sending a code again failed, as the code step tells it, which has words of its own for that. */
const resendErrors: Readonly<Record<EmailError, CodeError>> = {
  InvalidEmail: "ResendFailed",
  RateLimited: "ResendLimited",
  RequestFailed: "ResendFailed"
}

/** Check `code`, which the person typed for the address `email` was sent a code at. */
const checkCode = (email: string, code: string) => ({
  model: { form: SignInForm.CheckingCode({ email, code }) },
  commands: [CheckCode({ email, code })]
})

/** Send a code to `email` again, with `code` still in the field until the new one is sent. */
const sendAgain = (email: string, code: string) => ({
  model: { form: SignInForm.ResendingCode({ email, code }) },
  commands: [SendCode({ email })]
})

export const update = SignInComposition.makeUpdate((model, message) => {
  const { form } = model
  /** The form as `step` makes it, or as it is, when the step does not fit where the form has got to. */
  const at = (next: SignInForm | undefined) => ({ model: next === undefined ? model : { form: next } })
  return Message.match(message, {
    TypedEmail: ({ email }) =>
      at(
        SignInForm.matchOrElse(
          form,
          { EnteringEmail: ({ error, notice }) => SignInForm.EnteringEmail({ email, error, notice }) },
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
      SignInForm.matchOrElse(
        form,
        {
          SendingCode: ({ email }) => ({
            model: { form: SignInForm.EnteringCode({ email, code: "", error: Option.none(), isResent: false }) }
          }),
          ResendingCode: ({ email }) => ({
            model: { form: SignInForm.EnteringCode({ email, code: "", error: Option.none(), isResent: true }) },
            commands: [FocusCode()]
          })
        },
        () => ({ model })
      ),
    FailedSendCode: ({ error }) =>
      at(
        SignInForm.matchOrElse(
          form,
          {
            SendingCode: ({ email }) =>
              SignInForm.EnteringEmail({ email, error: Option.some(error), notice: Option.none() }),
            ResendingCode: ({ email, code }) =>
              SignInForm.EnteringCode({ email, code, error: Option.some(resendErrors[error]), isResent: false })
          },
          () => undefined
        )
      ),
    ClickedChangeEmail: () =>
      at(
        SignInForm.matchOrElse(
          form,
          {
            EnteringCode: ({ email }) =>
              SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.none() })
          },
          () => undefined
        )
      ),
    ClickedSendAgain: () =>
      SignInForm.matchOrElse(form, { EnteringCode: ({ email, code }) => sendAgain(email, code) }, () => ({ model })),
    TypedCode: ({ code }) =>
      at(
        SignInForm.matchOrElse(
          form,
          {
            EnteringCode: ({ email, error, isResent }) => SignInForm.EnteringCode({ email, code, error, isResent }),
            ResendingCode: ({ email }) => SignInForm.ResendingCode({ email, code })
          },
          () => undefined
        )
      ),
    CompletedCode: ({ code }) =>
      SignInForm.matchOrElse(
        form,
        {
          EnteringCode: ({ email }) => checkCode(email, code),
          ResendingCode: ({ email }) => ({ model: { form: SignInForm.ResendingCode({ email, code }) } })
        },
        () => ({ model })
      ),
    SubmittedCode: () =>
      SignInForm.matchOrElse(form, { EnteringCode: ({ email, code }) => checkCode(email, code) }, () => ({ model })),
    SucceededSignIn: ({ session }) =>
      SignInForm.matchOrElse(
        form,
        {
          CheckingCode: ({ email }) => ({
            model: { form: SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.none() }) },
            outMessage: OutMessage.SignedIn({ session })
          })
        },
        () => ({ model })
      ),
    FailedSignIn: ({ error }) =>
      at(
        SignInForm.matchOrElse(
          form,
          {
            CheckingCode: ({ email, code }) =>
              SignInForm.EnteringCode({ email, code, error: Option.some(error), isResent: false })
          },
          () => undefined
        )
      ),
    CompletedFocusCode: () => ({ model })
  })
})
