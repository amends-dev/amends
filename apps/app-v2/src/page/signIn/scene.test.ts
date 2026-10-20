import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
  all,
  click,
  expect,
  expectAll,
  given,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  within
} from "foldkit/scene"
import { CheckCode, SendCode } from "./command.ts"
import { Message, SignInForm } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const email = "alex@mercier.example"

describe("the sign-in page", () => {
  it("asks for an email and sends a code to it", () => {
    scene(
      { update, view },
      given(init("").model),
      expect(role("heading", { name: "Sign in to amends", level: 1 })).toExist(),
      expect(text("Use your email to get a one-time code.")).toExist(),
      expect(label("Email")).toHaveAttr("placeholder", "you@example.com"),
      expect(text("Your workspaces appear after you sign in.")).toExist(),
      type(label("Email"), email),
      click(role("button", { name: "Continue" })),
      Command.expectExact(SendCode({ email })),
      expect(text(`Sending a code to ${email}…`)).toExist(),
      expect(role("button", { name: "Continue" })).toBeAbsent(),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      expect(role("heading", { name: "Enter your code" })).toExist()
    )
  })

  it("says why an email was refused beside the field", () => {
    scene(
      { update, view },
      given({
        form: SignInForm.EnteringEmail({
          email: "alex",
          error: Option.some("Enter an email address."),
          notice: Option.none()
        })
      }),
      expect(role("alert")).toHaveText("Enter an email address."),
      expect(label("Email")).toHaveAttr("aria-invalid", "true"),
      expect(label("Email")).toHaveValue("alex")
    )
  })

  it("says over the form what it was given to say, keeps it while the address is typed, and drops it once the address is sent", () => {
    scene(
      { update, view },
      given(init(email, "Your session has ended. Sign in again.").model),
      expect(role("alert")).toHaveText("Your session has ended. Sign in again."),
      expect(within(role("form", { name: "Sign in" }), role("alert"))).toExist(),
      expect(label("Email")).toHaveValue(email),
      type(label("Email"), "alex@mercier.example.com"),
      expect(role("alert")).toHaveText("Your session has ended. Sign in again."),
      click(role("button", { name: "Continue" })),
      Command.expectExact(SendCode({ email: "alex@mercier.example.com" })),
      expect(role("alert")).toBeAbsent(),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      click(role("button", { name: "Change email" })),
      expect(role("heading", { name: "Sign in to amends" })).toExist(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("says nothing over the form when it was given nothing to say", () => {
    scene({ update, view }, given(init(email).model), expect(role("alert")).toBeAbsent())
  })

  it("asks for the code that was sent as six cells over one input, and checks it as the sixth digit is typed", () => {
    scene(
      { update, view },
      given({ form: SignInForm.EnteringCode({ email, code: "", error: Option.none() }) }),
      expect(role("heading", { name: "Enter your code", level: 1 })).toExist(),
      expect(text("Enter the six-digit code for")).toExist(),
      expect(text(email)).toExist(),
      expect(text("Use your most recent code.")).toExist(),
      expect(label("Verification code")).toHaveAttr("inputmode", "numeric"),
      expect(label("Verification code")).toHaveAttr("autocomplete", "one-time-code"),
      expectAll(all.selector('span[aria-hidden="true"]')).toHaveCount(6),
      type(label("Verification code"), "042816"),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      expect(text("Checking the code…")).toExist(),
      expect(role("button", { name: "Verify code" })).toBeAbsent(),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "That code is wrong or has expired." })),
      expect(role("alert")).toHaveText("That code is wrong or has expired."),
      expect(label("Verification code")).toHaveValue("042816"),
      expect(selector("[data-invalid]")).toExist()
    )
  })

  it("keeps the digits typed, and checks nothing until the sixth is in", () => {
    scene(
      { update, view },
      given({ form: SignInForm.EnteringCode({ email, code: "", error: Option.none() }) }),
      type(label("Verification code"), "04 28-x"),
      Command.expectNone(),
      expect(label("Verification code")).toHaveValue("0428"),
      expect(nth(all.selector('span[aria-hidden="true"]'), 0)).toHaveText("0"),
      expect(nth(all.selector('span[aria-hidden="true"]'), 3)).toHaveText("8"),
      expect(nth(all.selector('span[aria-hidden="true"]'), 4)).toHaveText("")
    )
  })

  it("checks the code from the button too, for a code typed in pieces", () => {
    scene(
      { update, view },
      given({ form: SignInForm.EnteringCode({ email, code: "0428", error: Option.none() }) }),
      click(role("button", { name: "Verify code" })),
      Command.expectExact(CheckCode({ email, code: "0428" })),
      expect(text("Checking the code…")).toExist(),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "Enter the six digits of the code." })),
      expect(role("alert")).toHaveText("Enter the six digits of the code.")
    )
  })

  it("checks a code pasted whole at once, whatever separates its digits", () => {
    scene(
      { update, view },
      given({ form: SignInForm.EnteringCode({ email, code: "", error: Option.none() }) }),
      type(label("Verification code"), "042 816"),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "That code is wrong or has expired." })),
      expect(label("Verification code")).toHaveValue("042816")
    )
  })

  it("says why a code was refused beside the field", () => {
    scene(
      { update, view },
      given({
        form: SignInForm.EnteringCode({
          email,
          code: "000000",
          error: Option.some("That code is wrong or has expired.")
        })
      }),
      expect(role("alert")).toHaveText("That code is wrong or has expired."),
      expect(label("Verification code")).toHaveAttr("aria-invalid", "true")
    )
  })

  it("returns to the email step with the address kept when the person changes it", () => {
    scene(
      { update, view },
      given({ form: SignInForm.EnteringCode({ email, code: "04", error: Option.none() }) }),
      click(role("button", { name: "Change email" })),
      expect(role("heading", { name: "Sign in to amends" })).toExist(),
      expect(label("Email")).toHaveValue(email)
    )
  })

  it("sends another code to the same address when the person asks again", () => {
    scene(
      { update, view },
      given({ form: SignInForm.EnteringCode({ email, code: "04", error: Option.none() }) }),
      expect(text("Need a new code?")).toExist(),
      click(role("button", { name: "Send again" })),
      Command.expectExact(SendCode({ email })),
      expect(text(`Sending a code to ${email}…`)).toExist(),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      expect(role("heading", { name: "Enter your code" })).toExist(),
      expect(label("Verification code")).toHaveValue("")
    )
  })
})
