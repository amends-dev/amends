import { Network, Sandbox } from "@amends/sandbox-v2";
import { BunHttpServer, BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Record, Redacted, Schedule } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { TestClock } from "effect/testing";
import { makeProvider } from "./provider.ts";

/** A port on this machine that nothing listens on, for a server the test starts on it. */
const freePort = Effect.scoped(
  Effect.flatMap(BunHttpServer.make({ hostname: "127.0.0.1", port: 0 }), ({ address }) =>
    address._tag === "UnixPathAddress"
      ? Effect.die("The server listens on no port")
      : Effect.succeed(Network.Port.make(address.port)),
  ),
);

/** A server, run by Bun, that answers with `greeting.txt` from where it starts, on `PORT`. */
const serveGreeting = `Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT),
  fetch: () => new Response(Bun.file("greeting.txt")),
})`;

layer(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer))("sandbox network", (it) => {
  it.effect("reaches a server on a declared port through the port's endpoint", () =>
    Effect.gen(function* () {
      const port = yield* freePort;
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ ports: [port] });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        yield* fs.writeFileString(path.join(sandbox.workingDirectory, "greeting.txt"), "hello");
        // The server runs on the Bun running the tests, so they need nothing else installed.
        yield* spawner.spawn(
          ChildProcess.make(process.execPath, ["-e", serveGreeting], {
            env: { PORT: String(port) },
            extendEnv: true,
          }),
        );
      }).pipe(Effect.provide(Sandbox.layerServices(sandbox)));

      const endpoint = yield* sandbox.endpoint(port, "http");
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
        // The server listens shortly after it starts, so requests are refused until then.
        HttpClient.retryTransient({ schedule: Schedule.spaced("100 millis"), times: 50 }),
      );
      // The retries wait on the live clock, as the server starts on it.
      const response = yield* TestClock.withLive(
        client.get(`${endpoint.url}/greeting.txt`, {
          headers: Record.map(endpoint.headers, Redacted.value),
        }),
      );

      expect(yield* response.text).toBe("hello");
    }),
  );

  it.effect("gives a WebSocket URL for a declared port's ws endpoint", () =>
    Effect.gen(function* () {
      const port = Network.Port.make(3000);
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ ports: [port] });

      const endpoint = yield* sandbox.endpoint(port, "ws");

      expect(endpoint.url).toMatch(/^wss?:\/\//);
    }),
  );

  it.effect("fails with NotFoundError for a port the sandbox was not created with", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ ports: [Network.Port.make(3000)] });

      const error = yield* Effect.flip(sandbox.endpoint(Network.Port.make(3001), "http"));

      expect(error.reason._tag).toBe("NotFoundError");
    }),
  );
});
