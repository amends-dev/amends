import { copy, heading, screenContent } from "@amends-dev/design/centered"
import { button, field, hint, notice, submit } from "@amends-dev/design/control"
import { form, inline, valueWithAction } from "@amends-dev/design/form"
import { SignInComposition } from "./composition.ts"
import { Message, SignInForm } from "./definition.ts"

export const view = SignInComposition.makeView((model, h) =>
  SignInForm.match(model.form, {
    EnteringEmail: ({ email, error, notice: aboveForm }) =>
      screenContent(h, [
        heading(h, "Sign in to amends"),
        copy(h, "Use your email to get a one-time code."),
        form(h, { onSubmit: Message.SubmittedEmail(), label: "Sign in" }, [
          notice(h, aboveForm, { tone: "caution" }),
          field(
            h,
            {
              id: "email",
              label: "Email",
              type: "email",
              value: email,
              placeholder: "you@example.com",
              onInput: (email) => Message.TypedEmail({ email })
            },
            error
          ),
          submit(h, "Continue", { size: "large", wide: true }),
          hint(h, "Your workspaces appear after you sign in.")
        ])
      ]),
    SendingCode: ({ email }) =>
      screenContent(h, [heading(h, "Sign in to amends"), copy(h, `Sending a code to ${email}…`)]),
    EnteringCode: ({ email, code, error }) =>
      screenContent(h, [
        heading(h, "Enter your code"),
        copy(h, "Enter the six-digit code for"),
        valueWithAction(h, email, button(h, "Change email", Message.ClickedChangeEmail(), { variant: "link" })),
        form(h, { onSubmit: Message.SubmittedCode(), label: "Verification" }, [
          field(
            h,
            {
              id: "code",
              label: "Verification code",
              type: "text",
              value: code,
              onInput: (code) => Message.TypedCode({ code })
            },
            error
          ),
          hint(h, "Use your most recent code."),
          submit(h, "Verify code", { size: "large", wide: true }),
          inline(h, ["Need a new code?", button(h, "Send again", Message.ClickedSendAgain(), { variant: "link" })])
        ])
      ]),
    CheckingCode: () => screenContent(h, [heading(h, "Enter your code"), copy(h, "Checking the code…")])
  })
)
