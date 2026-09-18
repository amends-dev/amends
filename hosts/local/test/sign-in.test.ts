import { expect, test } from "bun:test";
import { Identity } from "@amends/core/identity";
import { Credentials, SignIn } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Effect, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { LocalSignIn } from "../src/sign-in.ts";

test.each(["make", "layer"] as const)(
  "sign-in %s issues usable credentials and enforces one-time codes and expiry",
  async (construction) => {
    const delivered = new Map<SignIn.Email, SignIn.Code>();
    const deliver: LocalSignIn.Deliver = (email, code) =>
      Effect.sync(() => {
        delivered.set(email, code);
      });
    const codeFor = (email: SignIn.Email): SignIn.Code => {
      const code = delivered.get(email);
      if (code === undefined) throw new Error("No code was delivered");
      return code;
    };
    const program = Effect.gen(function* () {
      const signIn = yield* SignIn.Service;
      const credentials = yield* Credentials.Service;
      const alice = SignIn.Email.make("alice@example.com");
      const bob = SignIn.Email.make("bob@example.com");
      expect(delivered.size).toBe(0);
      yield* signIn.start(alice);
      yield* signIn.start(bob);
      const aliceCode = codeFor(alice);
      const wrong = SignIn.Code.make(aliceCode === "000000" ? "000001" : "000000");
      expect(yield* Effect.flip(signIn.complete(alice, wrong))).toMatchObject({
        _tag: "SignIn.Rejected",
        reason: "mismatch",
      });

      yield* TestClock.adjust("599999 millis");
      const session = yield* signIn.complete(alice, aliceCode);
      expect(session).toEqual({ token: alice, humanId: Identity.HumanId.make(alice) });
      expect(yield* credentials.resolve(Redacted.make(session.token))).toEqual(
        Identity.Reference.cases.Human.make({ id: session.humanId }),
      );
      expect(yield* Effect.flip(signIn.complete(alice, aliceCode))).toMatchObject({
        _tag: "SignIn.Rejected",
        reason: "unknown",
      });

      yield* TestClock.adjust("1 milli");
      expect(yield* Effect.flip(signIn.complete(bob, codeFor(bob)))).toMatchObject({
        _tag: "SignIn.Rejected",
        reason: "expired",
      });
      expect(yield* Effect.flip(signIn.complete(bob, codeFor(bob)))).toMatchObject({
        _tag: "SignIn.Rejected",
        reason: "unknown",
      });
      expect(yield* Effect.flip(credentials.resolve(Redacted.make("")))).toMatchObject({
        _tag: "Credentials.Rejected",
        reason: "malformed",
      });
    });
    const configured =
      construction === "make"
        ? Effect.flatMap(LocalSignIn.make(deliver), (signIn) =>
            program.pipe(
              Effect.provideService(SignIn.Service, signIn),
              Effect.provideService(Credentials.Service, LocalSignIn.makeCredentials()),
            ),
          )
        : program.pipe(Effect.provide(LocalSignIn.layer(deliver)));
    await Effect.runPromise(
      configured.pipe(Effect.provide(Layer.mergeAll(BunCrypto.layer, TestClock.layer()))),
    );
  },
);

test("each evaluation of the sign-in constructor owns its pending codes", async () => {
  let delivered: SignIn.Code | undefined;
  const acquire = LocalSignIn.make((_email, code) =>
    Effect.sync(() => {
      delivered = code;
    }),
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* acquire;
      const second = yield* acquire;
      const email = SignIn.Email.make("alice@example.com");
      yield* first.start(email);
      const code = delivered;
      if (code === undefined) throw new Error("No code was delivered");
      expect(yield* Effect.flip(second.complete(email, code))).toMatchObject({
        _tag: "SignIn.Rejected",
        reason: "unknown",
      });
      expect(yield* first.complete(email, code)).toEqual({
        token: email,
        humanId: Identity.HumanId.make(email),
      });
    }).pipe(Effect.provide(BunCrypto.layer)),
  );
});
