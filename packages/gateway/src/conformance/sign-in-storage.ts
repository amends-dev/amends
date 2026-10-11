import { Accounts, SignInStorage } from "../index.ts";
import { Identity } from "@amends-dev/core/identity";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import type { Fixture } from "./fixture.ts";
import { runHost } from "./support.ts";

const email = Accounts.Email.make("ada@example.com");
const at = (seconds: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 11) + seconds * 1000);
const pending: SignInStorage.PendingCode = {
  digest: "digest-1",
  expiresAt: at(600),
  failedAttempts: 0,
  sentAt: at(0),
  windowStartedAt: at(0),
  sendsInWindow: 1,
};
const session: SignInStorage.SessionRecord = {
  humanId: Identity.HumanId.make("human-ada"),
  createdAt: at(0),
  expiresAt: at(3600),
};

/** Read an address's pending code, leaving it as it is. */
const readCode = Effect.flatMap(SignInStorage.SignInStorage, (signInStorage) =>
  signInStorage.modifyCode(email, (current) => [current, current] as const),
);
/** Set an address's pending code, or remove it with none. */
const writeCode = (next: Option.Option<SignInStorage.PendingCode>) =>
  Effect.flatMap(SignInStorage.SignInStorage, (signInStorage) =>
    signInStorage.modifyCode(email, () => [undefined, next] as const),
  );
const withSignInStorage = <A, E, R>(
  use: (signInStorage: SignInStorage.SignInStorage["Service"]) => Effect.Effect<A, E, R>,
) => Effect.flatMap(SignInStorage.SignInStorage, use);

/** Sign-in codes changed one at a time from every host, and sessions found, extended, and ended. */
export const signInStorage = (fixture: Fixture) => {
  describe.skipIf(!fixture.available)(`${fixture.name}: sign-in storage`, () => {
    it.effect("keeps an address's pending code until a change replaces or removes it", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          expect(yield* runHost(storage, readCode)).toEqual(Option.none());
          yield* runHost(storage, writeCode(Option.some(pending)));
          expect(yield* runHost(storage, readCode)).toEqual(Option.some(pending));
          const replaced = { ...pending, digest: "digest-2", failedAttempts: 2, sendsInWindow: 3 };
          yield* runHost(storage, writeCode(Option.some(replaced)));
          expect(yield* runHost(storage, readCode)).toEqual(Option.some(replaced));
          yield* runHost(storage, writeCode(Option.none()));
          expect(yield* runHost(storage, readCode)).toEqual(Option.none());
          yield* runHost(storage, writeCode(Option.none()));
        }),
      ),
    );

    it.effect("applies changes to one address one at a time, from every host", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          yield* runHost(storage, writeCode(Option.some(pending)));
          const count = (current: Option.Option<SignInStorage.PendingCode>) =>
            Option.map(current, (code) => ({ ...code, failedAttempts: code.failedAttempts + 1 }));
          yield* Effect.all(
            Array.from({ length: 8 }, () =>
              runHost(
                storage,
                withSignInStorage((signInStorage) =>
                  signInStorage.modifyCode(
                    email,
                    (current) => [undefined, count(current)] as const,
                  ),
                ),
              ),
            ),
            { concurrency: "unbounded" },
          );
          expect(yield* runHost(storage, readCode)).toEqual(
            Option.some({ ...pending, failedAttempts: 8 }),
          );
        }),
      ),
    );

    it.effect("finds a session by digest from any host, extends it, and ends it", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          yield* runHost(
            storage,
            withSignInStorage((signInStorage) => signInStorage.insertSession("token-1", session)),
          );
          const find = (digest: string) =>
            runHost(
              storage,
              withSignInStorage((signInStorage) => signInStorage.findSession(digest)),
            );
          expect(yield* find("token-1")).toEqual(Option.some(session));
          expect(yield* find("token-2")).toEqual(Option.none());
          yield* runHost(
            storage,
            withSignInStorage((signInStorage) => signInStorage.extendSession("token-1", at(7200))),
          );
          expect(yield* find("token-1")).toEqual(Option.some({ ...session, expiresAt: at(7200) }));
          yield* runHost(
            storage,
            withSignInStorage((signInStorage) => signInStorage.extendSession("token-2", at(7200))),
          );
          expect(yield* find("token-2")).toEqual(Option.none());
          yield* runHost(
            storage,
            withSignInStorage((signInStorage) => signInStorage.deleteSession("token-1")),
          );
          expect(yield* find("token-1")).toEqual(Option.none());
          yield* runHost(
            storage,
            withSignInStorage((signInStorage) => signInStorage.deleteSession("token-1")),
          );
        }),
      ),
    );
  });
};
