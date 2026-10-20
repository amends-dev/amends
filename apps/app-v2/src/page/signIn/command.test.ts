import { SignIn } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { given, message, model, story } from "foldkit/story"
import { session } from "../../../test/fixtures.ts"
import { type Answer, hostAnswering } from "../../../test/host.ts"
import { CheckCode, SendCode } from "./command.ts"
import { Message, SignInForm } from "./definition.ts"
import { update } from "./update.ts"

const email = "alex@mercier.example"

const unreachable = "The host could not be reached. Try again."

const sendCode = (answer: Answer, address: string) => {
  const { sent, layer } = hostAnswering(answer)
  return SendCode({ email: address }).effect.pipe(
    Effect.provide(SendCode.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((outcome) => ({ outcome, sent }))
  )
}

const checkCode = (answer: Answer, code: string) => {
  const { sent, layer } = hostAnswering(answer)
  return CheckCode({ email, code }).effect.pipe(
    Effect.provide(CheckCode.layer.pipe(Layer.provideMerge(layer))),
    Effect.map((outcome) => ({ outcome, sent }))
  )
}

/** The answers that are no answer the contract lists: the client reports them as a defect, or the host is not there. */
const unlisted = [
  ["answers a status the contract does not list", { status: 500, body: { message: "Boom" } }],
  ["cannot be reached", "unreachable"],
  ["makes the client's call die", "dies"]
] as const satisfies ReadonlyArray<readonly [string, Answer]>

describe("SendCode", () => {
  it.effect("asks the host to send a code to the address, and reports that it did", () =>
    Effect.gen(function* () {
      const { outcome, sent } = yield* sendCode({ status: 202, body: null }, email)

      expect(sent.map(({ path, payload }) => ({ path, payload }))).toEqual([
        { path: "/session/email", payload: { email } }
      ])
      expect(outcome).toEqual(Message.SucceededSendCode())
    })
  )

  it.effect("sends nothing for what is no address", () =>
    Effect.gen(function* () {
      const { outcome, sent } = yield* sendCode({ status: 202, body: null }, "alex")

      expect(sent).toEqual([])
      expect(outcome).toEqual(Message.FailedSendCode({ error: "Enter an email address." }))
    })
  )

  it.effect("says why the host refused, when it answered that it is limited or unavailable", () =>
    Effect.gen(function* () {
      const limited = yield* sendCode({ status: 429, body: { _tag: "SignIn.Limited" } }, email)
      const unavailable = yield* sendCode({ status: 503, body: { _tag: "SignIn.Unavailable" } }, email)

      expect(limited.outcome).toEqual(
        Message.FailedSendCode({ error: "Too many codes were sent lately. Try again later." })
      )
      expect(unavailable.outcome).toEqual(Message.FailedSendCode({ error: "The code could not be sent. Try again." }))
    })
  )

  for (const [description, answer] of unlisted) {
    it.effect(`ends in a failure, and the form leaves sending, when the host ${description}`, () =>
      Effect.gen(function* () {
        const { outcome } = yield* sendCode(answer, email)

        expect(outcome).toEqual(Message.FailedSendCode({ error: unreachable }))
        story(
          update,
          given({ form: SignInForm.SendingCode({ email }) }),
          message(outcome),
          model((after) => {
            expect(after.form).toEqual(
              SignInForm.EnteringEmail({ email, error: Option.some(unreachable), notice: Option.none() })
            )
          })
        )
      })
    )
  }
})

describe("CheckCode", () => {
  it.effect("exchanges the code for a session, and reports it", () =>
    Effect.gen(function* () {
      const body = yield* Schema.encodeEffect(SignIn.Session)(session)
      const { outcome, sent } = yield* checkCode({ status: 200, body }, "041234")

      expect(sent.map(({ path, payload }) => ({ path, payload }))).toEqual([
        { path: "/session/code", payload: { email, code: "041234" } }
      ])
      expect(outcome).toEqual(Message.SucceededSignIn({ session }))
    })
  )

  it.effect("sends nothing for what is not a code", () =>
    Effect.gen(function* () {
      const { outcome, sent } = yield* checkCode({ status: 200, body: null }, "04")

      expect(sent).toEqual([])
      expect(outcome).toEqual(Message.FailedSignIn({ error: "Enter the six digits of the code." }))
    })
  )

  it.effect("says the code is wrong or expired, when the host rejected it", () =>
    Effect.gen(function* () {
      const { outcome } = yield* checkCode(
        { status: 403, body: { _tag: "SignIn.Rejected", reason: "mismatch" } },
        "041234"
      )

      expect(outcome).toEqual(Message.FailedSignIn({ error: "That code is wrong or has expired." }))
    })
  )

  for (const [description, answer] of unlisted) {
    it.effect(`ends in a failure, and the form leaves checking, when the host ${description}`, () =>
      Effect.gen(function* () {
        const { outcome } = yield* checkCode(answer, "041234")

        expect(outcome).toEqual(Message.FailedSignIn({ error: unreachable }))
        story(
          update,
          given({ form: SignInForm.CheckingCode({ email, code: "041234" }) }),
          message(outcome),
          model((after) => {
            expect(after.form).toEqual(
              SignInForm.EnteringCode({ email, code: "041234", error: Option.some(unreachable) })
            )
          })
        )
      })
    )
  }
})
