import { Identity } from "@amends-dev/core/identity"
import { Accounts, EmailSender, EmailSignIn, SessionTokens, SignIn } from "@amends-dev/gateway"
import type { Storage } from "@amends-dev/gateway/conformance"
import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { withStorage } from "./fixture.ts"

const ada = Accounts.Email.make("ada@example.com")
const bob = Accounts.Email.make("bob@example.com")
const client = "203.0.113.7"
const codeKey = Redacted.make(new Uint8Array(32).fill(7))

/** A code that is not `code`. */
const otherThan = (code: SignIn.Code) => SignIn.Code.make(code === "000000" ? "000001" : "000000")

/**
 * Email sign-in on a new host over the storage, as a separate process would run it, with the
 * emails it sent. Its provider refuses every email while `refusing` is set.
 */
const connectSignIn = (storage: Storage) =>
  Effect.gen(function* () {
    const sent: Array<EmailSender.Message> = []
    const provider = { refusing: false }
    const emailSender = EmailSender.EmailSender.of({
      send: (message) =>
        provider.refusing
          ? Effect.fail(new EmailSender.Undelivered({ description: "The provider is down." }))
          : Effect.sync(() => void sent.push(message))
    })
    const host = yield* storage.connect()
    const context = yield* Layer.build(
      EmailSignIn.layer({ codeKey }).pipe(
        Layer.provide([Layer.succeedContext(host), Layer.succeed(EmailSender.EmailSender, emailSender)])
      )
    )
    const signIn = Context.get(context, SignIn.SignIn)
    const sessionTokens = Context.get(context, SessionTokens.SessionTokens)
    /** The code in the last email this host sent to the address. */
    const lastCode = (email: Accounts.Email) => {
      const text = Redacted.value(sent.findLast((message) => message.to === email)!.text)
      return SignIn.Code.make(/\b\d{6}\b/.exec(text)![0])
    }
    /** Send the address a code and enter it. */
    const signInWithCode = (email: Accounts.Email) =>
      Effect.andThen(signIn.start(email, client), () => signIn.complete(email, lastCode(email)))
    const resolve = (token: string) => sessionTokens.resolve(Redacted.make(token))
    return { signIn, sessionTokens, sent, provider, lastCode, signInWithCode, resolve }
  })

/** Sign-in with emailed codes over the storage: its accounts, limits, and sessions. */
describe("email sign-in", () => {
  it.effect("a code signs in once, as the address's account", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* connectSignIn(storage)
        yield* host.signIn.start(ada, client)
        expect(host.sent).toMatchObject([{ to: ada, subject: "Your sign-in code" }])
        const code = host.lastCode(ada)
        const session = yield* host.signIn.complete(ada, code)
        expect(session.account.email).toBe(ada)
        expect(yield* host.resolve(session.token)).toEqual(
          Identity.Reference.cases.Human.make({ id: session.account.id })
        )
        expect(yield* Effect.flip(host.signIn.complete(ada, code))).toMatchObject({
          _tag: "SignIn.Rejected",
          reason: "unknown"
        })

        // A code that was used leaves nothing to wait for.
        const again = yield* host.signInWithCode(ada)
        expect(again.account).toEqual(session.account)
        expect(again.token).not.toBe(session.token)
        expect((yield* host.signInWithCode(bob)).account.id).not.toBe(session.account.id)
      })
    )
  )

  it.effect("a code stops working after five wrong ones, or ten minutes", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* connectSignIn(storage)
        yield* host.signIn.start(ada, client)
        const code = host.lastCode(ada)
        for (let attempt = 0; attempt < 5; attempt++)
          expect(yield* Effect.flip(host.signIn.complete(ada, otherThan(code)))).toMatchObject({
            reason: "mismatch"
          })
        expect(yield* Effect.flip(host.signIn.complete(ada, code))).toMatchObject({
          reason: "expired"
        })

        yield* host.signIn.start(bob, client)
        yield* TestClock.adjust("10 minutes")
        expect(yield* Effect.flip(host.signIn.complete(bob, host.lastCode(bob)))).toMatchObject({
          reason: "expired"
        })
      })
    )
  )

  it.effect("an address is sent a code at most every thirty seconds, and five an hour", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* connectSignIn(storage)
        yield* host.signIn.start(ada, client)
        const first = host.lastCode(ada)
        expect(yield* Effect.flip(host.signIn.start(ada, client))).toMatchObject({
          _tag: "SignIn.Limited"
        })
        for (let send = 2; send <= 5; send++) {
          yield* TestClock.adjust("30 seconds")
          yield* host.signIn.start(ada, client)
        }
        expect(host.sent).toHaveLength(5)
        yield* TestClock.adjust("30 seconds")
        expect(yield* Effect.flip(host.signIn.start(ada, client))).toMatchObject({
          _tag: "SignIn.Limited"
        })
        // A new code replaces the last; the first no longer works, unless it is the latest too.
        if (first !== host.lastCode(ada))
          expect(yield* Effect.flip(host.signIn.complete(ada, first))).toMatchObject({
            reason: "mismatch"
          })

        yield* TestClock.adjust("1 hour")
        yield* host.signIn.start(ada, client)
        yield* host.signIn.complete(ada, host.lastCode(ada))
      })
    )
  )

  it.effect("a client asks for at most twenty codes an hour, whatever the addresses", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* connectSignIn(storage)
        const address = (index: number) => Accounts.Email.make(`person-${index}@example.com`)
        for (let index = 0; index < 20; index++) yield* host.signIn.start(address(index), client)
        expect(yield* Effect.flip(host.signIn.start(address(20), client))).toMatchObject({
          _tag: "SignIn.Limited"
        })
        yield* host.signIn.start(address(20), "198.51.100.4")
        yield* host.signIn.start(address(21), undefined)
        yield* TestClock.adjust("1 hour")
        yield* host.signIn.start(address(22), client)
      })
    )
  )

  it.effect("a code the provider did not send leaves the address as it was", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* connectSignIn(storage)
        yield* host.signIn.start(ada, client)
        const delivered = host.lastCode(ada)
        yield* TestClock.adjust("30 seconds")
        host.provider.refusing = true
        expect(yield* Effect.flip(host.signIn.start(ada, client))).toMatchObject({
          _tag: "SignIn.Unavailable"
        })
        host.provider.refusing = false
        yield* host.signIn.complete(ada, delivered)
        yield* host.signIn.start(ada, client)
      })
    )
  )

  it.effect("codes and sessions hold across every host over the storage", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const first = yield* connectSignIn(storage)
        const second = yield* connectSignIn(storage)
        yield* first.signIn.start(ada, client)
        expect(yield* Effect.flip(second.signIn.start(ada, client))).toMatchObject({
          _tag: "SignIn.Limited"
        })
        const session = yield* second.signIn.complete(ada, first.lastCode(ada))
        expect(yield* first.resolve(session.token)).toEqual(
          Identity.Reference.cases.Human.make({ id: session.account.id })
        )
        yield* first.sessionTokens.revoke(Redacted.make(session.token))
        expect(yield* Effect.flip(second.resolve(session.token))).toMatchObject({
          _tag: "SessionTokens.Rejected",
          reason: "unknown"
        })
        yield* second.sessionTokens.revoke(Redacted.make(session.token))
      })
    )
  )

  it.effect("a session ends after thirty days unused", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* connectSignIn(storage)
        const session = yield* host.signInWithCode(ada)
        expect(yield* Effect.flip(host.resolve("not-a-token"))).toMatchObject({
          reason: "unknown"
        })
        // Using a session moves its end at most once a day.
        yield* TestClock.adjust("12 hours")
        yield* host.resolve(session.token)
        yield* TestClock.adjust("708 hours")
        expect(yield* Effect.flip(host.resolve(session.token))).toMatchObject({
          reason: "expired"
        })
        expect(yield* Effect.flip(host.resolve(session.token))).toMatchObject({
          reason: "unknown"
        })
      })
    )
  )

  it.effect("a session in use lasts ninety days at most", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* connectSignIn(storage)
        const session = yield* host.signInWithCode(ada)
        for (const days of [29, 29, 29, 2]) {
          yield* TestClock.adjust(`${days} days`)
          yield* host.resolve(session.token)
        }
        yield* TestClock.adjust("1 day")
        expect(yield* Effect.flip(host.resolve(session.token))).toMatchObject({
          reason: "expired"
        })
      })
    )
  )
})
