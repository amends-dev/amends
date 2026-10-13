import { Identity } from "@amends-dev/core/identity"
import { expect, it } from "@effect/vitest"
import { Crypto, Effect, Layer, Option, Redacted } from "effect"
import { Base64Url } from "effect/encoding"
import * as Accounts from "../src/Accounts.ts"
import * as EmailSender from "../src/EmailSender.ts"
import * as EmailSignIn from "../src/EmailSignIn.ts"
import * as SignIn from "../src/SignIn.ts"
import * as SignInStorage from "../src/SignInStorage.ts"

const ada = Accounts.Email.make("ada@example.com")
const encoder = new TextEncoder()

/** HMAC-SHA256 and SHA-256 as WebCrypto computes them. */
const hmacSha256 = async (key: Uint8Array, message: string) => {
  const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(message)))
}
const sha256 = async (message: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(message)))

const webCrypto = Crypto.make({
  randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) => Effect.promise(async () => new Uint8Array(await crypto.subtle.digest(algorithm, data)))
})

/** Email sign-in over one address's storage, keeping the digests it stores and the emails it sends. */
const signInOver = (codeKey: Uint8Array) => {
  const stored = {
    pending: Option.none<SignInStorage.PendingCode>(),
    sessionDigests: [] as Array<string>,
    sent: [] as Array<EmailSender.Message>
  }
  const layer = EmailSignIn.layer({ codeKey: Redacted.make(codeKey) }).pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(
          SignInStorage.SignInStorage,
          SignInStorage.SignInStorage.of({
            modifyCode: (_email, decide) =>
              Effect.sync(() => {
                const [answer, next] = decide(stored.pending)
                stored.pending = next
                return answer
              }),
            insertSession: (digest) => Effect.sync(() => void stored.sessionDigests.push(digest)),
            findSession: () => Effect.succeedNone,
            extendSession: () => Effect.void,
            deleteSession: () => Effect.void
          })
        ),
        Layer.succeed(
          Accounts.Accounts,
          Accounts.Accounts.of({
            findOrCreate: (email) => Effect.succeed({ id: Identity.HumanId.make("human-ada"), email }),
            findByIds: () => Effect.succeed([])
          })
        ),
        Layer.succeed(
          EmailSender.EmailSender,
          EmailSender.EmailSender.of({
            send: (message) => Effect.sync(() => void stored.sent.push(message))
          })
        ),
        Layer.succeed(Crypto.Crypto, webCrypto)
      )
    )
  )
  return { stored, layer }
}

it.effect.each([32, 100])(
  "codes are stored as HMAC-SHA256 digests under a %i-byte key, and tokens as SHA-256 digests",
  (keyLength) => {
    const codeKey = crypto.getRandomValues(new Uint8Array(keyLength))
    const { stored, layer } = signInOver(codeKey)
    return Effect.gen(function* () {
      const signIn = yield* SignIn.SignIn
      yield* signIn.start(ada, undefined)
      const code = /\b\d{6}\b/.exec(Redacted.value(stored.sent[0]!.text))![0]
      const expected = yield* Effect.promise(() => hmacSha256(codeKey, `${ada}\n${code}`))
      expect(Option.map(stored.pending, (pending) => pending.digest)).toEqual(Option.some(Base64Url.encode(expected)))

      const session = yield* signIn.complete(ada, SignIn.Code.make(code))
      const tokenDigest = yield* Effect.promise(() => sha256(session.token))
      expect(stored.sessionDigests).toEqual([Base64Url.encode(tokenDigest)])
      // 32 random bytes, in unpadded base64url.
      expect(session.token).toMatch(/^[\w-]{43}$/)
    }).pipe(Effect.provide(layer))
  }
)
