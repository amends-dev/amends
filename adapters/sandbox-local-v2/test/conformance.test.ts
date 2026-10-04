import { LocalSandboxProvider } from "@amends/sandbox-local-v2";
import { Network } from "@amends/sandbox-v2";
import * as Conformance from "@amends/sandbox-v2/conformance";
import { BunHttpServer, BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { ChildProcess } from "effect/process";

/** A server, run by Bun, that serves the files of the directory it starts in on `PORT`. */
const serveFiles = `Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT),
  fetch: (request) => new Response(Bun.file("." + new URL(request.url).pathname)),
})`;

/**
 * The local provider runs the conformance suites over a temporary directory, which is removed
 * with every sandbox in it when each test ends. Its sandboxes' ports are this machine's, so the
 * network suite takes a port nothing listens on, and serves files with the Bun running the tests.
 */
Conformance.run({
  layer: Layer.merge(BunServices.layer, FetchHttpClient.layer),
  makeProvider: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* LocalSandboxProvider.make({ directory: yield* fs.makeTempDirectoryScoped() });
  }),
  freePort: Effect.scoped(
    Effect.flatMap(BunHttpServer.make({ hostname: "127.0.0.1", port: 0 }), ({ address }) =>
      address._tag === "UnixPathAddress"
        ? Effect.die("The server listens on no port")
        : Effect.succeed(Network.Port.make(address.port)),
    ),
  ),
  serveFiles: (port) =>
    ChildProcess.make(process.execPath, ["-e", serveFiles], {
      env: { PORT: String(port) },
      extendEnv: true,
    }),
});
