import { expect, it } from "@effect/vitest";
import { SessionTokens } from "@amends-dev/gateway";
import { Identity } from "@amends-dev/core/identity";
import { Effect, Redacted } from "effect";
import * as DevelopmentSessionTokens from "../../src/authentication/session-tokens.ts";

it.effect.each(["make", "layer"] as const)(
  "development session tokens %s trust asserted human IDs and reject empty tokens",
  (construction) =>
    Effect.gen(function* () {
      const program = Effect.gen(function* () {
        const sessionTokens = yield* SessionTokens.SessionTokens;
        expect(yield* sessionTokens.resolve(Redacted.make("alice"))).toEqual(
          Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
        );
        // Development tokens cannot be revoked: signing out forgets one in the client alone.
        yield* sessionTokens.revoke(Redacted.make("alice"));
        expect(yield* sessionTokens.resolve(Redacted.make("alice"))).toMatchObject({ id: "alice" });
        expect(yield* Effect.flip(sessionTokens.resolve(Redacted.make("")))).toMatchObject({
          _tag: "SessionTokens.Rejected",
          reason: "malformed",
        });
      });
      yield* construction === "make"
        ? program.pipe(
            Effect.provideService(SessionTokens.SessionTokens, DevelopmentSessionTokens.make()),
          )
        : program.pipe(Effect.provide(DevelopmentSessionTokens.layer));
    }),
);
