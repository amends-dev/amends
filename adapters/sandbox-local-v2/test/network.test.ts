import { Network, Sandbox } from "@amends/sandbox-v2";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Random, Record, Redacted, Schedule } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { makeProvider } from "./provider.ts";

const services = Layer.mergeAll(BunServices.layer, FetchHttpClient.layer);

describe("sandbox network", () => {
  it.live("reaches a server on a declared port through the port's endpoint", () =>
    Effect.gen(function* () {
      const port = Network.Port.make(yield* Random.nextIntBetween(20_000, 60_000));
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ ports: [port] });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        yield* fs.writeFileString(path.join(sandbox.workingDirectory, "greeting.txt"), "hello");
        yield* spawner.spawn(ChildProcess.make("python3", ["-m", "http.server", String(port)]));
      }).pipe(Effect.provide(Sandbox.layerServices(sandbox)));

      const endpoint = yield* sandbox.endpoint(port, "http");
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
        // The server listens shortly after it starts, so requests are refused until then.
        HttpClient.retryTransient({ schedule: Schedule.spaced("100 millis"), times: 50 }),
      );
      const response = yield* client.get(`${endpoint.url}/greeting.txt`, {
        headers: Record.map(endpoint.headers, Redacted.value),
      });

      expect(yield* response.text).toBe("hello");
    }).pipe(Effect.provide(services)),
  );

  it.effect("gives a WebSocket URL for a declared port's ws endpoint", () =>
    Effect.gen(function* () {
      const port = Network.Port.make(3000);
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ ports: [port] });

      const endpoint = yield* sandbox.endpoint(port, "ws");

      expect(endpoint.url).toMatch(/^wss?:\/\//);
    }).pipe(Effect.provide(services)),
  );

  it.effect("fails with NotFoundError for a port the sandbox was not created with", () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider;
      const sandbox = yield* provider.create({ ports: [Network.Port.make(3000)] });

      const error = yield* Effect.flip(sandbox.endpoint(Network.Port.make(3001), "http"));

      expect(error.reason._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(services)),
  );
});
