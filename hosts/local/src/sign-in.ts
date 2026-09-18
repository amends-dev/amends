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

/**
 * Development sign-in. Codes live in memory and expire after ten minutes; the
 * session token is the address itself, which credential resolution below
 * trusts as the human ID. Nothing here verifies that the person controls the
 * address.
 */
export const make = Effect.fn("LocalSignIn.make")(function* (deliver: Deliver) {
  const cryptography = yield* Crypto.Crypto;
  const pending = new Map<SignIn.Email, Pending>();
  const start: SignIn.Interface["start"] = Effect.fn("LocalSignIn.start")(function* (email) {
    const bytes = yield* Effect.orDie(cryptography.randomBytes(4));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const code = yield* Schema.decodeEffect(SignIn.Code)(
      String(view.getUint32(0) % 1_000_000).padStart(6, "0"),
    ).pipe(Effect.orDie);
    pending.set(email, { code, expiresAt: DateTime.add(yield* DateTime.now, { minutes: 10 }) });
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
      return { token: email, identity: Identity.HumanId.make(email) };
    },
  );
  return SignIn.Service.of({ start, complete });
});

/**
 * Development credentials: the token is the human ID it asserts, mirroring the
 * CLI's trusted local operator assertions. A network host must verify tokens.
 */
export const credentials = Layer.succeed(
  Credentials.Service,
  Credentials.Service.of({
    resolve: (token) =>
      Schema.decodeEffect(Identity.HumanId)(Redacted.value(token)).pipe(
        Effect.mapError(() => new Credentials.Rejected({ reason: "malformed" })),
        Effect.map((id) => Identity.Reference.cases.Human.make({ id })),
      ),
  }),
);

/** Both halves of the session: issuing tokens and resolving them. */
export const layer = (deliver: Deliver = logDelivery) =>
  Layer.merge(Layer.effect(SignIn.Service, make(deliver)), credentials);

/** Codes expire ten minutes after delivery. */
export const lifetime = Duration.minutes(10);

export * as LocalSignIn from "./sign-in.ts";
