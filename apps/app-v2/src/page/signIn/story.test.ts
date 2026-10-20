import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import { session } from "../../../test/fixtures.ts"
import { CheckCode, FocusCode, SendCode } from "./command.ts"
import { Message, OutMessage, SignInForm } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const email = "alex@mercier.example"

/** The code step, as it is once the code was sent. */
const awaitingCode = {
  form: SignInForm.EnteringCode({ email, code: "04", error: Option.none(), isResent: false })
}

describe("signing in", () => {
  it("asks for a code to be sent, and waits for the code it sent", () => {
    story(
      update,
      given(init("").model),
      message(Message.TypedEmail({ email })),
      message(Message.SubmittedEmail()),
      Command.expectExact(SendCode({ email })),
      model((model) => {
        expect(model.form).toEqual(SignInForm.SendingCode({ email }))
      }),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringCode({ email, code: "", error: Option.none(), isResent: false }))
      })
    )
  })

  it("starts with the notice it is given over the email step, keeps it as the address is typed, and drops it when the address is sent", () => {
    const notice = "Your session has ended. Sign in again."

    story(
      update,
      given(init(email, notice).model),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.some(notice) })
        )
      }),
      message(Message.TypedEmail({ email: "alex@mercier.example.com" })),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringEmail({
            email: "alex@mercier.example.com",
            error: Option.none(),
            notice: Option.some(notice)
          })
        )
      }),
      message(Message.SubmittedEmail()),
      Command.expectExact(SendCode({ email: "alex@mercier.example.com" })),
      model((model) => {
        expect(model.form).toEqual(SignInForm.SendingCode({ email: "alex@mercier.example.com" }))
      }),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "RequestFailed" })),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringEmail({
            email: "alex@mercier.example.com",
            error: Option.some("RequestFailed"),
            notice: Option.none()
          })
        )
      })
    )
  })

  it("starts with no notice unless it is given one", () => {
    expect(init(email).model.form).toEqual(
      SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.none() })
    )
  })

  it("goes back to the email step with the address kept when the person changes it", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.ClickedChangeEmail()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.none() }))
      })
    )
  })

  it("keeps the address, the code typed so far, and the form while a new code is asked for, and moves focus to the code once it is sent", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.ClickedSendAgain()),
      Command.expectExact(SendCode({ email })),
      model((model) => {
        expect(model.form).toEqual(SignInForm.ResendingCode({ email, code: "04" }))
      }),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      Command.expectExact(FocusCode()),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringCode({ email, code: "", error: Option.none(), isResent: true }))
      }),
      Command.resolve(FocusCode, Message.CompletedFocusCode())
    )
  })

  it("does not say a new code was sent for the first one", () => {
    story(
      update,
      given({ form: SignInForm.SendingCode({ email }) }),
      message(Message.SucceededSendCode()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringCode({ email, code: "", error: Option.none(), isResent: false }))
      })
    )
  })

  it("stops saying a new code was sent once the person asks for the code to be checked", () => {
    story(
      update,
      given({ form: SignInForm.EnteringCode({ email, code: "04281", error: Option.none(), isResent: true }) }),
      message(Message.TypedCode({ code: "042816" })),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringCode({ email, code: "042816", error: Option.none(), isResent: true })
        )
      }),
      message(Message.SubmittedCode()),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "Mismatch" })),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringCode({ email, code: "042816", error: Option.some("Mismatch"), isResent: false })
        )
      })
    )
  })

  it("goes back to the code step with why, and the code kept, when the new code could not be sent", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.ClickedSendAgain()),
      Command.expectExact(SendCode({ email })),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "RateLimited" })),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringCode({ email, code: "04", error: Option.some("ResendLimited"), isResent: false })
        )
      }),
      message(Message.ClickedSendAgain()),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "RequestFailed" })),
      model((model) => {
        expect(model.form).toEqual(
          SignInForm.EnteringCode({ email, code: "04", error: Option.some("ResendFailed"), isResent: false })
        )
      })
    )
  })

  it("keeps what is typed in the code while a new code is asked for, and does not check it until the new code is in", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.ClickedSendAgain()),
      model((model) => {
        expect(update(model, Message.TypedCode({ code: "0428" })).model.form).toEqual(
          SignInForm.ResendingCode({ email, code: "0428" })
        )
        expect(update(model, Message.CompletedCode({ code: "042816" })).model.form).toEqual(
          SignInForm.ResendingCode({ email, code: "042816" })
        )
        expect(update(model, Message.CompletedCode({ code: "042816" })).commands).toBeUndefined()
        expect(update(model, Message.SubmittedCode()).commands).toBeUndefined()
        expect(update(model, Message.ClickedSendAgain()).commands).toBeUndefined()
        expect(update(model, Message.ClickedChangeEmail()).model).toEqual(model)
      }),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      Command.resolve(FocusCode, Message.CompletedFocusCode())
    )
  })

  it("keeps the address and the code while the code is checked, and asks nothing more of the host", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.CompletedCode({ code: "042816" })),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      model((model) => {
        expect(model.form).toEqual(SignInForm.CheckingCode({ email, code: "042816" }))
        expect(update(model, Message.TypedCode({ code: "0" })).model).toEqual(model)
        expect(update(model, Message.CompletedCode({ code: "123456" })).commands).toBeUndefined()
        expect(update(model, Message.SubmittedCode()).commands).toBeUndefined()
        expect(update(model, Message.ClickedSendAgain()).commands).toBeUndefined()
        expect(update(model, Message.ClickedChangeEmail()).model).toEqual(model)
      }),
      Command.resolve(CheckCode, Message.SucceededSignIn({ session }))
    )
  })

  it("reports the session a right code gives, and leaves the form on the address", () => {
    story(
      update,
      given(awaitingCode),
      message(Message.SubmittedCode()),
      Command.resolve(CheckCode, Message.SucceededSignIn({ session })),
      expectOutMessage(OutMessage.SignedIn({ session })),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.none() }))
      })
    )
  })

  it("keeps the address typed while a code is asked for, and ignores typing in the email until the request ends", () => {
    story(
      update,
      given({ form: SignInForm.SendingCode({ email }) }),
      model((model) => {
        expect(update(model, Message.TypedEmail({ email: "other@mercier.example" })).model).toEqual(model)
        expect(update(model, Message.SubmittedEmail()).commands).toBeUndefined()
      })
    )
  })

  it("says nothing in the code step of an email request that fails after the person went back", () => {
    story(
      update,
      given({ form: SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.none() }) }),
      message(Message.FailedSendCode({ error: "RateLimited" })),
      message(Message.FailedSignIn({ error: "Expired" })),
      message(Message.SucceededSendCode()),
      message(Message.SucceededSignIn({ session })),
      model((model) => {
        expect(model.form).toEqual(SignInForm.EnteringEmail({ email, error: Option.none(), notice: Option.none() }))
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
