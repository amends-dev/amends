import { type Bridge, GenerateResult, type StreamPart } from "@amends/harness-v2";
import { SessionId } from "@amends/harness-v2/Agent";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { Prompt } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import * as OpencodeAgent from "../src/bridge/Agent.ts";

/**
 * These tests run real opencode, 1.18.23 on the `PATH`, whose turns a model answers over the
 * network, so they take a minute and run only with `AMENDS_TEST_OPENCODE=1`. Their model is a free
 * one of opencode's own provider, which needs no key; `AMENDS_TEST_OPENCODE_MODEL` names another.
 */
const enabled = process.env.AMENDS_TEST_OPENCODE === "1";
const model = process.env.AMENDS_TEST_OPENCODE_MODEL ?? "opencode/fledge-alpha-free";

const id = SessionId.make("live");
const timeout = 120_000;
const LiveLayer = Layer.merge(BunServices.layer, FetchHttpClient.layer);

/**
 * The opencode agent as a bridge runs it, on this machine, and a directory for its session.
 * opencode keeps its configuration and data in directories of its own, apart from this machine's
 * opencode, and shares only its cache; its server stops when the scope closes.
 */
const makeLiveAgent = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped();
  const directory = path.join(home, "work");
  yield* fs.makeDirectory(directory);
  const agent = yield* OpencodeAgent.make({
    model,
    command: "opencode",
    config: { model, autoupdate: false },
    env: {
      XDG_CONFIG_HOME: path.join(home, "config"),
      XDG_DATA_HOME: path.join(home, "data"),
      XDG_STATE_HOME: path.join(home, "state"),
    },
  });
  return { agent, directory };
});

const turnOptions = (text: string, options: Partial<Bridge.TurnOptions> = {}) => ({
  prompt: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] }),
  tools: [],
  responseFormat: { type: "text" } as const,
  ...options,
});

/** Runs a turn asking `text` to its end, returning it whole. */
const runTurn = (
  session: Bridge.AgentSession,
  text: string,
  options?: Partial<Bridge.TurnOptions>,
) =>
  Effect.map(
    Stream.runCollect(session.prompt(turnOptions(text, options))),
    (parts: ReadonlyArray<StreamPart.StreamPart>) => new GenerateResult.GenerateResult(parts),
  );

/** The opencode session a session's state names. */
const OpencodeState = Schema.Struct({ sessionID: Schema.String });

describe.skipIf(!enabled)("OpencodeAgent on opencode", () => {
  it.live(
    "runs a turn in which opencode runs a command with its own tool",
    () =>
      Effect.gen(function* () {
        const { agent, directory } = yield* makeLiveAgent;
        const session = yield* agent.start({ id, directory, history: Prompt.empty });

        const result = yield* runTurn(
          session,
          "Run `echo live-opencode` with your bash tool, then reply with what it printed.",
        );

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
    "answers from another agent's conversation, the results of its tools included",
    () =>
      Effect.gen(function* () {
        const { agent, directory } = yield* makeLiveAgent;
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
        const session = yield* agent.start({ id, directory, history });

        const result = yield* runTurn(
          session,
          "Without using any tools: what is the codename, and how many degrees Celsius did the weather tool return? Reply with both on one line.",
        );

        expect(result.text).toContain("BLUE-MARLIN-9");
        expect(result.text).toContain("14");
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "ends a turn whose model opencode cannot load with an error",
    () =>
      Effect.gen(function* () {
        const { agent, directory } = yield* makeLiveAgent;
        const session = yield* agent.start({ id, directory, history: Prompt.empty });

        const result = yield* runTurn(session, "Say hi.", { model: "opencode/no-such-model" });

        expect(result.finishReason).toBe("error");
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "deletes the session in opencode when it is destroyed",
    () =>
      Effect.gen(function* () {
        const { agent, directory } = yield* makeLiveAgent;
        const session = yield* agent.start({ id, directory, history: Prompt.empty });
        const agentState = yield* session.state;

        yield* session.destroy;
        // opencode no longer has the session, so the agent starts another.
        const again = yield* agent.start({ id, directory, history: Prompt.empty, agentState });

        const before = yield* Schema.decodeUnknownEffect(OpencodeState)(agentState);
        const after = yield* Schema.decodeUnknownEffect(OpencodeState)(yield* again.state);
        expect(after.sessionID).not.toBe(before.sessionID);
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "stops the turn in opencode when its stream ends before the turn does",
    () =>
      Effect.gen(function* () {
        const { agent, directory } = yield* makeLiveAgent;
        const session = yield* agent.start({ id, directory, history: Prompt.empty });

        yield* session
          .prompt(turnOptions("Run `sleep 300` with your bash tool, then say done."))
          .pipe(
            Stream.takeUntil((part) => part.type === "tool-call"),
            Stream.runDrain,
          );
        // A turn opencode still ran would keep the next waiting for five minutes.
        const next = yield* runTurn(session, "Reply with just the word: ready");

        expect(next.finishReason).not.toBe("error");
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );
});
