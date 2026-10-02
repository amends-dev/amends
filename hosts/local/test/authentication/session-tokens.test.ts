import { expect, it } from "@effect/vitest";
import { SessionTokens } from "@amends/gateway";
import { Identity } from "@amends/core/identity";
import { Effect, Redacted } from "effect";
import { DevelopmentSessionTokens } from "../../src/authentication/session-tokens.ts";

it.effect.each(["make", "layer"] as const)(
  "development session tokens %s trust asserted human IDs and reject empty tokens",
  (construction) =>
    Effect.gen(function* () {
      const program = Effect.gen(function* () {
        const sessionTokens = yield* SessionTokens.Service;
        expect(yield* sessionTokens.resolve(Redacted.make("alice"))).toEqual(
          Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
        );
        expect(yield* Effect.flip(sessionTokens.resolve(Redacted.make("")))).toMatchObject({
          _tag: "SessionTokens.Rejected",
          reason: "malformed",
        });
      });
      yield* construction === "make"
        ? program.pipe(
            Effect.provideService(SessionTokens.Service, DevelopmentSessionTokens.make()),
          )
        : program.pipe(Effect.provide(DevelopmentSessionTokens.layer));
    }),
);
