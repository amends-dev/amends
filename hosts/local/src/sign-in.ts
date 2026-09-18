import { Identity } from "@amends/core/identity";
import { Credentials, SignIn } from "@amends/gateway";
import { Crypto, DateTime, Duration, Effect, Layer, Redacted, Schema } from "effect";

interface Pending {
  readonly code: SignIn.Code;
  readonly expiresAt: DateTime.Utc;
}

/** How a code reaches the person; development logs it where the server runs. */
export type Deliver = (email: SignIn.Email, code: SignIn.Code) => Effect.Effect<void>;

export const logDelivery: Deliver = (email, code) =>
  Effect.logInfo(`Sign-in code for ${email}: ${code}`);

/** Codes expire ten minutes after issuance. */
export const lifetime = Duration.minutes(10);

/**
 * Development sign-in. Codes live in memory and expire after ten minutes; the
 * session token is the address itself, which credential resolution below
 * trusts as the human ID. Nothing here verifies that the person controls the
 * address.
 *
 * @category constructors
 */
export const make = Effect.fn("LocalSignIn.make")(function* (
  deliver: Deliver = logDelivery,
): Effect.fn.Return<SignIn.Interface, never, Crypto.Crypto> {
  const cryptography = yield* Crypto.Crypto;
  const pending = new Map<SignIn.Email, Pending>();
  const start: SignIn.Interface["start"] = Effect.fn("LocalSignIn.start")(function* (email) {
    const bytes = yield* Effect.orDie(cryptography.randomBytes(4));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const code = yield* Schema.decodeEffect(SignIn.Code)(
      String(view.getUint32(0) % 1_000_000).padStart(6, "0"),
    ).pipe(Effect.orDie);
    pending.set(email, { code, expiresAt: DateTime.addDuration(yield* DateTime.now, lifetime) });
    yield* deliver(email, code);
  });
  const complete: SignIn.Interface["complete"] = Effect.fn("LocalSignIn.complete")(
    function* (email, code) {
      const found = pending.get(email);
      if (found === undefined) return yield* new SignIn.Rejected({ reason: "unknown" });
      if (!DateTime.isGreaterThan(found.expiresAt, yield* DateTime.now)) {
        pending.delete(email);
        return yield* new SignIn.Rejected({ reason: "expired" });
      }
      if (found.code !== code) return yield* new SignIn.Rejected({ reason: "mismatch" });
      pending.delete(email);
      return { token: email, humanId: Identity.HumanId.make(email) };
    },
  );
  return SignIn.Service.of({ start, complete });
});

/**
 * Development credentials: the token is the human ID it asserts, mirroring the
 * CLI's trusted local operator assertions. A network host must verify tokens.
 *
 * @category constructors
 */
export const makeCredentials = (): Credentials.Interface =>
  Credentials.Service.of({
    resolve: (token) =>
      Schema.decodeEffect(Identity.HumanId)(Redacted.value(token)).pipe(
        Effect.mapError(() => new Credentials.Rejected({ reason: "malformed" })),
        Effect.map((id) => Identity.Reference.cases.Human.make({ id })),
      ),
  });

/**
 * Provide the development credential resolver using its synchronous constructor.
 *
 * @category layers
 */
export const layerCredentials = Layer.sync(Credentials.Service, makeCredentials);

/**
 * Provide both session services: sign-in with fresh pending codes, and credential resolution.
 *
 * @category layers
 */
export const layer = (deliver?: Deliver) =>
  Layer.merge(Layer.effect(SignIn.Service, make(deliver)), layerCredentials);

export * as LocalSignIn from "./sign-in.ts";
