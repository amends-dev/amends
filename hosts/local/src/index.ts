import { BunRuntime } from "@effect/platform-bun";
import { ConfigProvider, Effect, Layer } from "effect";
import { LocalConfig } from "./config.ts";
import { LocalHost } from "./host.ts";
import { LocalServer } from "./server.ts";

/** Serve the application on the loopback interface over the AMENDS_DATABASE_URL database. */
const program = Effect.gen(function* () {
  const { port, databaseUrl } = yield* LocalConfig.load();
  return yield* Layer.launch(LocalServer.layer(LocalHost.layer(databaseUrl), port));
});

BunRuntime.runMain(
  program.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ preserveEmptyStrings: true }),
    ),
  ),
);
