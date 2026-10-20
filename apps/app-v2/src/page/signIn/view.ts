import { copy, heading, screenContent } from "@amends-dev/design/centered"
import { announcement, button, codeInput, field, hint, notice, submit } from "@amends-dev/design/control"
import { form, inline, valueWithAction } from "@amends-dev/design/form"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { codeFieldId } from "./command.ts"
import { SignInComposition, type SignInViewBuilder } from "./composition.ts"
import { type CodeError, codeLength, type EmailError, Message, SignInForm } from "./definition.ts"
import { codeProblem, emailProblem, resentNotice } from "./wording.ts"

/**
 * The email step: the address, why a code was not requested if it was not, at the field for an address that is not
 * one and over the button for a request that failed, and Continue, which is disabled while the code is being asked
 * for. `aboveForm` is what the person is told over the form, such as that a session ended.
 */
const emailStep = (
  h: SignInViewBuilder,
  step: Readonly<{
    email: string
    error: Option.Option<EmailError>
    aboveForm: Option.Option<string>
    isSending: boolean
  }>
): Html => {
  const problem = emailProblem(step.error)

  return screenContent(h, [
    heading(h, "Sign in to amends"),
    copy(h, "Use your email to get a one-time code."),
    form(h, { onSubmit: Message.SubmittedEmail(), label: "Sign in" }, [
      notice(h, step.aboveForm, { tone: "caution" }),
      field(
        h,
        {
          id: "email",
          label: "Email",
          type: "email",
          value: step.email,
          placeholder: "you@example.com",
          onInput: (email) => Message.TypedEmail({ email })
        },
        problem.atField
      ),
      notice(h, problem.aboveButton),
      submit(h, "Continue", { size: "large", wide: true, isDisabled: step.isSending }),
      hint(h, "Your workspaces appear after you sign in.")
    ])
  ])
}

/** What is under way on the code step: nothing, a new code being asked for, or the code being checked. */
type CodeProgress = "Idle" | "Resending" | "Checking"

/**
 * The code step: the address it went to, with the way to change it, the code, why it was not accepted if it was not,
 * at the field for a code that is wrong and over the button for a request that failed, Verify code, which is disabled
 * until all the digits are in and while a code is asked for or checked, what a new code just sent says, and Send
 * again, which is disabled while either is under way.
 */
const codeStep = (
  h: SignInViewBuilder,
  step: Readonly<{
    email: string
    code: string
    error: Option.Option<CodeError>
    isResent: boolean
    progress: CodeProgress
  }>
): Html => {
  const problem = codeProblem(step.error)
  const isBusy = step.progress !== "Idle"

  return screenContent(h, [
    heading(h, "Enter your code"),
    copy(h, "Enter the six-digit code for"),
    valueWithAction(
      h,
      step.email,
      button(h, "Change email", Message.ClickedChangeEmail(), { variant: "link", isDisabled: isBusy })
    ),
    form(h, { onSubmit: Message.SubmittedCode(), label: "Verification" }, [
      codeInput(
        h,
        {
          id: codeFieldId,
          label: "Verification code",
          value: step.code,
          hint: "Use your most recent code.",
          onInput: (code) => Message.TypedCode({ code }),
          onComplete: (code) => Message.CompletedCode({ code })
        },
        problem.atField
      ),
      notice(h, problem.aboveButton),
      submit(h, "Verify code", {
        size: "large",
        wide: true,
        isDisabled: step.code.length < codeLength || isBusy
      }),
      announcement(h, step.isResent ? Option.some(resentNotice) : Option.none()),
      inline(h, [
        "Need a new code?",
        button(h, "Send again", Message.ClickedSendAgain(), { variant: "link", isDisabled: isBusy })
      ])
    ])
  ])
}

export const view = SignInComposition.makeView((model, h) =>
  SignInForm.match(model.form, {
    EnteringEmail: ({ email, error, notice: aboveForm }) => emailStep(h, { email, error, aboveForm, isSending: false }),
    SendingCode: ({ email }) =>
      emailStep(h, { email, error: Option.none(), aboveForm: Option.none(), isSending: true }),
    EnteringCode: ({ email, code, error, isResent }) => codeStep(h, { email, code, error, isResent, progress: "Idle" }),
    ResendingCode: ({ email, code }) =>
      codeStep(h, { email, code, error: Option.none(), isResent: false, progress: "Resending" }),
    CheckingCode: ({ email, code }) =>
      codeStep(h, { email, code, error: Option.none(), isResent: false, progress: "Checking" })
  })
)
