import { MemoryDatabase, Rows } from "@amends-dev/core/memory";
import { Effect, Layer, Option, Schema } from "effect";
import * as SignInStorage from "../sign-in-storage.ts";

const codes = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SignInStorage.PendingCode)));
const sessions = Rows.make(Schema.fromJsonString(Schema.toCodecJson(SignInStorage.SessionRecord)));

/**
 * Sign-in codes and sessions in two tables beside every workspace's state. A change to an
 * address's code holds the address's lock, so changes to it apply one at a time across every host.
 *
 * @category constructors
 */
export const make = Effect.fn("MemorySignInStorage.make")(function* () {
  const database = yield* MemoryDatabase.MemoryDatabase;
  const signInCodes = MemoryDatabase.table(database, "sign_in_codes");
  const signInSessions = MemoryDatabase.table(database, "sign_in_sessions");
  return SignInStorage.SignInStorage.of({
    modifyCode: (email, decide) =>
      MemoryDatabase.lock(database, Rows.keyOf("sign-in-code", email))
        .withPermit(
          Effect.gen(function* () {
            const [answer, next] = decide(yield* codes.get(signInCodes, email));
            if (Option.isSome(next)) signInCodes.set(email, yield* codes.encode(next.value));
            else signInCodes.delete(email);
            return answer;
          }),
        )
        .pipe(Effect.orDie),
    insertSession: Effect.fn("MemorySignInStorage.insertSession")(function* (digest, session) {
      signInSessions.set(digest, yield* sessions.encode(session));
    }, Effect.orDie),
    findSession: (digest) => sessions.get(signInSessions, digest).pipe(Effect.orDie),
    extendSession: Effect.fn("MemorySignInStorage.extendSession")(function* (digest, expiresAt) {
      const found = yield* sessions.get(signInSessions, digest);
      if (Option.isSome(found))
        signInSessions.set(digest, yield* sessions.encode({ ...found.value, expiresAt }));
    }, Effect.orDie),
    deleteSession: (digest) =>
      Effect.sync(() => {
        signInSessions.delete(digest);
      }),
  });
});

/**
 * Provide SignInStorage.SignInStorage using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(SignInStorage.SignInStorage, make());
