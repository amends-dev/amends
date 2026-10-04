import { type Bridge, GenerateResult, Harness, type StreamPart } from "@amends/harness-v2";
import { SessionId } from "@amends/harness-v2/Agent";
import { DaytonaSandboxProvider } from "@amends/sandbox-daytona-v2";
import { Network, type Sandbox, type Template } from "@amends/sandbox-v2";
import { BunServices, BunSocket } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import {
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Path,
  Redacted,
  Schema,
  type Scope,
  Stream,
} from "effect";
import { Prompt } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import * as BridgeAgent from "../src/bridge/Agent.ts";
import * as OpencodeAgent from "../src/OpencodeAgent.ts";
import { freePort, makeSandbox } from "./fixtures.ts";

/**
 * These tests run real opencode, whose turns a model answers over the network, so they take a
 * minute and run only with `AMENDS_TEST_OPENCODE=1`. The agent as the bridge runs it runs opencode
 * 1.18.23 on the `PATH`; the agent as hosts run it runs the opencode its template installs in this
 * machine's home, under `~/.amends/opencode`, once for each version. Their model is a free one of
 * opencode's own provider, which needs no key; `AMENDS_TEST_OPENCODE_MODEL` names another.
 */
const enabled = process.env.AMENDS_TEST_OPENCODE === "1";
const model = process.env.AMENDS_TEST_OPENCODE_MODEL ?? "opencode/fledge-alpha-free";

const id = SessionId.make("live");
const timeout = 120_000;
const LiveLayer = Layer.merge(BunServices.layer, FetchHttpClient.layer);
const HostLayer = Layer.merge(BunServices.layer, BunSocket.layerWebSocketConstructor);

/**
 * opencode's configuration and its environment, which keeps opencode's configuration and data in
 * directories of their own, apart from this machine's opencode; it shares only its cache.
 */
const makeOpencodeSettings = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped();
  return {
    config: { model, autoupdate: false },
    env: {
      XDG_CONFIG_HOME: path.join(home, "config"),
      XDG_DATA_HOME: path.join(home, "data"),
      XDG_STATE_HOME: path.join(home, "state"),
    },
  };
});

/**
 * The opencode agent as a bridge runs it, on this machine, and a directory for its session.
 * opencode's server stops when the scope closes.
 */
const makeLiveAgent = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* fs.makeTempDirectoryScoped();
  const agent = yield* BridgeAgent.make({
    model,
    command: "opencode",
    ...(yield* makeOpencodeSettings),
  });
  return { agent, directory };
});

/** The sandboxes hosts run opencode in, the port its bridge listens on there, and its settings. */
interface Sandboxes {
  readonly freePort: Effect.Effect<Network.Port, unknown, Scope.Scope>;
  readonly settings: Effect.Effect<
    Pick<OpencodeAgent.Options, "config" | "env">,
    unknown,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  >;
  readonly create: (
    port: Network.Port,
    template: Template.Template | undefined,
  ) => Effect.Effect<Sandbox.Sandbox["Service"], unknown, Scope.Scope | HostServices>;
}

type HostServices = Layer.Success<typeof HostLayer>;

/** Directories on this machine, where opencode keeps apart from this machine's own. */
const localSandboxes: Sandboxes = {
  freePort,
  settings: makeOpencodeSettings,
  create: makeSandbox,
};

/** Machines of their own in Daytona's cloud, where nothing listens on a port yet. */
const daytonaSandboxes: Sandboxes = {
  freePort: Effect.succeed(Network.Port.make(4096)),
  settings: Effect.succeed({ config: { model, autoupdate: false } }),
  create: (port, template) =>
    Effect.gen(function* () {
      const provider = yield* DaytonaSandboxProvider.make({
        apiKey: Redacted.make(process.env.DAYTONA_API_KEY ?? ""),
      });
      return yield* Effect.acquireRelease(
        provider.create(template === undefined ? { ports: [port] } : { ports: [port], template }),
        (sandbox) => Effect.ignore(sandbox.destroy),
      );
    }),
};

/**
 * Harnesses over the opencode agent as two hosts run it, which share the secret their bridge tokens
 * derive from, and a new sandbox of `sandboxes` prepared with the agent's template. The bridge and
 * opencode's server stop with the sandbox when the scope closes.
 */
const makeLiveHosts = (sandboxes: Sandboxes) =>
  Effect.gen(function* () {
    const port = yield* sandboxes.freePort;
    const settings = yield* sandboxes.settings;
    const makeHarness = Effect.map(
      OpencodeAgent.make({
        model,
        port,
        token: (sandboxId) => Redacted.make(`the hosts' secret/${sandboxId}`),
        ...settings,
      }),
      Harness.make,
    );
    const harness = yield* makeHarness;
    const nextHarness = yield* makeHarness;
    const sandbox = yield* sandboxes.create(port, harness.template);
    return { sandbox, harness, nextHarness };
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

describe.skipIf(!enabled)("opencode as the bridge runs it", () => {
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

/** What hosts do with opencode through its bridge, on sandboxes of `sandboxes`. */
const describeHosts = (title: string, enabled: boolean, sandboxes: Sandboxes, timeout: number) =>
  describe.skipIf(!enabled)(title, () => {
    it.live(
      "runs a turn in which opencode runs a command with its own tool",
      () =>
        Effect.gen(function* () {
          const { sandbox, harness } = yield* makeLiveHosts(sandboxes);
          const session = yield* harness.startSession({ sandbox, id });

          const result = yield* session.generate({
            prompt:
              "Run `echo live-opencode` with your bash tool, then reply with what it printed.",
          });

          expect(result.parts.find((part) => part.type === "tool-call")).toEqual(
            expect.objectContaining({ name: "bash", providerExecuted: true }),
          );
          expect(result.text).toContain("live-opencode");
        }).pipe(Effect.provide(HostLayer)),
      timeout,
    );

    it.live(
      "continues on another host a suspended turn, which opencode went on with, from the step it was in",
      () =>
        Effect.gen(function* () {
          const { sandbox, harness, nextHarness } = yield* makeLiveHosts(sandboxes);
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
          const resumed = yield* nextHarness.resumeSession({ sandbox, state });
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
        }).pipe(Effect.provide(HostLayer)),
      timeout,
    );
  });

describeHosts("opencode as hosts run it, through its bridge", enabled, localSandboxes, timeout);

// Daytona's sandboxes cost money, so hosts run opencode there only with `AMENDS_TEST_DAYTONA=1` too.
describeHosts(
  "opencode as hosts run it on Daytona, through its bridge",
  enabled && process.env.AMENDS_TEST_DAYTONA === "1" && process.env.DAYTONA_API_KEY !== undefined,
  daytonaSandboxes,
  300_000,
);
