import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import * as Server from "../src/bridge/Server.ts";
import { installStandIn, isRunning, startsIn } from "./fixtures.ts";

/**
 * `start` runs opencode's server on this machine, as here a stand-in for `opencode serve` that
 * starts the way opencode does, and waits for it on the live clock.
 */
const TestLayer = Layer.merge(BunServices.layer, FetchHttpClient.layer);

/** The options that start the stand-in installed as `command`, with `env` beside a greeting. */
const optionsFor = (command: string, env: Readonly<Record<string, string>> = {}) => ({
  command,
  config: { model: "opencode/default-model" },
  env: { GREETING: "hello", ...env },
});

describe("Server", () => {
  it.live("starts opencode's server on this machine, answering behind the password it made", () =>
    Effect.gen(function* () {
      const { command, directory } = yield* installStandIn;

      const server = yield* Server.start(optionsFor(command));
      // The stand-in answers only with the password it started with.
      const hasProvider = yield* server.hasProvider("anthropic");

      expect(hasProvider).toBe(false);
      expect(yield* startsIn(directory)).toMatchObject([
        {
          args: ["serve", "--hostname=127.0.0.1", "--port=0"],
          config: { model: "opencode/default-model" },
          greeting: "hello",
        },
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.live("stops the server when the scope closes", () =>
    Effect.gen(function* () {
      const { command, directory } = yield* installStandIn;

      yield* Effect.scoped(Server.start(optionsFor(command)));
      const [started] = yield* startsIn(directory);

      expect(started).toBeDefined();
      expect(yield* isRunning(started?.pid ?? 0)).toBe(false);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.live("reports when the server exits by itself", () =>
    Effect.gen(function* () {
      const { command } = yield* installStandIn;

      const server = yield* Server.start(optionsFor(command, { FAKE_OPENCODE_EXIT_AFTER: "100" }));

      // The test ends only once the server reports its exit.
      yield* server.exited;
    }).pipe(Effect.provide(TestLayer)),
  );

  it.live("fails with UnavailableError when the server exits before it listens", () =>
    Effect.gen(function* () {
      const { command } = yield* installStandIn;

      const refused = yield* Effect.flip(
        Server.start(optionsFor(command, { FAKE_OPENCODE_EXIT: "3" })),
      );

      expect(refused.reason).toMatchObject({
        _tag: "UnavailableError",
        description: "opencode's server exited with code 3 before it listened",
      });
    }).pipe(Effect.provide(TestLayer)),
  );
});
