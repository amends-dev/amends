/**
 * The gateway's `SignInStorage.SignInStorage` over two tables kept across every workspace:
 * `sign_in_codes`, each address's pending code digest with its expiry, failed tries, and sends in
 * the current window, and `sign_in_sessions`, each session by its token's digest, with its
 * account's human ID, start, and end. `PostgresStorage.layer` provides it beside workspace storage.
 * Storage failures are defects, as the contract has them.
 *
 * @since 0.1.0
 */

import { SignInStorage } from "@amends-dev/gateway"
import { eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { signInCodes, signInSessions } from "./internal/schema.ts"
import * as PostgresDatabase from "./PostgresDatabase.ts"

const PendingCodeRow = Schema.Struct({
  ...SignInStorage.PendingCode.fields,
  expiresAt: Schema.DateTimeUtcFromDate,
  sentAt: Schema.DateTimeUtcFromDate,
  windowStartedAt: Schema.DateTimeUtcFromDate
})
const decodePendingCode = Schema.decodeUnknownEffect(PendingCodeRow)
const SessionRow = Schema.Struct({
  ...SignInStorage.Session.fields,
  createdAt: Schema.DateTimeUtcFromDate,
  expiresAt: Schema.DateTimeUtcFromDate
})
const decodeSession = Schema.decodeUnknownEffect(SessionRow)

/**
 * Sign-in codes and sessions in two tables beside every workspace's. Changes to one address's
 * code take an advisory lock on the address for their transaction, so they apply one at a time
 * across every process.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const { db, sql } = yield* PostgresDatabase.PostgresDatabase
  return SignInStorage.SignInStorage.of({
    modifyCode: (email, decide) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 3))`
            const [row] = yield* db.select().from(signInCodes).where(eq(signInCodes.email, email))
            const current = row === undefined ? Option.none() : Option.some(yield* decodePendingCode(row))
            const [answer, next] = decide(current)
            if (Option.isSome(next)) {
              const values = {
                digest: next.value.digest,
                expiresAt: DateTime.toDate(next.value.expiresAt),
                failedAttempts: next.value.failedAttempts,
                sentAt: DateTime.toDate(next.value.sentAt),
                windowStartedAt: DateTime.toDate(next.value.windowStartedAt),
                sendsInWindow: next.value.sendsInWindow
              }
              yield* db
                .insert(signInCodes)
                .values({ email, ...values })
                .onConflictDoUpdate({ target: signInCodes.email, set: values })
            } else if (row !== undefined) yield* db.delete(signInCodes).where(eq(signInCodes.email, email))
            return answer
          })
        )
        .pipe(Effect.orDie),
    insertSession: Effect.fn("PostgresSignInStorage.insertSession")(function* (digest, session) {
      yield* db.insert(signInSessions).values({
        digest,
        humanId: session.humanId,
        createdAt: DateTime.toDate(session.createdAt),
        expiresAt: DateTime.toDate(session.expiresAt)
      })
    }, Effect.orDie),
    findSession: Effect.fn("PostgresSignInStorage.findSession")(function* (digest) {
      const [row] = yield* db
        .select({
          humanId: signInSessions.humanId,
          createdAt: signInSessions.createdAt,
          expiresAt: signInSessions.expiresAt
        })
        .from(signInSessions)
        .where(eq(signInSessions.digest, digest))
      return row === undefined ? Option.none() : Option.some(yield* decodeSession(row))
    }, Effect.orDie),
    extendSession: Effect.fn("PostgresSignInStorage.extendSession")(function* (digest, expiresAt) {
      yield* db
        .update(signInSessions)
        .set({ expiresAt: DateTime.toDate(expiresAt) })
        .where(eq(signInSessions.digest, digest))
    }, Effect.orDie),
    deleteSession: Effect.fn("PostgresSignInStorage.deleteSession")(function* (digest) {
      yield* db.delete(signInSessions).where(eq(signInSessions.digest, digest))
    }, Effect.orDie)
  })
})

/**
 * Provides `SignInStorage.SignInStorage` over the caller's `PostgresDatabase.PostgresDatabase`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(SignInStorage.SignInStorage, make)
