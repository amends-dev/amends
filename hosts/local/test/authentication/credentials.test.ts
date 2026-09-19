import { expect, test } from "bun:test";
import { Credentials } from "@amends/gateway";
import { Identity } from "@amends/core/identity";
import { Effect, Redacted } from "effect";
import { DevelopmentCredentials } from "../../src/authentication/credentials.ts";

test.each(["make", "layer"] as const)(
  "development credentials %s trust asserted human IDs and reject empty tokens",
  async (construction) => {
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
    await Effect.runPromise(
      construction === "make"
        ? program.pipe(Effect.provideService(Credentials.Service, DevelopmentCredentials.make()))
        : program.pipe(Effect.provide(DevelopmentCredentials.layer)),
    );
  },
);
