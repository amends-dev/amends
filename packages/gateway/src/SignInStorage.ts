import { Identity } from "@amends-dev/core/identity";
import { Context, Schema } from "effect";
import type { DateTime, Effect, Option } from "effect";
import type * as Accounts from "./Accounts.ts";

/**
 * The code an address was last sent, and how many it was sent lately. The code itself is never
 * stored, only its digest under the host's code key.
 */
export const PendingCode = Schema.Struct({
  digest: Schema.NonEmptyString,
  expiresAt: Schema.DateTimeUtc,
  failedAttempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sentAt: Schema.DateTimeUtc,
  /** When the current window of sends began, and how many codes it has sent. */
  windowStartedAt: Schema.DateTimeUtc,
  sendsInWindow: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});
export type PendingCode = typeof PendingCode.Type;

/**
 * A signed-in session: whose it is, when it began, and when it ends unless used. The token that
 * presents it is never stored, only its digest, which names the session here.
 */
export const SessionRecord = Schema.Struct({
  humanId: Identity.HumanId,
  createdAt: Schema.DateTimeUtc,
  expiresAt: Schema.DateTimeUtc,
});
export type SessionRecord = typeof SessionRecord.Type;

/**
 * Where email sign-in keeps the codes it sent and the sessions it began, across every host over
 * the storage. Storage failures are defects.
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
    readonly insertSession: (digest: string, session: SessionRecord) => Effect.Effect<void>;
    readonly findSession: (digest: string) => Effect.Effect<Option.Option<SessionRecord>>;
    /** Move a session's end, as using it does; a session that is gone stays gone. */
    readonly extendSession: (digest: string, expiresAt: DateTime.Utc) => Effect.Effect<void>;
    readonly deleteSession: (digest: string) => Effect.Effect<void>;
  }
>()("@amends-dev/gateway/SignIn-storage/Service") {}
