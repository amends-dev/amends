/**
 * Development sign-in: six-digit codes kept in the process's memory and delivered by logging them,
 * and a session whose token is the account's human ID, which `DevelopmentSessionTokens` trusts.
 * Restarting the process discards pending codes. Nothing verifies that the person controls the
 * address, so tests and scripts use it to sign in as anyone.
 *
 * @since 0.1.0
 */

import { Accounts, SignIn } from "@amends-dev/gateway"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

interface PendingCode {
  readonly code: SignIn.Code
  readonly expiresAt: DateTime.Utc
  delivered: boolean
}

/**
 * How a code reaches the person; development logs it where the server runs.
 *
 * @category models
 * @since 0.1.0
 */
export type DeliverCode = (email: Accounts.Email, code: SignIn.Code) => Effect.Effect<void>

/**
 * Deliver a code by logging it, with its address, where the server runs: what `make` and `layer`
 * deliver with when given nothing else.
 *
 * @category utils
 * @since 0.1.0
 */
export const logCode: DeliverCode = (email, code) => Effect.logInfo(`Sign-in code for ${email}: ${code}`)

/**
 * Codes expire ten minutes after issuance.
 *
 * @category utils
 * @since 0.1.0
 */
export const codeLifetime = Duration.minutes(10)

/**
 * The sign-in methods development offers: email codes alone, with no providers.
 *
 * @category utils
 * @since 0.1.0
 */
export const methods: SignIn.Methods = { emailCode: true, providers: [] }

/**
 * Make development sign-in, delivering codes with `deliver`. Codes live in memory and expire after
 * ten minutes; a code works once, after its delivery succeeds, and a new request replaces the
 * address's pending one. The session token is the human ID of the address's account, which the
 * host finds or creates, and which development session tokens trust. Nothing here verifies that
 * the person controls the address.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fnUntraced(function* (
  deliver: DeliverCode = logCode
): Effect.fn.Return<SignIn.SignIn["Service"], never, Crypto.Crypto | Accounts.Accounts> {
  const crypto = yield* Crypto.Crypto
  const accounts = yield* Accounts.Accounts
  const pending = new Map<Accounts.Email, PendingCode>()
  const start: SignIn.SignIn["Service"]["start"] = Effect.fn("DevelopmentSignIn.start")(function* (email) {
    const bytes = yield* Effect.orDie(crypto.randomBytes(4))
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const code = yield* Schema.decodeEffect(SignIn.Code)(String(view.getUint32(0) % 1_000_000).padStart(6, "0")).pipe(
      Effect.orDie
    )
    const entry: PendingCode = {
      code,
      expiresAt: DateTime.addDuration(yield* DateTime.now, codeLifetime),
      delivered: false
    }
    yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        pending.set(email, entry)
        yield* restore(Effect.suspend(() => deliver(email, code))).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (Exit.isSuccess(exit)) entry.delivered = true
              else if (pending.get(email) === entry) pending.delete(email)
            })
          )
        )
      })
    )
  })
  const complete: SignIn.SignIn["Service"]["complete"] = Effect.fn("DevelopmentSignIn.complete")(
    function* (email, code) {
      // Reading time can suspend. Look up and consume the code together afterwards.
      const now = yield* DateTime.now
      const found = pending.get(email)
      if (found === undefined || !found.delivered) return yield* new SignIn.Rejected({ reason: "unknown" })
      if (!DateTime.isGreaterThan(found.expiresAt, now)) {
        pending.delete(email)
        return yield* new SignIn.Rejected({ reason: "expired" })
      }
      if (found.code !== code) return yield* new SignIn.Rejected({ reason: "mismatch" })
      pending.delete(email)
      const account = yield* accounts.findOrCreate(email)
      return { token: account.id, account }
    }
  )
  return SignIn.SignIn.of({ methods, start, complete })
})

/**
 * Provide development sign-in with fresh pending codes for each acquisition.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (deliver?: DeliverCode) => Layer.effect(SignIn.SignIn, make(deliver))
