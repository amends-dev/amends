import { Identity } from "@amends-dev/core/identity";
import { SignIn } from "@amends-dev/gateway";
import { Crypto, DateTime, Duration, Effect, Exit, Layer, Schema } from "effect";

interface PendingCode {
  readonly code: SignIn.Code;
  readonly expiresAt: DateTime.Utc;
  delivered: boolean;
}

/** How a code reaches the person; development logs it where the server runs. */
export type DeliverCode = (email: SignIn.Email, code: SignIn.Code) => Effect.Effect<void>;

export const logCode: DeliverCode = (email, code) =>
  Effect.logInfo(`Sign-in code for ${email}: ${code}`);

/** Codes expire ten minutes after issuance. */
export const codeLifetime = Duration.minutes(10);

/**
 * Development sign-in. Codes live in memory and expire after ten minutes; the
 * session token is the address itself, which development session tokens
 * trust as the human ID. Nothing here verifies that the person controls the
 * address.
 *
 * @category constructors
 */
export const make = Effect.fn("DevelopmentSignIn.make")(function* (
  deliver: DeliverCode = logCode,
): Effect.fn.Return<SignIn.Interface, never, Crypto.Crypto> {
  const crypto = yield* Crypto.Crypto;
  const pending = new Map<SignIn.Email, PendingCode>();
  const start: SignIn.Interface["start"] = Effect.fn("DevelopmentSignIn.start")(function* (email) {
    const bytes = yield* Effect.orDie(crypto.randomBytes(4));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const code = yield* Schema.decodeEffect(SignIn.Code)(
      String(view.getUint32(0) % 1_000_000).padStart(6, "0"),
    ).pipe(Effect.orDie);
    const entry: PendingCode = {
      code,
      expiresAt: DateTime.addDuration(yield* DateTime.now, codeLifetime),
      delivered: false,
    };
    yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        pending.set(email, entry);
        yield* restore(Effect.suspend(() => deliver(email, code))).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (Exit.isSuccess(exit)) entry.delivered = true;
              else if (pending.get(email) === entry) pending.delete(email);
            }),
          ),
        );
      }),
    );
  });
  const complete: SignIn.Interface["complete"] = Effect.fn("DevelopmentSignIn.complete")(
    function* (email, code) {
      // Reading time can suspend. Look up and consume the code together afterwards.
      const now = yield* DateTime.now;
      const found = pending.get(email);
      if (found === undefined || !found.delivered)
        return yield* new SignIn.Rejected({ reason: "unknown" });
      if (!DateTime.isGreaterThan(found.expiresAt, now)) {
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
 * Provide development sign-in with fresh pending codes for each acquisition.
 *
 * @category layers
 */
export const layer = (deliver?: DeliverCode) => Layer.effect(SignIn.Service, make(deliver));

export * as DevelopmentSignIn from "./sign-in.ts";
