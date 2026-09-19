import { expect, test } from "bun:test";
import { Identity } from "@amends/core/identity";
import { Credentials, SignIn } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Cause, Clock, Crypto, Deferred, Effect, Exit, Fiber, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { DevelopmentSignIn } from "../../src/authentication/sign-in.ts";
import { DevelopmentCredentials } from "../../src/authentication/credentials.ts";
import { DevelopmentAuthentication } from "../../src/authentication/authentication.ts";

test.each(["make", "layer"] as const)(
  "sign-in %s issues usable credentials and enforces one-time codes and expiry",
  async (construction) => {
    const delivered = new Map<SignIn.Email, SignIn.Code>();
    const deliver: DevelopmentSignIn.DeliverCode = (email, code) =>
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
        ? Effect.flatMap(DevelopmentSignIn.make(deliver), (signIn) =>
            program.pipe(
              Effect.provideService(SignIn.Service, signIn),
              Effect.provideService(Credentials.Service, DevelopmentCredentials.make()),
            ),
          )
        : program.pipe(Effect.provide(DevelopmentAuthentication.layer(deliver)));
    await Effect.runPromise(
      configured.pipe(Effect.provide(Layer.mergeAll(BunCrypto.layer, TestClock.layer()))),
    );
  },
);

test("each evaluation of the sign-in constructor owns its pending codes", async () => {
  let delivered: SignIn.Code | undefined;
  const acquire = DevelopmentSignIn.make((_email, code) =>
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

const deterministicCrypto = Layer.sync(Crypto.Crypto, () => {
  let sequence = 0;
  return Crypto.make({
    randomBytes: (size) => new Uint8Array(size).fill(++sequence),
    digest: () => Effect.die("Unexpected digest in sign-in test"),
  });
});

test("concurrent completions consume a code once even when the clock suspends", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      let delivered: SignIn.Code | undefined;
      const signIn = yield* DevelopmentSignIn.make((_email, code) =>
        Effect.sync(() => {
          delivered = code;
        }),
      );
      const email = SignIn.Email.make("alice@example.com");
      yield* signIn.start(email);
      const code = delivered;
      if (code === undefined) return yield* Effect.die("No code delivered");
      const gate = yield* Deferred.make<void>();
      let readers = 0;
      const results = yield* Effect.clockWith((clock) => {
        const now = clock.currentTimeMillisUnsafe();
        return Effect.all(
          [Effect.exit(signIn.complete(email, code)), Effect.exit(signIn.complete(email, code))],
          { concurrency: 2 },
        ).pipe(
          Effect.provideService(Clock.Clock, {
            currentTimeMillis: Effect.gen(function* () {
              readers++;
              if (readers === 2) yield* Deferred.succeed(gate, undefined);
              yield* Deferred.await(gate);
              return now;
            }),
            currentTimeMillisUnsafe: () => now,
            currentTimeNanos: clock.currentTimeNanos,
            currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe(),
            monotonicTimeNanos: clock.monotonicTimeNanos,
            monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
            sleep: (duration) => clock.sleep(duration),
          }),
        );
      });
      expect(results.filter(Exit.isSuccess)).toHaveLength(1);
      const rejected = results.find(Exit.isFailure);
      if (rejected === undefined) return yield* Effect.die("Expected one rejection");
      expect(Cause.findErrorOption(rejected.cause)).toMatchObject({
        _tag: "Some",
        value: { _tag: "SignIn.Rejected", reason: "unknown" },
      });
    }).pipe(Effect.provide(deterministicCrypto)),
  );
});

test("a repeated request replaces the previous code", async () => {
  const delivered: Array<SignIn.Code> = [];
  await Effect.runPromise(
    Effect.gen(function* () {
      const signIn = yield* DevelopmentSignIn.make((_email, code) =>
        Effect.sync(() => {
          delivered.push(code);
        }),
      );
      const email = SignIn.Email.make("alice@example.com");
      yield* signIn.start(email);
      yield* signIn.start(email);
      const [first, second] = delivered;
      if (first === undefined || second === undefined)
        return yield* Effect.die("Expected two codes");
      expect(first).not.toBe(second);
      expect(yield* Effect.flip(signIn.complete(email, first))).toMatchObject({
        reason: "mismatch",
      });
      expect(yield* signIn.complete(email, second)).toMatchObject({ humanId: "alice@example.com" });
    }).pipe(Effect.provide(deterministicCrypto)),
  );
});

test("a failed delivery leaves no usable code and a later request can succeed", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      let fail = true;
      const delivered: Array<SignIn.Code> = [];
      const signIn = yield* DevelopmentSignIn.make((_email, code) => {
        delivered.push(code);
        if (fail) throw new Error("Delivery failed");
        return Effect.void;
      });
      const email = SignIn.Email.make("alice@example.com");
      expect(Exit.hasDies(yield* Effect.exit(signIn.start(email)))).toBe(true);
      const failed = delivered[0];
      if (failed === undefined) return yield* Effect.die("Expected failed delivery");
      expect(yield* Effect.flip(signIn.complete(email, failed))).toMatchObject({
        reason: "unknown",
      });
      fail = false;
      yield* signIn.start(email);
      const replacement = delivered[1];
      if (replacement === undefined) return yield* Effect.die("Expected replacement code");
      expect(yield* signIn.complete(email, replacement)).toMatchObject({
        humanId: "alice@example.com",
      });
    }).pipe(Effect.provide(deterministicCrypto)),
  );
});

test.each(["failure", "interruption"] as const)(
  "an older delivery's %s cannot remove a newer code",
  async (outcome) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<SignIn.Code>();
        const release = yield* Deferred.make<void>();
        let replacement: SignIn.Code | undefined;
        let deliveries = 0;
        const signIn = yield* DevelopmentSignIn.make((_email, code) => {
          if (++deliveries === 1)
            return Deferred.succeed(entered, code).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(Effect.die("Old delivery failed")),
            );
          replacement = code;
          return Effect.void;
        });
        const email = SignIn.Email.make("alice@example.com");
        const first = yield* Effect.forkScoped(signIn.start(email));
        const firstCode = yield* Deferred.await(entered);
        // The delivery has started but has not succeeded yet.
        expect(yield* Effect.flip(signIn.complete(email, firstCode))).toMatchObject({
          reason: "unknown",
        });
        yield* signIn.start(email);
        if (outcome === "interruption") yield* Fiber.interrupt(first);
        else {
          yield* Deferred.succeed(release, undefined);
          expect(Exit.hasDies(yield* Fiber.await(first))).toBe(true);
        }
        const code = replacement;
        if (code === undefined) return yield* Effect.die("Expected replacement code");
        const result = yield* signIn.complete(email, code);
        expect(result.humanId).toBe(Identity.HumanId.make(email));
        expect(yield* Effect.flip(signIn.complete(email, code))).toMatchObject({
          reason: "unknown",
        });
      }).pipe(Effect.scoped, Effect.provide(deterministicCrypto)),
    );
  },
);
