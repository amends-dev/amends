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
import { CheckCode, FocusCode, SendCode } from "./command.ts"
import { type CodeError, type EmailError, Message, SignInForm } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const email = "alex@mercier.example"

/** The code step, as it is once the code was sent, with `code` typed and `error` said. */
const enteringCode = (code: string, error: Option.Option<CodeError> = Option.none(), isResent = false) => ({
  form: SignInForm.EnteringCode({ email, code, error, isResent })
})

/** The email step with `error` said. */
const enteringEmail = (error: EmailError) => ({
  form: SignInForm.EnteringEmail({ email: "alex", error: Option.some(error), notice: Option.none() })
})

describe("the sign-in page", () => {
  it("asks for an email and sends a code to it, with the form where it was and Continue disabled until the code is sent", () => {
    scene(
      { update, view },
      given(init("").model),
      expect(role("heading", { name: "Sign in to amends", level: 1 })).toExist(),
      expect(text("Use your email to get a one-time code.")).toExist(),
      expect(label("Email")).toHaveAttr("placeholder", "you@example.com"),
      expect(text("Your workspaces appear after you sign in.")).toExist(),
      expect(role("button", { name: "Continue" })).not.toBeDisabled(),
      type(label("Email"), email),
      click(role("button", { name: "Continue" })),
      Command.expectExact(SendCode({ email })),
      expect(role("heading", { name: "Sign in to amends", level: 1 })).toExist(),
      expect(label("Email")).toHaveValue(email),
      expect(role("button", { name: "Continue" })).toBeDisabled(),
      expect(text(`Sending a code to ${email}…`)).toBeAbsent(),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      expect(role("heading", { name: "Enter your code" })).toExist()
    )
  })

  it("says that an address is not one beside the field, which it outlines", () => {
    scene(
      { update, view },
      given(enteringEmail("InvalidEmail")),
      expect(role("alert")).toHaveText("Enter a valid email address."),
      expect(label("Email")).toHaveAttr("aria-invalid", "true"),
      expect(label("Email")).toHaveValue("alex"),
      expect(role("button", { name: "Continue" })).not.toBeDisabled()
    )
  })

  it("says that too many codes were requested, or that the request failed, over the button and not at the field", () => {
    scene(
      { update, view },
      given(enteringEmail("RateLimited")),
      expect(role("alert")).toHaveText("Too many codes were requested lately. Try again later."),
      expect(label("Email")).not.toHaveAttr("aria-invalid")
    )
    scene(
      { update, view },
      given(enteringEmail("RequestFailed")),
      expect(role("alert")).toHaveText("We couldn’t request a code. Try again."),
      expect(label("Email")).not.toHaveAttr("aria-invalid")
    )
  })

  it("takes the form back from the request that failed, with the address kept and why", () => {
    scene(
      { update, view },
      given(init(email).model),
      click(role("button", { name: "Continue" })),
      Command.expectExact(SendCode({ email })),
      expect(role("button", { name: "Continue" })).toBeDisabled(),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "RequestFailed" })),
      expect(role("alert")).toHaveText("We couldn’t request a code. Try again."),
      expect(label("Email")).toHaveValue(email),
      expect(role("button", { name: "Continue" })).not.toBeDisabled()
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

  it("asks for the code that was sent as six cells over one input, and checks it as the sixth digit is typed, with the form where it was", () => {
    scene(
      { update, view },
      given(enteringCode("")),
      expect(role("heading", { name: "Enter your code", level: 1 })).toExist(),
      expect(text("Enter the six-digit code for")).toExist(),
      expect(text(email)).toExist(),
      expect(text("Use your most recent code.")).toExist(),
      expect(label("Verification code")).toHaveAttr("inputmode", "numeric"),
      expect(label("Verification code")).toHaveAttr("autocomplete", "one-time-code"),
      expectAll(all.selector('span[aria-hidden="true"]')).toHaveCount(6),
      type(label("Verification code"), "042816"),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      expect(role("heading", { name: "Enter your code", level: 1 })).toExist(),
      expect(label("Verification code")).toHaveValue("042816"),
      expect(role("button", { name: "Verify code" })).toBeDisabled(),
      expect(role("button", { name: "Send again" })).toBeDisabled(),
      expect(role("button", { name: "Change email" })).toBeDisabled(),
      expect(text("Checking the code…")).toBeAbsent(),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "Mismatch" })),
      expect(role("alert")).toHaveText("That code doesn’t match. Check it and try again."),
      expect(label("Verification code")).toHaveValue("042816"),
      expect(selector("[data-invalid]")).toExist(),
      expect(role("button", { name: "Verify code" })).not.toBeDisabled(),
      expect(role("button", { name: "Send again" })).not.toBeDisabled()
    )
  })

  it("keeps the digits typed, and checks nothing until the sixth is in", () => {
    scene(
      { update, view },
      given(enteringCode("")),
      type(label("Verification code"), "04 28-x"),
      Command.expectNone(),
      expect(label("Verification code")).toHaveValue("0428"),
      expect(nth(all.selector('span[aria-hidden="true"]'), 0)).toHaveText("0"),
      expect(nth(all.selector('span[aria-hidden="true"]'), 3)).toHaveText("8"),
      expect(nth(all.selector('span[aria-hidden="true"]'), 4)).toHaveText("")
    )
  })

  it("disables Verify code until all six digits are in, and checks the code from it then", () => {
    scene(
      { update, view },
      given(enteringCode("")),
      expect(role("button", { name: "Verify code" })).toBeDisabled(),
      type(label("Verification code"), "0428"),
      expect(role("button", { name: "Verify code" })).toBeDisabled()
    )
    scene(
      { update, view },
      given(enteringCode("042816")),
      expect(role("button", { name: "Verify code" })).not.toBeDisabled(),
      click(role("button", { name: "Verify code" })),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      expect(role("button", { name: "Verify code" })).toBeDisabled(),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "Expired" })),
      expect(role("button", { name: "Verify code" })).not.toBeDisabled()
    )
  })

  it("checks a code pasted whole at once, whatever separates its digits", () => {
    scene(
      { update, view },
      given(enteringCode("")),
      type(label("Verification code"), "042 816"),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "Mismatch" })),
      expect(label("Verification code")).toHaveValue("042816")
    )
  })

  const codeErrors = [
    ["InvalidCode", "Enter all six digits."],
    ["Mismatch", "That code doesn’t match. Check it and try again."],
    ["Expired", "This code has expired. Request a new one."],
    ["Unknown", "This code is no longer available. Request a new one."]
  ] as const satisfies ReadonlyArray<readonly [CodeError, string]>

  for (const [error, words] of codeErrors) {
    it(`says ${error === "InvalidCode" ? "that the code is short" : `why the code is refused, ${error}`} beside the field, which it outlines`, () => {
      scene(
        { update, view },
        given(enteringCode("000000", Option.some(error))),
        expect(role("alert")).toHaveText(words),
        expect(label("Verification code")).toHaveAttr("aria-invalid", "true"),
        expect(selector("[data-invalid]")).toExist()
      )
    })
  }

  const requestErrors = [
    ["VerifyFailed", "We couldn’t verify your code. Try again."],
    ["ResendLimited", "Too many codes were requested lately. Use the last one, or try later."],
    ["ResendFailed", "We couldn’t request a new code. Try again."]
  ] as const satisfies ReadonlyArray<readonly [CodeError, string]>

  for (const [error, words] of requestErrors) {
    it(`says that a request failed, ${error}, over the button, and leaves the code valid`, () => {
      scene(
        { update, view },
        given(enteringCode("000000", Option.some(error))),
        expect(role("alert")).toHaveText(words),
        expect(label("Verification code")).not.toHaveAttr("aria-invalid"),
        expect(selector("[data-invalid]")).toBeAbsent()
      )
    })
  }

  it("returns to the email step with the address kept when the person changes it", () => {
    scene(
      { update, view },
      given(enteringCode("04")),
      click(role("button", { name: "Change email" })),
      expect(role("heading", { name: "Sign in to amends" })).toExist(),
      expect(label("Email")).toHaveValue(email)
    )
  })

  it("sends another code to the same address when the person asks again, with the form where it was and Send again disabled", () => {
    scene(
      { update, view },
      given(enteringCode("04")),
      expect(text("Need a new code?")).toExist(),
      expect(role("button", { name: "Send again" })).not.toBeDisabled(),
      click(role("button", { name: "Send again" })),
      Command.expectExact(SendCode({ email })),
      expect(role("heading", { name: "Enter your code" })).toExist(),
      expect(label("Verification code")).toHaveValue("04"),
      expect(role("button", { name: "Send again" })).toBeDisabled(),
      expect(role("button", { name: "Verify code" })).toBeDisabled(),
      expect(text(`Sending a code to ${email}…`)).toBeAbsent(),
      expect(role("status")).toHaveText(""),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "RequestFailed" }))
    )
  })

  it("says that a new code was sent once it is, moves focus to the code, and clears what was typed", () => {
    scene(
      { update, view },
      given(enteringCode("042816")),
      click(role("button", { name: "Send again" })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      Command.expectExact(FocusCode()),
      expect(role("status")).toHaveText("We sent a new code. Use the latest one."),
      expect(label("Verification code")).toHaveValue(""),
      expect(role("button", { name: "Send again" })).not.toBeDisabled(),
      expect(role("button", { name: "Verify code" })).toBeDisabled(),
      Command.resolve(FocusCode, Message.CompletedFocusCode())
    )
  })

  it("has the place for what a new code says on the page before it says anything, and not after the person checks a code", () => {
    scene(
      { update, view },
      given(enteringCode("04")),
      expect(role("status")).toHaveText(""),
      click(role("button", { name: "Send again" })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      Command.resolve(FocusCode, Message.CompletedFocusCode()),
      expect(role("status")).toHaveText("We sent a new code. Use the latest one."),
      type(label("Verification code"), "042816"),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "Mismatch" })),
      expect(role("status")).toHaveText("")
    )
  })

  it("says why a new code could not be sent over the button, with the code that was typed kept", () => {
    scene(
      { update, view },
      given(enteringCode("04")),
      click(role("button", { name: "Send again" })),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "RateLimited" })),
      expect(role("alert")).toHaveText("Too many codes were requested lately. Use the last one, or try later."),
      expect(label("Verification code")).toHaveValue("04"),
      expect(label("Verification code")).not.toHaveAttr("aria-invalid"),
      expect(role("button", { name: "Send again" })).not.toBeDisabled(),
      click(role("button", { name: "Send again" })),
      Command.resolve(SendCode, Message.FailedSendCode({ error: "RequestFailed" })),
      expect(role("alert")).toHaveText("We couldn’t request a new code. Try again.")
    )
  })
})
