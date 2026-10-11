import { expect, it } from "@effect/vitest";
import { Identity } from "@amends-dev/core/identity";
import { Accounts, SessionTokens, SignIn } from "@amends-dev/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Cause, Clock, Crypto, Deferred, Effect, Exit, Fiber, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { DevelopmentSignIn } from "../../src/authentication/sign-in.ts";
import { DevelopmentSessionTokens } from "../../src/authentication/session-tokens.ts";
import { DevelopmentAuthentication } from "../../src/authentication/authentication.ts";

/** Accounts in memory: an address gets a random human ID the first time it comes up. */
const inMemoryAccounts = Layer.sync(Accounts.Service, () => {
  const ids = new Map<Accounts.Email, Identity.HumanId>();
  return Accounts.Service.of({
    findOrCreate: (email) =>
      Effect.sync(() => {
        const id = ids.get(email) ?? Identity.HumanId.make(crypto.randomUUID());
        ids.set(email, id);
        return { id, email };
      }),
    findByIds: (wanted) =>
      Effect.sync(() =>
        [...ids].flatMap(([email, id]) => (wanted.includes(id) ? [{ id, email }] : [])),
      ),
  });
});
/** The session completing sign-in gives an address: its account, whose ID is the token. */
const sessionFor = (email: Accounts.Email) =>
  Effect.flatMap(Accounts.Service, (accounts) => accounts.findOrCreate(email)).pipe(
    Effect.map((account): SignIn.Session => ({ token: account.id, account })),
  );

it.effect.each(["make", "layer"] as const)(
  "sign-in %s issues usable session tokens and enforces one-time codes and expiry",
  (construction) =>
    Effect.gen(function* () {
      const delivered = new Map<Accounts.Email, SignIn.Code>();
      const deliver: DevelopmentSignIn.DeliverCode = (email, code) =>
        Effect.sync(() => {
          delivered.set(email, code);
        });
      const codeFor = (email: Accounts.Email): SignIn.Code => {
        const code = delivered.get(email);
        if (code === undefined) throw new Error("No code was delivered");
        return code;
      };
      const program = Effect.gen(function* () {
        const signIn = yield* SignIn.Service;
        const sessionTokens = yield* SessionTokens.Service;
        const alice = Accounts.Email.make("alice@example.com");
        const bob = Accounts.Email.make("bob@example.com");
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
        expect(session).toEqual(yield* sessionFor(alice));
        expect(yield* sessionTokens.resolve(Redacted.make(session.token))).toEqual(
          Identity.Reference.cases.Human.make({ id: session.account.id }),
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
        expect(yield* Effect.flip(sessionTokens.resolve(Redacted.make("")))).toMatchObject({
          _tag: "SessionTokens.Rejected",
          reason: "malformed",
        });
      });
      const configured =
        construction === "make"
          ? Effect.flatMap(DevelopmentSignIn.make(deliver), (signIn) =>
              program.pipe(
                Effect.provideService(SignIn.Service, signIn),
                Effect.provideService(SessionTokens.Service, DevelopmentSessionTokens.make()),
              ),
            )
          : program.pipe(Effect.provide(DevelopmentAuthentication.layer(deliver)));
      yield* configured.pipe(Effect.provide([inMemoryAccounts, BunCrypto.layer]));
    }),
);

it.effect("each evaluation of the sign-in constructor owns its pending codes", () =>
  Effect.gen(function* () {
    let delivered: SignIn.Code | undefined;
    const acquire = DevelopmentSignIn.make((_email, code) =>
      Effect.sync(() => {
        delivered = code;
      }),
    );
    yield* Effect.gen(function* () {
      const first = yield* acquire;
      const second = yield* acquire;
      const email = Accounts.Email.make("alice@example.com");
      yield* first.start(email);
      const code = delivered;
      if (code === undefined) throw new Error("No code was delivered");
      expect(yield* Effect.flip(second.complete(email, code))).toMatchObject({
        _tag: "SignIn.Rejected",
        reason: "unknown",
      });
      expect(yield* first.complete(email, code)).toEqual(yield* sessionFor(email));
    }).pipe(Effect.provide([inMemoryAccounts, BunCrypto.layer]));
  }),
);
const deterministicCrypto = Layer.sync(Crypto.Crypto, () => {
  let sequence = 0;
  return Crypto.make({
    randomBytes: (size) => new Uint8Array(size).fill(++sequence),
    digest: () => Effect.die("Unexpected digest in sign-in test"),
  });
});

it.effect("completing sign-in signs in as the address's account, the same one each time", () =>
  Effect.gen(function* () {
    const delivered = new Map<Accounts.Email, SignIn.Code>();
    const signIn = yield* DevelopmentSignIn.make((email, code) =>
      Effect.sync(() => {
        delivered.set(email, code);
      }),
    );
    const accounts = yield* Accounts.Service;
    const signInAs = Effect.fn(function* (email: Accounts.Email) {
      yield* signIn.start(email);
      const code = delivered.get(email);
      if (code === undefined) return yield* Effect.die("No code was delivered");
      return yield* signIn.complete(email, code);
    });
    const alice = Accounts.Email.make("alice@example.com");
    const first = yield* signInAs(alice);
    // The token is the account's human ID, which says nothing of the address.
    expect(first.token).toBe(first.account.id);
    expect(first.account).toEqual({ id: first.account.id, email: alice });
    expect(first.account.id).not.toBe(alice);
    expect(yield* accounts.findByIds([first.account.id])).toEqual([first.account]);
    expect(yield* signInAs(alice)).toEqual(first);
    const bob = yield* signInAs(Accounts.Email.make("bob@example.com"));
    expect(bob.account.id).not.toBe(first.account.id);
  }).pipe(Effect.provide([deterministicCrypto, inMemoryAccounts])),
);
it.effect("concurrent completions consume a code once even when the clock suspends", () =>
  Effect.gen(function* () {
    let delivered: SignIn.Code | undefined;
    const signIn = yield* DevelopmentSignIn.make((_email, code) =>
      Effect.sync(() => {
        delivered = code;
      }),
    );
    const email = Accounts.Email.make("alice@example.com");
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
  }).pipe(Effect.provide([deterministicCrypto, inMemoryAccounts])),
);

it.effect("a repeated request replaces the previous code", () =>
  Effect.gen(function* () {
    const delivered: Array<SignIn.Code> = [];
    yield* Effect.gen(function* () {
      const signIn = yield* DevelopmentSignIn.make((_email, code) =>
        Effect.sync(() => {
          delivered.push(code);
        }),
      );
      const email = Accounts.Email.make("alice@example.com");
      yield* signIn.start(email);
      yield* signIn.start(email);
      const [first, second] = delivered;
      if (first === undefined || second === undefined)
        return yield* Effect.die("Expected two codes");
      expect(first).not.toBe(second);
      expect(yield* Effect.flip(signIn.complete(email, first))).toMatchObject({
        reason: "mismatch",
      });
      expect(yield* signIn.complete(email, second)).toEqual(yield* sessionFor(email));
    }).pipe(Effect.provide([deterministicCrypto, inMemoryAccounts]));
  }),
);

it.effect("a failed delivery leaves no usable code and a later request can succeed", () =>
  Effect.gen(function* () {
    let fail = true;
    const delivered: Array<SignIn.Code> = [];
    const signIn = yield* DevelopmentSignIn.make((_email, code) => {
      delivered.push(code);
      if (fail) throw new Error("Delivery failed");
      return Effect.void;
    });
    const email = Accounts.Email.make("alice@example.com");
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
    expect(yield* signIn.complete(email, replacement)).toEqual(yield* sessionFor(email));
  }).pipe(Effect.provide([deterministicCrypto, inMemoryAccounts])),
);

it.effect.each(["failure", "interruption"] as const)(
  "an older delivery's %s cannot remove a newer code",
  (outcome) =>
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
      const email = Accounts.Email.make("alice@example.com");
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
      expect(yield* signIn.complete(email, code)).toEqual(yield* sessionFor(email));
      expect(yield* Effect.flip(signIn.complete(email, code))).toMatchObject({
        reason: "unknown",
      });
    }).pipe(Effect.scoped, Effect.provide([deterministicCrypto, inMemoryAccounts])),
);
