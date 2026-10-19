import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, click, expect, given, label, role, scene, text, type } from "foldkit/scene"
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
      given({ form: SignInForm.EnteringEmail({ email: "alex", error: Option.some("Enter an email address.") }) }),
      expect(role("alert")).toHaveText("Enter an email address."),
      expect(label("Email")).toHaveAttr("aria-invalid", "true"),
      expect(label("Email")).toHaveValue("alex")
    )
  })

  it("asks for the code that was sent, and checks it", () => {
    scene(
      { update, view },
      given({ form: SignInForm.EnteringCode({ email, code: "", error: Option.none() }) }),
      expect(role("heading", { name: "Enter your code", level: 1 })).toExist(),
      expect(text("Enter the six-digit code for")).toExist(),
      expect(text(email)).toExist(),
      expect(text("Use your most recent code.")).toExist(),
      type(label("Verification code"), "042816"),
      click(role("button", { name: "Verify code" })),
      Command.expectExact(CheckCode({ email, code: "042816" })),
      expect(text("Checking the code…")).toExist(),
      expect(role("button", { name: "Verify code" })).toBeAbsent(),
      Command.resolve(CheckCode, Message.FailedSignIn({ error: "That code is wrong or has expired." })),
      expect(role("alert")).toHaveText("That code is wrong or has expired."),
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
