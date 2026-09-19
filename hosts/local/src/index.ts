import { BunRuntime } from "@effect/platform-bun";
import { ConfigProvider, Effect, Layer } from "effect";
import { LocalConfig } from "./config.ts";
import { LocalHost } from "./host.ts";
import { LocalServer } from "./server.ts";

/**
 * Serve the application on the loopback interface. AMENDS_DATABASE_URL selects
 * a PostgreSQL database; otherwise AMENDS_DATABASE names the SQLite file.
 */
const program = Effect.gen(function* () {
  const { port, storage } = yield* LocalConfig.load();
  const host = LocalConfig.Storage.$match(storage, {
    Sqlite: ({ filename }) => LocalHost.layerSqlite(filename),
    Postgres: ({ url }) => LocalHost.layerPostgres(url),
  });
  return yield* Layer.launch(LocalServer.layer(host, port));
});

BunRuntime.runMain(
  program.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ preserveEmptyStrings: true }),
    ),
  ),
);
