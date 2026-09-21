import { expect, it } from "@effect/vitest";
import { Credentials } from "@amends/gateway";
import { Identity } from "@amends/core/identity";
import { Effect, Redacted } from "effect";
import { DevelopmentCredentials } from "../../src/authentication/credentials.ts";

it.effect.each(["make", "layer"] as const)(
  "development credentials %s trust asserted human IDs and reject empty tokens",
  (construction) =>
    Effect.gen(function* () {
      const program = Effect.gen(function* () {
        const credentials = yield* Credentials.Service;
        expect(yield* credentials.resolve(Redacted.make("alice"))).toEqual(
          Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
        );
        expect(yield* Effect.flip(credentials.resolve(Redacted.make("")))).toMatchObject({
          _tag: "Credentials.Rejected",
          reason: "malformed",
        });
      });
      yield* construction === "make"
        ? program.pipe(Effect.provideService(Credentials.Service, DevelopmentCredentials.make()))
        : program.pipe(Effect.provide(DevelopmentCredentials.layer));
    }),
);
