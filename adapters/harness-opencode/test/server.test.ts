import type { Sandbox } from "@amends/sandbox-v2";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { FetchHttpClient } from "effect/http";
import * as Server from "../src/Server.ts";
import { freePort, makeSandbox } from "./fixtures.ts";

/**
 * `connect` starts opencode's server through the sandbox, as here a stand-in for `opencode serve`
 * that starts the way opencode does, and waits for it on the live clock.
 */
const TestLayer = Layer.merge(BunServices.layer, FetchHttpClient.layer);

/** The stand-in for `opencode serve`, installed as a command that runs on this Bun. */
const installStandIn = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const command = path.join(yield* fs.makeTempDirectoryScoped(), "opencode");
  const source = yield* fs.readFileString(
    path.join(import.meta.dirname, "fake-opencode-server.js"),
  );
  yield* fs.writeFileString(command, `#!${process.execPath}\n${source}`);
  yield* fs.chmod(command, 0o755);
  return command;
});

/** A sandbox on a free port, and the options that start the stand-in there with `env`. */
const makeSetup = (env: Readonly<Record<string, string>> = {}) =>
  Effect.gen(function* () {
    const command = yield* installStandIn;
    const port = yield* freePort;
    const sandbox = yield* makeSandbox(port);
    const config = { model: "opencode/default-model" };
    return { sandbox, options: { command, port, config, env: { GREETING: "hello", ...env } } };
  });

/** How the stand-in was started in `sandbox`, once for each start. */
const startsIn = (sandbox: Sandbox.Sandbox["Service"]) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const starts = yield* sandbox.fileSystem.readFileString(
      path.join(sandbox.workingDirectory, "starts.jsonl"),
    );
    return starts
      .trim()
      .split("\n")
      .map((line): unknown => JSON.parse(line));
  });

describe("Server", () => {
  it.live("starts opencode's server when none answers, with its password and configuration", () =>
    Effect.gen(function* () {
      const { sandbox, options } = yield* makeSetup();

      const server = yield* Server.connect(sandbox, options);
      // The stand-in answers only with the password it started with.
      const hasProvider = yield* server.hasProvider("anthropic");

      expect(hasProvider).toBe(false);
      expect(yield* startsIn(sandbox)).toEqual([
        {
          args: ["serve", "--hostname=0.0.0.0", `--port=${options.port}`],
          config: { model: "opencode/default-model" },
          greeting: "hello",
        },
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.live(
    "keeps the server running after the host lets go, for the next one, until the sandbox stops",
    () =>
      Effect.gen(function* () {
        const { sandbox, options } = yield* makeSetup();

        const first = yield* Server.connect(sandbox, options);
        const next = yield* Server.connect(sandbox, options);
        const answered = yield* next.hasProvider("anthropic");
        yield* sandbox.stop;
        const refused = yield* Effect.flip(first.hasProvider("anthropic"));

        expect(answered).toBe(false);
        expect(yield* startsIn(sandbox)).toHaveLength(1);
        expect(refused.reason._tag).toBe("UnavailableError");
      }).pipe(Effect.provide(TestLayer)),
  );

  it.live("fails with UnavailableError when the server exits before it answers", () =>
    Effect.gen(function* () {
      const { sandbox, options } = yield* makeSetup({ FAKE_OPENCODE_EXIT: "3" });

      const refused = yield* Effect.flip(Server.connect(sandbox, options));

      expect(refused.reason).toMatchObject({
        _tag: "UnavailableError",
        description: "opencode's server exited with code 3 before it answered",
      });
    }).pipe(Effect.provide(TestLayer)),
  );
});
