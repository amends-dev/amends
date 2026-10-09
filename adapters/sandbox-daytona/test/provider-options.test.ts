import { DaytonaSandboxProvider } from "@amends/sandbox-daytona";
import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import { serveDaytona } from "./fake-daytona.ts";

layer(BunServices.layer)("DaytonaSandboxProvider.providerOptions", (it) => {
  it.effect(
    "fails with InvalidOptionsError for options Daytona does not take, asking nothing",
    () =>
      Effect.gen(function* () {
        const daytona = yield* serveDaytona(200);
        const provider = yield* DaytonaSandboxProvider.make({
          apiKey: Redacted.make("secret-key"),
          apiUrl: daytona.apiUrl,
        });

        const error = yield* Effect.flip(
          provider.create({ providerOptions: { daytona: { snapshot: 42 } } }),
        );

        expect(error.reason._tag).toBe("InvalidOptionsError");
        expect(daytona.received).toEqual([]);
      }),
  );
});
