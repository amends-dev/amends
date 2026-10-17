import { Accounts, SignIn } from "@amends-dev/gateway"
import { BunCrypto, BunHttpServer } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Logger, Redacted } from "effect"
import { Base64 } from "effect/encoding"
import { HttpRouter } from "effect/http"
import * as EmailAuthentication from "../../src/EmailAuthentication.ts"
import * as LocalConfig from "../../src/LocalConfig.ts"
import * as LocalHost from "../../src/LocalHost.ts"
import * as LocalServer from "../../src/LocalServer.ts"
import { client } from "../client.ts"
import { setup } from "../database.ts"

const ada = Accounts.Email.make("ada@example.com")
const credentialKey = Redacted.make(Base64.encode(crypto.getRandomValues(new Uint8Array(32))))
/** The real routes and host with email sign-in over PostgreSQL, and what the host logged. */
const server = (url: string) => {
  const logged: Array<string> = []
  const capture = Logger.make(({ message }) => {
    logged.push(Array.isArray(message) ? message.join(" ") : String(message))
  })
  const layer = HttpRouter.serve(LocalServer.layerRoutes, {
    disableLogger: true,
    disableListenLog: true
  }).pipe(
    Layer.provide(
      EmailAuthentication.layer(credentialKey).pipe(
        Layer.provide(BunCrypto.layer),
        Layer.provideMerge(LocalHost.layer(Redacted.make(url), { credentialKey }))
      )
    ),
    Layer.provide(Logger.layer([capture])),
    Layer.provideMerge(BunHttpServer.layerTest)
  )
  /** The code in the last email logged to the address. */
  const lastCode = (email: Accounts.Email) => {
    const line = logged.findLast((line) => line.startsWith(`Email to ${email}:`))!
    return SignIn.Code.make(/\b\d{6}\b/.exec(line)![0])
  }
  return { layer, lastCode }
}

it("hosts over one credential key derive the same secret for a purpose, and another for another", () => {
  const key = Redacted.make(Base64.encode(new Uint8Array(32).fill(1)))
  expect(LocalConfig.deriveSecret(key, "amends/sign-in-codes")).toEqual(
    LocalConfig.deriveSecret(key, "amends/sign-in-codes")
  )
  expect(LocalConfig.deriveSecret(key, "amends/sign-in-codes")).not.toEqual(
    LocalConfig.deriveSecret(key, "amends/opencode-bridge")
  )
  expect(LocalConfig.deriveSecret(undefined, "amends/sign-in-codes")).toHaveLength(32)
})

const { available, withDatabase } = setup()
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("email sign-in logs a code, which begins a session that signing out ends", () =>
    withDatabase((url) => {
      const fixture = server(url)
      return Effect.gen(function* () {
        const guest = yield* client("")
        expect(yield* guest.session.methods()).toEqual({ emailCode: true, providers: [] })
        yield* guest.session.start({ payload: { email: ada } })
        expect(yield* Effect.flip(guest.session.start({ payload: { email: ada } }))).toMatchObject({
          _tag: "SignIn.Limited"
        })
        const code = fixture.lastCode(ada)
        const wrong = SignIn.Code.make(code === "000000" ? "000001" : "000000")
        expect(yield* Effect.flip(guest.session.complete({ payload: { email: ada, code: wrong } }))).toMatchObject({
          _tag: "SignIn.Rejected",
          reason: "mismatch"
        })
        const session = yield* guest.session.complete({ payload: { email: ada, code } })
        expect(session.account.email).toBe(ada)
        expect(session.token).not.toBe(session.account.id)

        const asAda = yield* client(session.token)
        expect(yield* asAda.me.account()).toEqual(session.account)
        // A human ID is not a token, as development sign-in would take it.
        const byId = yield* client(session.account.id)
        expect(yield* Effect.flip(byId.me.account())).toMatchObject({
          _tag: "Authentication.Unauthorized"
        })
        yield* asAda.me.signOut()
        expect(yield* Effect.flip(asAda.me.account())).toMatchObject({
          _tag: "Authentication.Unauthorized"
        })
      }).pipe(Effect.scoped, Effect.provide(fixture.layer))
    })
  )
})
