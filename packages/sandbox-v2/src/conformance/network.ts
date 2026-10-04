import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path, Record, Redacted, Schedule } from "effect";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { Port } from "../Network.ts";
import { layerServices } from "../Sandbox.ts";
import { type Fixture, useProvider } from "./Fixture.ts";

/** Reaching a sandbox's ports from outside it. */
export const network = <R>(fixture: Fixture<R>) =>
  layer(fixture.layer, { excludeTestServices: true })("sandbox network", (it) => {
    it.effect(
      "reaches a server on a declared port through the port's endpoint",
      () =>
        Effect.gen(function* () {
          const port = yield* fixture.freePort;
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create({ ports: [port] });
          yield* Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            yield* fs.writeFileString(path.join(sandbox.workingDirectory, "greeting.txt"), "hello");
            yield* spawner.spawn(fixture.serveFiles(port));
          }).pipe(Effect.provide(layerServices(sandbox)));

          const endpoint = yield* sandbox.endpoint(port, "http");
          const client = (yield* HttpClient.HttpClient).pipe(
            HttpClient.filterStatusOk,
            // The server listens a moment after it starts; until then requests fail.
            HttpClient.retry(
              Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
            ),
          );
          const response = yield* client.get(`${endpoint.url}/greeting.txt`, {
            headers: Record.map(endpoint.headers, Redacted.value),
          });

          expect(yield* response.text).toBe("hello");
        }),
      fixture.timeout,
    );

    it.effect(
      "gives a WebSocket URL for a declared port's ws endpoint",
      () =>
        Effect.gen(function* () {
          const port = Port.make(3000);
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create({ ports: [port] });

          const endpoint = yield* sandbox.endpoint(port, "ws");

          expect(endpoint.url).toMatch(/^wss?:\/\//);
        }),
      fixture.timeout,
    );

    it.effect(
      "fails with NotFoundError for a port the sandbox was not created with",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create({ ports: [Port.make(3000)] });

          const error = yield* Effect.flip(sandbox.endpoint(Port.make(3001), "http"));

          expect(error.reason._tag).toBe("NotFoundError");
        }),
      fixture.timeout,
    );
  });
