import { Harness } from "@amends/harness-v2";
import { SessionId } from "@amends/harness-v2/Agent";
import { type Network, Template } from "@amends/sandbox-v2";
import { BunServices, BunSocket } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted, Schedule } from "effect";
import {
  freePort,
  installStandIn,
  isRunning,
  makeBridgedAgent,
  makeSandbox,
  startsIn,
} from "./fixtures.ts";

/**
 * The bridge client launches opencode's bridge program, `main.ts`, in a sandbox on this machine, as
 * a host does, with the stand-in for `opencode serve` as the command that runs opencode.
 */
const TestLayer = Layer.merge(BunServices.layer, BunSocket.layerWebSocketConstructor);

const config = { autoupdate: false };

/** A harness over opencode's bridge program on `port`, which runs opencode as `command`. */
const makeHarness = (
  port: Network.Port,
  command: string,
  env: Readonly<Record<string, string>> = {},
) =>
  Effect.map(
    makeBridgedAgent({
      id: "opencode",
      template: { name: Template.Name.make("opencode"), identity: "none", prepare: Effect.void },
      port,
      command: process.execPath,
      args: [`${import.meta.dirname}/../src/bridge/main.ts`],
      token: (sandboxId) => Redacted.make(`the hosts' secret/${sandboxId}`),
      agentOptions: {
        model: { providerID: "opencode", id: "default-model" },
        models: {},
        command,
        config,
        env: { GREETING: "hello", ...env },
      },
    }),
    Harness.make,
  );

describe("opencode's bridge program", () => {
  it.live("starts opencode's server with the agent options when a session starts", () =>
    Effect.gen(function* () {
      const { command, directory } = yield* installStandIn;
      const port = yield* freePort;
      const sandbox = yield* makeSandbox(port);
      const harness = yield* makeHarness(port, command);

      yield* harness.startSession({ sandbox, id: SessionId.make("session-1") });

      expect(yield* startsIn(directory)).toMatchObject([
        { args: ["serve", "--hostname=127.0.0.1", "--port=0"], config, greeting: "hello" },
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.live("exits when opencode's server exits by itself, for the next host to launch both", () =>
    Effect.gen(function* () {
      const { command, directory } = yield* installStandIn;
      const port = yield* freePort;
      const sandbox = yield* makeSandbox(port);
      const harness = yield* makeHarness(port, command, { FAKE_OPENCODE_EXIT_AFTER: "200" });
      yield* harness.startSession({ sandbox, id: SessionId.make("session-1") });
      const [started] = yield* startsIn(directory);
      // The server runs until the bridge has learned that it exited.
      yield* isRunning(started?.pid ?? 0).pipe(
        Effect.repeat({ while: (running) => running, schedule: Schedule.spaced("50 millis") }),
      );
      const nextHarness = yield* makeHarness(port, command);

      // A bridge still running would start no second server, but fail the session on the one that
      // exited, until it exits too; the bridge the next host launches then starts its own.
      yield* nextHarness
        .startSession({ sandbox, id: SessionId.make("session-2") })
        .pipe(
          Effect.retry(
            Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "10 seconds" })),
          ),
        );

      expect(yield* startsIn(directory)).toHaveLength(2);
    }).pipe(Effect.provide(TestLayer)),
  );
});
