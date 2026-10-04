import { Agent, Harness, type StreamPart } from "@amends/harness-v2";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, FileSystem, Layer, Path, Schedule, Schema, Stream } from "effect";
import { Prompt } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import * as OpencodeAgent from "../src/OpencodeAgent.ts";
import * as Server from "../src/Server.ts";
import { freePort, makeSandbox } from "./fixtures.ts";

/**
 * These tests run real opencode, 1.18.23 on the `PATH`, whose turns a model answers over the
 * network, so they take a minute and run only with `AMENDS_TEST_OPENCODE=1`. Their model is a free
 * one of opencode's own provider, which needs no key; `AMENDS_TEST_OPENCODE_MODEL` names another.
 */
const enabled = process.env.AMENDS_TEST_OPENCODE === "1";
const model = process.env.AMENDS_TEST_OPENCODE_MODEL ?? "opencode/fledge-alpha-free";

const id = Agent.SessionId.make("live");
const timeout = 120_000;
const LiveLayer = Layer.merge(BunServices.layer, FetchHttpClient.layer);

/**
 * A harness over the opencode agent in a new local sandbox, whose server stops with the sandbox when
 * the scope closes. opencode keeps its configuration and data in directories of its own, apart from
 * this machine's opencode, and shares only its cache.
 */
const makeLiveHarness = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const port = yield* freePort;
  const home = yield* fs.makeTempDirectoryScoped();
  const sandbox = yield* makeSandbox(port);
  const serverOptions = {
    command: "opencode",
    port,
    config: { model, autoupdate: false },
    env: {
      XDG_CONFIG_HOME: path.join(home, "config"),
      XDG_DATA_HOME: path.join(home, "data"),
      XDG_STATE_HOME: path.join(home, "state"),
    },
  };
  const agent = yield* OpencodeAgent.make({ model, ...serverOptions });
  return { sandbox, harness: Harness.make(agent), serverOptions };
});

/** The opencode session a session's agent state names. */
const OpencodeState = Schema.Struct({ sessionID: Schema.String });

describe.skipIf(!enabled)("OpencodeAgent on opencode", () => {
  it.live(
    "runs a turn in which opencode runs a command with its own tool",
    () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeLiveHarness;
        const session = yield* harness.startSession({ sandbox, id });

        const result = yield* session.generate({
          prompt: "Run `echo live-opencode` with your bash tool, then reply with what it printed.",
        });

        expect(result.parts.find((part) => part.type === "tool-call")).toEqual(
          expect.objectContaining({ name: "bash", providerExecuted: true }),
        );
        expect(
          result.parts.some(
            (part) =>
              part.type === "tool-result" && JSON.stringify(part.result).includes("live-opencode"),
          ),
        ).toBe(true);
        expect(result.text).toContain("live-opencode");
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "continues a suspended turn, which opencode went on with, from the step it was in",
    () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeLiveHarness;
        const session = yield* harness.startSession({ sandbox, id });
        const before: Array<StreamPart.StreamPart> = [];
        const calledTool = yield* Deferred.make<void>();

        const reading = yield* session
          .stream({
            prompt:
              "Run `sleep 2; echo slept` with your bash tool, then reply with what it printed.",
          })
          .pipe(
            Stream.runForEach((part) =>
              Effect.andThen(
                Effect.sync(() => before.push(part)),
                part.type === "tool-call" ? Deferred.succeed(calledTool, undefined) : Effect.void,
              ),
            ),
            Effect.forkChild,
          );
        yield* Deferred.await(calledTool);
        const state = yield* session.suspend;
        yield* Fiber.join(reading);
        const resumed = yield* harness.resumeSession({ sandbox, state });
        const after = yield* Stream.runCollect(resumed.continue({}));
        const history = (yield* resumed.detach).history.content;

        // The session had no step of the turn finished, so the step with the call comes again.
        expect(before.at(-1)?.type).toBe("tool-call");
        expect(after.filter((part) => part.type === "tool-call")).toHaveLength(1);
        expect(after.filter((part) => part.type === "tool-result")).toEqual([
          expect.objectContaining({ isFailure: false }),
        ]);
        expect(after.at(-1)?.type).toBe("finish");
        expect(
          history.flatMap((message) =>
            message.role === "assistant"
              ? message.content.filter((part) => part.type === "tool-call")
              : [],
          ),
        ).toHaveLength(1);
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "answers from another agent's conversation, the results of its tools included",
    () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeLiveHarness;
        const history = Prompt.make([
          {
            role: "user",
            content: "Remember the codename BLUE-MARLIN-9, then check the weather in Lisbon.",
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                id: "call_1",
                name: "lookup_weather",
                params: { city: "Lisbon" },
                providerExecuted: false,
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                id: "call_1",
                name: "lookup_weather",
                isFailure: false,
                result: { forecast: "foggy", celsius: 14 },
                providerExecuted: false,
              },
            ],
          },
          { role: "assistant", content: [{ type: "text", text: "Noted." }] },
        ]);
        const session = yield* harness.resumeSession({
          sandbox,
          state: { id, agent: "amends", history },
        });

        const result = yield* session.generate({
          prompt:
            "Without using any tools: what is the codename, and how many degrees Celsius did the weather tool return? Reply with both on one line.",
        });

        expect(result.text).toContain("BLUE-MARLIN-9");
        expect(result.text).toContain("14");
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "fails a turn whose model opencode cannot load",
    () =>
      Effect.gen(function* () {
        const { sandbox, harness } = yield* makeLiveHarness;
        const session = yield* harness.startSession({ sandbox, id });

        const error = yield* Effect.flip(
          session.generate({ prompt: "Say hi.", model: "opencode/no-such-model" }),
        );

        expect(error._tag === "HarnessError" && error.reason._tag).toBe("TurnFailedError");
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "deletes the session in opencode when it is destroyed, also after it was detached",
    () =>
      Effect.gen(function* () {
        const { sandbox, harness, serverOptions } = yield* makeLiveHarness;
        const session = yield* harness.startSession({ sandbox, id });
        const { sessionID } = yield* Schema.decodeUnknownEffect(OpencodeState)(
          (yield* session.detach).agentState,
        );
        const server = yield* Server.connect(sandbox, serverOptions);
        const existed = yield* server.hasSession(sessionID);

        yield* session.destroy;

        expect(existed).toBe(true);
        expect(yield* server.hasSession(sessionID)).toBe(false);
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "stops the turn in opencode when the caller stops reading it",
    () =>
      Effect.gen(function* () {
        const { sandbox, harness, serverOptions } = yield* makeLiveHarness;
        const session = yield* harness.startSession({ sandbox, id });

        yield* session
          .stream({ prompt: "Run `sleep 60` with your bash tool, then say done." })
          .pipe(
            Stream.takeUntil((part) => part.type === "tool-call"),
            Stream.runDrain,
          );

        const { sessionID } = yield* Schema.decodeUnknownEffect(OpencodeState)(
          (yield* session.detach).agentState,
        );
        const server = yield* Server.connect(sandbox, serverOptions);
        yield* server.isRunning(sessionID).pipe(
          Effect.repeat({
            while: (isRunning) => isRunning,
            schedule: Schedule.spaced("100 millis"),
          }),
          Effect.timeout("10 seconds"),
        );
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );
});
