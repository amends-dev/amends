import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { SendCode } from "./command.ts"
import { Message, SignInForm } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const email = "alex@mercier.example"

/** The code step, as it is once the code was sent. */
const awaitingCode = { form: SignInForm.EnteringCode({ email, code: "04", error: Option.none() }) }

describe("signing in", () => {
  it("asks for a code to be sent, and waits for the code it sent", () => {
    story(
      update,
      given(init("").model),
      message(Message.TypedEmail({ email })),
      message(Message.SubmittedEmail()),
      Command.expectExact(SendCode({ email })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringCode({ email, code: "", error: Option.none() }))
      })
    )
  })

  it("goes back to the email step with the address kept when the person changes it", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.ClickedChangeEmail()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringEmail({ email, error: Option.none() }))
      })
    )
  })

  it("asks for a new code to the same address, and waits for it", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.ClickedSendAgain()),
      Command.expectExact(SendCode({ email })),
      model((model) => {
        expect(model.form).toEqual(SignInForm.SendingCode({ email }))
      }),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringCode({ email, code: "", error: Option.none() }))
      })
    )
  })

  it("goes back to the email step with why when the new code could not be sent", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.ClickedSendAgain()),
      Command.expectExact(SendCode({ email })),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "The code could not be sent. Try again." })),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringEmail({ email, error: Option.some("The code could not be sent. Try again.") })
        )
      })
    )
  })

  it("ignores changing the email or sending again anywhere but the code step", () => {
    const enteringEmail = init(email).model

    story(
      update,
      given(enteringEmail),
      message(Message.ClickedChangeEmail()),
      message(Message.ClickedSendAgain()),
      Command.expectNone(),
      model((model) => {
        expect(model).toEqual(enteringEmail)
      })
    )
  })
})
