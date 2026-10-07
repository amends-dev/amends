import { Connection, Integrations, ModelCatalog, ModelIntegrations } from "@amends/connection";
import {
  type Bridge,
  GenerateResult,
  Harness,
  type ModelEndpoint,
  type StreamPart,
} from "@amends/harness";
import { SessionId } from "@amends/harness/Agent";
import { DaytonaSandboxProvider } from "@amends/sandbox-daytona";
import { LocalSandboxProvider } from "@amends/sandbox-local";
import type { Sandbox, Template } from "@amends/sandbox";
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
  Result,
  Schema,
  type Scope,
  Stream,
} from "effect";
import { Prompt } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import * as OpencodeDriver from "../src/bridge/Driver.ts";
import * as Models from "../src/Models.ts";
import * as OpencodeAgent from "../src/OpencodeAgent.ts";
import { makeSandbox } from "./fixtures.ts";

/**
 * These tests run real opencode, whose turns a model answers over the network, so they take a
 * minute and run only with `AMENDS_TEST_OPENCODE=1`. opencode's driver, as the bridge runs it, runs
 * opencode 1.18.23 on the `PATH`; the agent as hosts run it runs the opencode its template installs in this
 * machine's home, under `~/.amends/opencode`, once for each version. Their model is the catalog's
 * free one of opencode's own provider, which needs no key; `AMENDS_TEST_OPENCODE_MODEL` names
 * another of the catalog's, as `provider/model`, and `AMENDS_TEST_OPENCODE_API_KEY` the key for it.
 * Hosts also set opencode up from a workspace's connections, to OpenRouter, whose free model it runs
 * on with the key in `OPENROUTER_API_KEY`, as `bun --env-file=hosts/local/.env` gives it, to the
 * agent, and to sandboxes.
 */
const enabled = process.env.AMENDS_TEST_OPENCODE === "1";
const modelName = process.env.AMENDS_TEST_OPENCODE_MODEL ?? "opencode/fledge-alpha-free";
const apiKey = process.env.AMENDS_TEST_OPENCODE_API_KEY;

const id = SessionId.make("live");
const timeout = 120_000;
const LiveLayer = Layer.mergeAll(BunServices.layer, FetchHttpClient.layer, ModelCatalog.layer);
const HostLayer = Layer.mergeAll(
  BunServices.layer,
  BunSocket.layerWebSocketConstructor,
  ModelCatalog.layer,
);

/** The endpoint of the catalog's model that `AMENDS_TEST_OPENCODE_MODEL` names, as a host makes it. */
const makeEndpoint = Effect.gen(function* () {
  const catalog = yield* ModelCatalog.ModelCatalog;
  const slash = modelName.indexOf("/");
  const [providerId, modelId] = [modelName.slice(0, slash), modelName.slice(slash + 1)];
  const model = yield* catalog.findModel(providerId, modelId);
  if (model === undefined) return yield* Effect.die(`The catalog has no ${modelName}`);
  return {
    provider: providerId,
    model: model.id,
    protocol: model.protocol,
    url: model.url,
    ...(apiKey === undefined ? {} : { apiKey: Redacted.make(apiKey) }),
  } satisfies ModelEndpoint.ModelEndpoint;
});

/** opencode's configuration, which keeps opencode from updating itself. */
const config = { autoupdate: false };

/**
 * The environment of opencode, which keeps opencode's data in directories of its own, apart from
 * this machine's opencode; it shares only its cache.
 */
const makeOpencodeEnv = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped();
  return {
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_DATA_HOME: path.join(home, "data"),
    XDG_STATE_HOME: path.join(home, "state"),
  };
});

/**
 * opencode's driver as a bridge runs it, on this machine, on `endpoints` or the model the tests
 * run on, and a directory for its session. opencode's server stops when the scope closes.
 */
const makeLiveDriver = (endpoints?: Parameters<typeof Models.fromEndpoints>[0]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped();
    const models = Result.getOrThrow(
      Models.fromEndpoints(endpoints ?? { model: yield* makeEndpoint, models: {} }),
    );
    const driver = yield* OpencodeDriver.make({
      model: models.model,
      models: models.models,
      command: "opencode",
      config: { ...config, providers: models.providers },
      env: yield* makeOpencodeEnv,
    });
    return { driver, directory };
  });

/** The sandboxes hosts run opencode in, and opencode's environment. */
interface Sandboxes {
  readonly env: Effect.Effect<
    OpencodeAgent.Options["env"],
    unknown,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  >;
  readonly create: (
    template: Template.Template | undefined,
  ) => Effect.Effect<Sandbox.Sandbox["Service"], unknown, Scope.Scope | HostServices>;
}

type HostServices = Layer.Success<typeof HostLayer>;

/** Directories on this machine, where opencode keeps apart from this machine's own. */
const localSandboxes: Sandboxes = {
  env: makeOpencodeEnv,
  create: makeSandbox,
};

/** Machines of their own in Daytona's cloud, where nothing listens on a port yet. */
const daytonaSandboxes: Sandboxes = {
  env: Effect.succeed({}),
  create: (template) =>
    Effect.gen(function* () {
      const provider = yield* DaytonaSandboxProvider.make({
        apiKey: Redacted.make(process.env.DAYTONA_API_KEY ?? ""),
      });
      return yield* Effect.acquireRelease(
        provider.create(template === undefined ? {} : { template }),
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
    const env = yield* sandboxes.env;
    const model = yield* makeEndpoint;
    const makeHarness = Effect.map(
      OpencodeAgent.make({
        model,
        token: (sandboxId) => Redacted.make(`the hosts' secret/${sandboxId}`),
        config,
        ...(env === undefined ? {} : { env }),
      }),
      Harness.make,
    );
    const harness = yield* makeHarness;
    const nextHarness = yield* makeHarness;
    const sandbox = yield* sandboxes.create(harness.agent.template);
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
  session: Bridge.DriverSession,
  text: string,
  options?: Partial<Bridge.TurnOptions>,
) =>
  Effect.map(
    Stream.runCollect(session.promptTurn(turnOptions(text, options))),
    (parts: ReadonlyArray<StreamPart.StreamPart>) => new GenerateResult.GenerateResult(parts),
  );

/** A request a fake model API received. */
interface Received {
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

/**
 * A fake of model APIs on this machine, which records the requests it receives. It answers a Chat
 * Completions request with `pong`, streamed, and refuses every other. It stops when the scope
 * closes.
 */
const makeFakeModelApi = Effect.gen(function* () {
  const received: Array<Received> = [];
  const chunk = (fields: object) =>
    `data: ${JSON.stringify({ id: "chat_1", object: "chat.completion.chunk", created: 0, model: "model", ...fields })}\n\n`;
  const answer = [
    chunk({ choices: [{ index: 0, delta: { role: "assistant", content: "pong" } }] }),
    chunk({
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }),
    "data: [DONE]\n\n",
  ].join("");
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
          const path = new URL(request.url).pathname;
          received.push({
            path,
            headers: Object.fromEntries(request.headers),
            body: (await request.json()) as Record<string, unknown>,
          });
          return path.endsWith("/chat/completions")
            ? new Response(answer, { headers: { "content-type": "text/event-stream" } })
            : Response.json(
                { error: { type: "invalid_request_error", message: "refused" } },
                {
                  status: 400,
                },
              );
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  );
  return { url: `http://127.0.0.1:${server.port}`, received };
});

/** The opencode session a session's state names. */
const OpencodeState = Schema.Struct({ sessionID: Schema.String });

describe.skipIf(!enabled)("opencode as the bridge runs it", () => {
  it.live(
    "sends a turn to its model's endpoint, with the endpoint's key, effort, and output limit",
    () =>
      Effect.gen(function* () {
        const api = yield* makeFakeModelApi;
        // Models that opencode knows from models.dev, at the fake's URL.
        const { driver, directory } = yield* makeLiveDriver({
          model: {
            provider: "openrouter",
            model: "openai/gpt-oss-120b",
            protocol: "openai-chat",
            url: `${api.url}/chat/v1`,
            apiKey: Redacted.make("chat-key"),
            effort: "low",
          },
          models: {
            claude: {
              provider: "anthropic",
              model: "claude-sonnet-4-5",
              protocol: "anthropic-messages",
              url: `${api.url}/anthropic/v1`,
              apiKey: Redacted.make("anthropic-key"),
              effort: "high",
              maxOutputTokens: 2048,
            },
            gpt: {
              provider: "openai",
              model: "gpt-5",
              protocol: "openai-responses",
              url: `${api.url}/openai/v1`,
              apiKey: Redacted.make("openai-key"),
              effort: "medium",
            },
          },
        });
        const session = yield* driver.startSession({ id, directory, history: Prompt.empty });

        const answered = yield* runTurn(session, "Say pong.");
        const refused = [
          yield* runTurn(session, "Say pong.", { model: "claude" }),
          yield* runTurn(session, "Say pong.", { model: "gpt" }),
        ];

        expect(answered.text).toBe("pong");
        expect(refused.map((result) => result.finishReason)).toEqual(["error", "error"]);
        const sentTo = (path: string) => api.received.find((request) => request.path === path);
        expect(sentTo("/chat/v1/chat/completions")).toMatchObject({
          headers: { authorization: "Bearer chat-key" },
          body: { model: "openai/gpt-oss-120b", reasoning_effort: "low" },
        });
        expect(sentTo("/anthropic/v1/messages")).toMatchObject({
          headers: { "x-api-key": "anthropic-key" },
          body: { model: "claude-sonnet-4-5", max_tokens: 2048, output_config: { effort: "high" } },
        });
        expect(sentTo("/openai/v1/responses")).toMatchObject({
          headers: { authorization: "Bearer openai-key" },
          body: { model: "gpt-5", reasoning: { effort: "medium" } },
        });
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "runs a turn in which opencode runs a command with its own tool",
    () =>
      Effect.gen(function* () {
        const { driver, directory } = yield* makeLiveDriver();
        const session = yield* driver.startSession({ id, directory, history: Prompt.empty });

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
        const { driver, directory } = yield* makeLiveDriver();
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
        const session = yield* driver.startSession({ id, directory, history });

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
    "ends a turn on a model its provider does not serve with an error",
    () =>
      Effect.gen(function* () {
        const model = yield* makeEndpoint;
        const { driver, directory } = yield* makeLiveDriver({
          model,
          models: { missing: { ...model, model: "no-such-model" } },
        });
        const session = yield* driver.startSession({ id, directory, history: Prompt.empty });

        const result = yield* runTurn(session, "Say hi.", { model: "missing" });

        expect(result.finishReason).toBe("error");
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "deletes the session in opencode when it is destroyed",
    () =>
      Effect.gen(function* () {
        const { driver, directory } = yield* makeLiveDriver();
        const session = yield* driver.startSession({ id, directory, history: Prompt.empty });
        const agentState = yield* session.state;

        yield* session.destroy;
        // opencode no longer has the session, so the driver starts another.
        const again = yield* driver.startSession({
          id,
          directory,
          history: Prompt.empty,
          agentState,
        });

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
        const { driver, directory } = yield* makeLiveDriver();
        const session = yield* driver.startSession({ id, directory, history: Prompt.empty });

        yield* session
          .promptTurn(turnOptions("Run `sleep 300` with your bash tool, then say done."))
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
          const state = yield* session.suspendTurn;
          yield* Fiber.join(reading);
          const resumed = yield* nextHarness.startSession({ sandbox, resumeFrom: state });
          const after = yield* Stream.runCollect(resumed.continueStream({}));
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

const openRouterKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = "nvidia/nemotron-3-super-120b-a12b:free";

/** A connection as a workspace stores it. */
const connectionTo = (
  integration: string,
  name: string,
  auth: Connection.AuthMethod,
): Connection.Connection => ({
  id: Connection.ConnectionId.make(`${integration}-1`),
  integration,
  name,
  settings: {},
  auth,
});

const openRouter = connectionTo("openrouter", "OpenRouter", "apiKey");
const agent = connectionTo("opencode-agent", "opencode", "none");

/** A connection to sandboxes, its credential, and how opencode works in them. */
interface SandboxConnection {
  readonly connection: Connection.Connection;
  readonly credential: Connection.Credential | undefined;
  readonly sandboxes: Sandboxes;
}

/**
 * What hosts do with opencode set up from connections, in a sandbox of `sandbox`'s, which is
 * destroyed when the scope closes.
 */
const describeConnections = (
  title: string,
  enabled: boolean,
  sandbox: SandboxConnection,
  timeout: number,
) =>
  describe.skipIf(!enabled)(title, () => {
    it.live(
      "runs a turn on a model connection, in a sandbox of a sandbox connection",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const env = yield* sandbox.sandboxes.env;
          const integrations = yield* Integrations.make([
            ...(yield* ModelIntegrations.catalogProviders),
            yield* LocalSandboxProvider.integration({
              directory: yield* fs.makeTempDirectoryScoped(),
            }),
            yield* DaytonaSandboxProvider.integration,
            yield* OpencodeAgent.integration({
              token: (sandboxId) => Redacted.make(`the hosts' secret/${sandboxId}`),
              config,
              ...(env === undefined ? {} : { env }),
            }),
          ]);

          const model = yield* (yield* integrations.find(openRouter.integration)).modelEndpoint(
            openRouter,
            { apiKey: Redacted.make(openRouterKey ?? "") },
            { model: openRouterModel },
          );
          const harness = yield* (yield* integrations.find(agent.integration)).harness(
            agent,
            undefined,
            { model },
          );
          const provider = yield* (yield* integrations.find(
            sandbox.connection.integration,
          )).sandboxProvider(sandbox.connection, sandbox.credential);
          const created = yield* Effect.acquireRelease(
            provider.create(
              harness.agent.template === undefined ? {} : { template: harness.agent.template },
            ),
            (made) => Effect.ignore(made.destroy),
          );
          const session = yield* harness.startSession({ sandbox: created, id });

          const result = yield* session.generate({
            prompt:
              "Run `echo live-opencode` with your bash tool, then reply with what it printed.",
          });

          expect(result.parts.find((part) => part.type === "tool-call")).toEqual(
            expect.objectContaining({ name: "bash", providerExecuted: true }),
          );
          expect(result.text).toContain("live-opencode");
        }).pipe(Effect.provide(Layer.merge(HostLayer, FetchHttpClient.layer))),
      timeout,
    );
  });

describeConnections(
  "opencode set up from connections, in this machine's sandboxes",
  enabled && openRouterKey !== undefined,
  {
    connection: connectionTo("local", "This machine", "none"),
    credential: undefined,
    sandboxes: localSandboxes,
  },
  timeout,
);

// Daytona's sandboxes cost money, so opencode is set up there only with `AMENDS_TEST_DAYTONA=1` too.
describeConnections(
  "opencode set up from connections, in Daytona's sandboxes",
  enabled &&
    openRouterKey !== undefined &&
    process.env.AMENDS_TEST_DAYTONA === "1" &&
    process.env.DAYTONA_API_KEY !== undefined,
  {
    connection: connectionTo("daytona", "Our organization", "apiKey"),
    credential: { apiKey: Redacted.make(process.env.DAYTONA_API_KEY ?? "") },
    sandboxes: daytonaSandboxes,
  },
  300_000,
);
