/**
 * Where email sign-in keeps its pending codes and sessions, shared by every host over the same
 * storage. `EmailSignIn` reads and writes it, deciding each change to a code with a pure function
 * that `modifyCode` applies. Storage adapters implement it, `layerMemory` in process memory, and the `signInStorage` conformance suite checks that each applies one change to an
 * address at a time across hosts.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import { MemoryDatabase } from "@amends-dev/core/journal";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as DateTime from "effect/DateTime";
import type * as Accounts from "./Accounts.ts";

/**
 * The code an address was last sent, and how many it was sent lately. The code itself is never
 * stored, only its digest under the host's code key.
 *
 * @category schemas
 * @since 0.1.0
 */
export const PendingCode = Schema.Struct({
  /** The code's HMAC-SHA256 digest under the host's code key. */
  digest: Schema.NonEmptyString,
  /** When the code stops working: its lifetime after sending, or the wrong try that voids it. */
  expiresAt: Schema.DateTimeUtc,
  failedAttempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sentAt: Schema.DateTimeUtc,
  /** When the current window of sends began, and how many codes it has sent. */
  windowStartedAt: Schema.DateTimeUtc,
  sendsInWindow: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});
/**
 * @category schemas
 * @since 0.1.0
 */
export type PendingCode = typeof PendingCode.Type;

/**
 * A signed-in session: whose it is, when it began, and when it ends unless used. The token that
 * presents it is never stored, only its digest, which names the session here.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Session = Schema.Struct({
  humanId: Identity.HumanId,
  createdAt: Schema.DateTimeUtc,
  expiresAt: Schema.DateTimeUtc,
});
/**
 * @category schemas
 * @since 0.1.0
 */
export type Session = typeof Session.Type;

/**
 * Where email sign-in keeps the codes it sent and the sessions it began, across every host over
 * the storage. Storage failures are defects.
 *
 * @category services
 * @since 0.1.0
 */
export class SignInStorage extends Context.Service<
  SignInStorage,
  {
    /**
     * Replace the address's pending code with what `decide` makes of the current one, and answer
     * what it decided. Changes to one address apply one at a time, across every host over the
     * storage. `decide` is pure; a next code of none removes the pending code.
     */
    readonly modifyCode: <A>(
      email: Accounts.Email,
      decide: (current: Option.Option<PendingCode>) => readonly [A, Option.Option<PendingCode>],
    ) => Effect.Effect<A>;
    /** Store a session a sign-in began, under its token's digest. */
    readonly insertSession: (digest: string, session: Session) => Effect.Effect<void>;
    /** The session stored under a token's digest, ended or not: its reader checks `expiresAt`. */
    readonly findSession: (digest: string) => Effect.Effect<Option.Option<Session>>;
    /** Move a session's end, as using it does; a session that is gone stays gone. */
    readonly extendSession: (digest: string, expiresAt: DateTime.Utc) => Effect.Effect<void>;
    /** Remove the session under a token's digest, as revoking it does; a missing one stays gone. */
    readonly deleteSession: (digest: string) => Effect.Effect<void>;
  }
>()("@amends-dev/gateway/SignInStorage") {}

const codeRows = MemoryDatabase.makeRows(Schema.fromJsonString(Schema.toCodecJson(PendingCode)));
const sessionRows = MemoryDatabase.makeRows(Schema.fromJsonString(Schema.toCodecJson(Session)));

/**
 * Sign-in codes and sessions in two tables beside every workspace's state. A change to an
 * address's code holds the address's lock, so changes to it apply one at a time across every host.
 */
const makeMemory = Effect.fn("SignInStorage.makeMemory")(function* () {
  const database = yield* MemoryDatabase.MemoryDatabase;
  const signInCodes = MemoryDatabase.table(database, "sign_in_codes");
  const signInSessions = MemoryDatabase.table(database, "sign_in_sessions");
  return SignInStorage.of({
    modifyCode: (email, decide) =>
      MemoryDatabase.lock(database, MemoryDatabase.keyOf("sign-in-code", email))
        .withPermit(
          Effect.gen(function* () {
            const [answer, next] = decide(yield* codeRows.get(signInCodes, email));
            if (Option.isSome(next)) signInCodes.set(email, yield* codeRows.encode(next.value));
            else signInCodes.delete(email);
            return answer;
          }),
        )
        .pipe(Effect.orDie),
    insertSession: Effect.fn("SignInStorage.memory.insertSession")(function* (digest, session) {
      signInSessions.set(digest, yield* sessionRows.encode(session));
    }, Effect.orDie),
    findSession: (digest) => sessionRows.get(signInSessions, digest).pipe(Effect.orDie),
    extendSession: Effect.fn("SignInStorage.memory.extendSession")(function* (digest, expiresAt) {
      const found = yield* sessionRows.get(signInSessions, digest);
      if (Option.isSome(found))
        signInSessions.set(digest, yield* sessionRows.encode({ ...found.value, expiresAt }));
    }, Effect.orDie),
    deleteSession: (digest) =>
      Effect.sync(() => {
        signInSessions.delete(digest);
      }),
  });
});

/**
 * Provide sign-in storage in process memory, over the `MemoryDatabase` beneath: pending codes and
 * sessions in two of its tables, shared by every host over the same database.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(SignInStorage, makeMemory());
