import { BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Layer } from "effect";
import { LocalServer } from "./serve.ts";

/** Serve the application over one SQLite database on the loopback interface. */
const program = Effect.gen(function* () {
  const filename = yield* Config.String("AMENDS_DATABASE").pipe(
    Config.withDefault("amends.sqlite"),
  );
  const port = yield* Config.Int("AMENDS_PORT").pipe(Config.withDefault(8787));
  return yield* Layer.launch(LocalServer.layer(filename, port));
});

BunRuntime.runMain(program);
