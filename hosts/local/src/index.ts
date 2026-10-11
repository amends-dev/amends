import { BunRuntime } from "@effect/platform-bun";
import { ConfigProvider, Effect, Layer } from "effect";
import * as DevelopmentAuthentication from "./DevelopmentAuthentication.ts";
import * as EmailAuthentication from "./EmailAuthentication.ts";
import * as LocalConfig from "./LocalConfig.ts";
import * as LocalHost from "./LocalHost.ts";
import * as LocalServer from "./LocalServer.ts";

/**
 * Serve the application on the loopback interface over the AMENDS_DATABASE_URL database, signing
 * people in as AMENDS_SIGN_IN says.
 */
const program = Effect.gen(function* () {
  const {
    port,
    databaseUrl,
    poolSize,
    runnerAddress,
    runnerTransport,
    runnerTakeover,
    credentialKey,
    sandboxDirectory,
    signIn,
  } = yield* LocalConfig.load();
  const authentication =
    signIn === "development"
      ? DevelopmentAuthentication.layer()
      : EmailAuthentication.layer(credentialKey);
  return yield* Layer.launch(
    LocalServer.layer(
      LocalHost.layer(databaseUrl, {
        poolSize,
        runnerAddress,
        runnerTransport,
        runnerTakeover,
        credentialKey,
        sandboxDirectory,
      }),
      authentication,
      port,
    ),
  );
});

BunRuntime.runMain(
  program.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromEnv({ preserveEmptyStrings: true }),
    ),
  ),
);
