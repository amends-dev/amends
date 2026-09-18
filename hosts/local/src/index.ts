import { BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer, Option } from "effect";
import { LocalHost } from "./host.ts";
import { LocalServer } from "./serve.ts";

/**
 * Serve the application on the loopback interface. AMENDS_DATABASE_URL selects
 * a PostgreSQL database; otherwise AMENDS_DATABASE names the SQLite file.
 */
const program = Effect.gen(function* () {
  const url = yield* Config.option(Config.Redacted("AMENDS_DATABASE_URL"));
  const filename = yield* Config.String("AMENDS_DATABASE").pipe(
    Config.withDefault("amends.sqlite"),
  );
  const port = yield* Config.Int("AMENDS_PORT").pipe(Config.withDefault(8787));
  const host = Option.match(url, {
    onNone: () => LocalHost.layer(filename),
    onSome: LocalHost.postgresLayer,
  });
  return yield* Layer.launch(LocalServer.layer(host, port));
});

BunRuntime.runMain(program);
