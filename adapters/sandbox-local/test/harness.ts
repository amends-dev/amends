import type { Harness } from "@amends/sandbox-conformance";
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Random } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { LocalSandbox } from "../src/index.ts";

/** A provider over a temporary directory for each test, removed when the test ends. */
export const harness: Harness = {
  name: "local",
  available: true,
  provider: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "amends-sandbox-" });
    return yield* LocalSandbox.make({ root });
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
  port: Random.nextIntBetween(20_000, 40_000),
  timeout: 20_000,
  http: FetchHttpClient.layer,
};
