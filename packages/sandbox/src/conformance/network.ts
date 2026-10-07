import { expect, layer } from "@effect/vitest";
import { Effect, Exit, Record, Redacted, Schedule } from "effect";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { NetworkPolicy } from "../Network.ts";
import { layerServices } from "../Sandbox.ts";
import type { SandboxError } from "../SandboxError.ts";
import { type Fixture, newSandboxId, useProvider } from "./Fixture.ts";

/** Whether `change` was applied, or the reason it failed with. */
const outcomeOf = (change: Effect.Effect<void, SandboxError>) =>
  change.pipe(
    Effect.as("applied"),
    Effect.catch((error) => Effect.succeed(error.reason._tag)),
  );

/** Reaching a sandbox's ports from outside it, and what the sandbox reaches outside. */
export const network = <R>(fixture: Fixture<R>) =>
  layer(fixture.layer, { excludeTestServices: true })("sandbox network", (it) => {
    it.effect(
      "reaches a server on a declared port through the port's endpoint, with the request's headers",
      () =>
        Effect.gen(function* () {
          const port = yield* fixture.freePort;
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create({ ports: [port] });
          yield* Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            yield* spawner.spawn(fixture.serveHeaders(port));
          }).pipe(Effect.provide(layerServices(sandbox)));

          const endpoint = yield* sandbox.endpoint(port, "http");
          const client = (yield* HttpClient.HttpClient).pipe(
            HttpClient.filterStatusOk,
            // The server listens a moment after it starts; until then requests fail.
            HttpClient.retry(
              Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
            ),
          );
          const response = yield* client.get(endpoint.url, {
            headers: {
              ...Record.map(endpoint.headers, Redacted.value),
              authorization: "Bearer conformance",
              "x-conformance": "passed on",
            },
          });

          expect(yield* response.json).toMatchObject({
            authorization: "Bearer conformance",
            "x-conformance": "passed on",
          });
        }),
      fixture.timeout,
    );

    it.effect(
      "gives a WebSocket URL for a declared port's ws endpoint",
      () =>
        Effect.gen(function* () {
          const port = yield* fixture.freePort;
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
          const port = yield* fixture.freePort;
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create();

          const error = yield* Effect.flip(sandbox.endpoint(port, "http"));

          expect(error.reason._tag).toBe("NotFoundError");
        }),
      fixture.timeout,
    );

    it.effect(
      "creates a sandbox under a network policy, or fails with UnsupportedError and creates none",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const id = yield* newSandboxId;

          const outcome = yield* outcomeOf(
            Effect.asVoid(
              provider.create({ id, networkPolicy: NetworkPolicy.cases.DenyAll.make({}) }),
            ),
          );
          const resumed = yield* Effect.exit(provider.resume(id));

          expect(["applied", "UnsupportedError"]).toContain(outcome);
          expect(Exit.isSuccess(resumed)).toBe(outcome === "applied");
        }),
      fixture.timeout,
    );

    it.effect(
      "applies a network policy and request transformations, or fails with UnsupportedError",
      () =>
        Effect.gen(function* () {
          const provider = yield* useProvider(fixture);
          const sandbox = yield* provider.create();

          const policy = yield* outcomeOf(
            sandbox.setNetworkPolicy(NetworkPolicy.cases.DenyAll.make({})),
          );
          const transformations = yield* outcomeOf(
            sandbox.addRequestTransformations([
              {
                host: "api.example.com",
                matchHeaders: { authorization: "Bearer placeholder" },
                setHeaders: { authorization: Redacted.make("Bearer secret") },
              },
            ]),
          );

          expect(["applied", "UnsupportedError"]).toContain(policy);
          expect(["applied", "UnsupportedError"]).toContain(transformations);
        }),
      fixture.timeout,
    );
  });
