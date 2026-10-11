import { SignInStorage } from "@amends-dev/gateway";
import { eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { PostgresDatabase } from "./database.ts";
import { signInCodes, signInSessions } from "./schema.ts";

const PendingCodeRow = Schema.Struct({
  ...SignInStorage.PendingCode.fields,
  expiresAt: Schema.DateTimeUtcFromDate,
  sentAt: Schema.DateTimeUtcFromDate,
  windowStartedAt: Schema.DateTimeUtcFromDate,
});
const decodePendingCode = Schema.decodeUnknownEffect(PendingCodeRow);
const SessionRow = Schema.Struct({
  ...SignInStorage.SessionRecord.fields,
  createdAt: Schema.DateTimeUtcFromDate,
  expiresAt: Schema.DateTimeUtcFromDate,
});
const decodeSession = Schema.decodeUnknownEffect(SessionRow);

/**
 * Sign-in codes and sessions in two tables beside every workspace's. Changes to one address's
 * code take an advisory lock on the address for their transaction, so they apply one at a time
 * across every process.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresSignInStorage.make")(function* () {
  const { db, sql } = yield* PostgresDatabase.Service;
  return SignInStorage.Service.of({
    modifyCode: (email, decide) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 3))`;
            const [row] = yield* db.select().from(signInCodes).where(eq(signInCodes.email, email));
            const current =
              row === undefined ? Option.none() : Option.some(yield* decodePendingCode(row));
            const [answer, next] = decide(current);
            if (Option.isSome(next)) {
              const values = {
                digest: next.value.digest,
                expiresAt: DateTime.toDate(next.value.expiresAt),
                failedAttempts: next.value.failedAttempts,
                sentAt: DateTime.toDate(next.value.sentAt),
                windowStartedAt: DateTime.toDate(next.value.windowStartedAt),
                sendsInWindow: next.value.sendsInWindow,
              };
              yield* db
                .insert(signInCodes)
                .values({ email, ...values })
                .onConflictDoUpdate({ target: signInCodes.email, set: values });
            } else if (row !== undefined)
              yield* db.delete(signInCodes).where(eq(signInCodes.email, email));
            return answer;
          }),
        )
        .pipe(Effect.orDie),
    insertSession: Effect.fn("PostgresSignInStorage.insertSession")(function* (digest, session) {
      yield* db.insert(signInSessions).values({
        digest,
        humanId: session.humanId,
        createdAt: DateTime.toDate(session.createdAt),
        expiresAt: DateTime.toDate(session.expiresAt),
      });
    }, Effect.orDie),
    findSession: Effect.fn("PostgresSignInStorage.findSession")(function* (digest) {
      const [row] = yield* db
        .select({
          humanId: signInSessions.humanId,
          createdAt: signInSessions.createdAt,
          expiresAt: signInSessions.expiresAt,
        })
        .from(signInSessions)
        .where(eq(signInSessions.digest, digest));
      return row === undefined ? Option.none() : Option.some(yield* decodeSession(row));
    }, Effect.orDie),
    extendSession: Effect.fn("PostgresSignInStorage.extendSession")(function* (digest, expiresAt) {
      yield* db
        .update(signInSessions)
        .set({ expiresAt: DateTime.toDate(expiresAt) })
        .where(eq(signInSessions.digest, digest));
    }, Effect.orDie),
    deleteSession: Effect.fn("PostgresSignInStorage.deleteSession")(function* (digest) {
      yield* db.delete(signInSessions).where(eq(signInSessions.digest, digest));
    }, Effect.orDie),
  });
});

/**
 * Provide SignInStorage.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(SignInStorage.Service, make());

export * as PostgresSignInStorage from "./sign-in-storage.ts";
