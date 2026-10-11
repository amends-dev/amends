import { SignInStorage } from "@amends-dev/gateway";
import { Effect, Layer, Option, Schema } from "effect";
import { MemoryConnection } from "./connection.ts";
import { Rows } from "./rows.ts";

const codes = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SignInStorage.PendingCode)));
const sessions = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SignInStorage.SessionRecord)));

/**
 * Sign-in codes and sessions beside every workspace's state. A change to an address's code holds
 * the database's sign-in lock, so changes apply one at a time across every host.
 *
 * @category constructors
 */
export const make = Effect.fn("MemorySignInStorage.make")(function* () {
  const { database } = yield* MemoryConnection.Service;
  return SignInStorage.Service.of({
    modifyCode: (email, decide) =>
      database.signInCodesLock
        .withPermit(
          Effect.gen(function* () {
            const [answer, next] = decide(yield* codes.get(database.signInCodes, email));
            if (Option.isSome(next))
              database.signInCodes.set(email, yield* codes.encode(next.value));
            else database.signInCodes.delete(email);
            return answer;
          }),
        )
        .pipe(Effect.orDie),
    insertSession: Effect.fn("MemorySignInStorage.insertSession")(function* (digest, session) {
      database.signInSessions.set(digest, yield* sessions.encode(session));
    }, Effect.orDie),
    findSession: (digest) => sessions.get(database.signInSessions, digest).pipe(Effect.orDie),
    extendSession: Effect.fn("MemorySignInStorage.extendSession")(function* (digest, expiresAt) {
      const found = yield* sessions.get(database.signInSessions, digest);
      if (Option.isSome(found))
        database.signInSessions.set(digest, yield* sessions.encode({ ...found.value, expiresAt }));
    }, Effect.orDie),
    deleteSession: (digest) =>
      Effect.sync(() => {
        database.signInSessions.delete(digest);
      }),
  });
});

/**
 * Provide SignInStorage.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(SignInStorage.Service, make());

export * as MemorySignInStorage from "./sign-in-storage.ts";
