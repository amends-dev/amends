import {
  Connection,
  Integrations,
  ModelCatalog,
  ModelIntegrations,
  ToolIntegrations,
} from "@amends/connection";
import { Agent, type ModelEndpoint } from "@amends/harness";
import { Models } from "@amends/harness-amends";
import type { Sandbox, Template } from "@amends/sandbox";
import { DaytonaSandboxProvider } from "@amends/sandbox-daytona";
import { LocalSandboxProvider } from "@amends/sandbox-local";
import { Assembly } from "@amends/toolkit";
import { BunHttpServer, BunServices, BunSocket } from "@effect/platform-bun";
import { describe, expect, it, layer } from "@effect/vitest";
import {
  Effect,
  FileSystem,
  Layer,
  Logger,
  Path,
  Redacted,
  Schema,
  type Scope,
  Stream,
} from "effect";
import { LanguageModel, McpProtocol, McpServer, type Response, Tool, Toolkit } from "effect/ai";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { HarnessIntegrations } from "../src/harness-integrations.ts";

/** A connection as a workspace stores it. */
const connectionTo = (
  integration: string,
  name: string,
  auth: Connection.AuthMethod,
  settings: Connection.Connection["settings"] = {},
): Connection.Connection => ({
  id: Connection.ConnectionId.make(`${integration}-1`),
  integration,
  name,
  settings,
  auth,
});

const amends = connectionTo("amends", "amends", "none");
const opencode = connectionTo("opencode-agent", "opencode", "none");
const id = Agent.SessionId.make("session-one");

/** The tokens each scripted response uses. */
const usage = { inputTokens: { total: 10 }, outputTokens: { total: 5 } };

/** A model that answers every request with `text`. */
const answering = (text: string) =>
  LanguageModel.make({
    streamText: () =>
      Stream.fromIterable<Response.StreamPartEncoded>([
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: text },
        { type: "text-end", id: "answer" },
        { type: "finish", reason: "stop", usage },
      ]),
    generateText: () =>
      Effect.succeed<Array<Response.PartEncoded>>([
        { type: "text", text },
        { type: "finish", reason: "stop", usage },
      ]),
  });

/** A model that answers every request by calling `bash`, counting its calls in `calls`. */
const callingBash = Effect.gen(function* () {
  const calls = { count: 0 };
  const model = yield* LanguageModel.make({
    streamText: () =>
      Stream.suspend(() => {
        calls.count += 1;
        return Stream.fromIterable<Response.StreamPartEncoded>([
          {
            type: "tool-call",
            id: `bash-${calls.count}`,
            name: "bash",
            params: { command: "true" },
          },
          { type: "finish", reason: "tool-calls", usage },
        ]);
      }),
    generateText: () => Effect.die("The model is only streamed"),
  });
  return { model, calls };
});

/** The endpoint that stands for the scripted model `modelId`, which reaches nothing. */
const endpointOf = (modelId: string): ModelEndpoint.ModelEndpoint => ({
  provider: "scripted",
  model: modelId,
  protocol: "openai-chat",
  url: "http://scripted.invalid/v1",
});

/** Makes the model of `models` that the endpoint of its id, as `endpointOf` gives, stands for. */
const languageModelsOf = (models: Readonly<Record<string, LanguageModel.LanguageModel>>) =>
  Models.LanguageModels.of({
    make: (endpoint) =>
      Effect.suspend(() => {
        const model = models[endpoint.model];
        return model === undefined
          ? Effect.die(`No scripted model stands for ${endpoint.model}`)
          : Effect.succeed(model);
      }),
  });

layer(BunServices.layer)("HarnessIntegrations.amends", (it) => {
  it.effect("gives a harness of the agent, on the models it is given", () =>
    Effect.gen(function* () {
      const integration = yield* HarnessIntegrations.amends().pipe(
        Effect.provideService(
          Models.LanguageModels,
          languageModelsOf({
            default: yield* answering("by default"),
            fast: yield* answering("fast"),
          }),
        ),
      );

      const harness = yield* integration.harness(amends, undefined, {
        model: endpointOf("default"),
        models: { quick: endpointOf("fast") },
      });
      const session = yield* harness.createSession({ id });
      const first = yield* session.generate({ prompt: "hi" });
      const second = yield* session.generate({ prompt: "hi", model: "quick" });

      expect(integration.provides).toEqual(["harnesses"]);
      expect(integration.requiresSandbox).toBe(false);
      expect(harness.agent.id).toBe("amends");
      expect([first.text, second.text]).toEqual(["by default", "fast"]);
      expect(yield* integration.check(amends, undefined)).toEqual({ status: "healthy" });
    }),
  );

  it.effect("makes the agent with what the host installs the integration with", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { model, calls } = yield* callingBash;
      const integration = yield* HarnessIntegrations.amends({ maxSteps: 2 }).pipe(
        Effect.provideService(Models.LanguageModels, languageModelsOf({ default: model })),
      );
      const sandboxProvider = yield* LocalSandboxProvider.make({
        directory: yield* fs.makeTempDirectoryScoped(),
      });

      const harness = yield* integration.harness(amends, undefined, {
        model: endpointOf("default"),
      });
      const session = yield* harness.createSession({
        id,
        sandbox: yield* sandboxProvider.createScoped(),
      });
      const result = yield* session.generate({ prompt: "keep going" });

      expect(calls.count).toBe(2);
      expect(result.finishReason).toBe("tool-calls");
    }),
  );
});

const sonnet = {
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  protocol: "anthropic-messages",
  url: "https://api.anthropic.com/v1",
  apiKey: Redacted.make("secret-key"),
} satisfies ModelEndpoint.ModelEndpoint;

const makeOpencode = HarnessIntegrations.opencode({ token: () => Redacted.make("bridge-token") });

layer(Layer.merge(BunServices.layer, BunSocket.layerWebSocketConstructor))(
  "HarnessIntegrations.opencode",
  (it) => {
    it.effect("gives harnesses of opencode, which work in a sandbox its template prepares", () =>
      Effect.gen(function* () {
        const integration = yield* makeOpencode;

        const harness = yield* integration.harness(opencode, undefined, { model: sonnet });

        expect(integration.provides).toEqual(["harnesses"]);
        expect(integration.requiresSandbox).toBe(true);
        expect(harness.agent.id).toBe("opencode");
        expect(harness.agent.requiresSandbox).toBe(true);
        expect(harness.agent.template?.name).toBe("opencode");
        expect(yield* integration.check(opencode, undefined)).toEqual({ status: "healthy" });
      }),
    );

    it.effect("refuses models that opencode cannot run on together", () =>
      Effect.gen(function* () {
        const integration = yield* makeOpencode;

        const error = yield* Effect.flip(
          integration.harness(opencode, undefined, {
            model: sonnet,
            models: { other: { ...sonnet, apiKey: Redacted.make("another-key") } },
          }),
        );

        expect(error.integration).toBe("opencode-agent");
        expect(error.reason).toBeInstanceOf(Connection.UnsupportedError);
        expect(error.reason).toMatchObject({
          _tag: "UnsupportedError",
          description:
            "opencode presents one key, with one set of headers, for each provider, and the endpoints for anthropic differ in them",
        });
      }),
    );
  },
);

/**
 * The live tests set the agents up as the host does from a workspace's connections, on OpenRouter's
 * free model, which costs nothing, with `OPENROUTER_API_KEY` from the `.env` as
 * `bun --env-file=hosts/local/.env` gives it: amends's agent with `AMENDS_TEST_MODELS=1`, calling a
 * tool of an MCP connection to a server on this machine; and opencode with `AMENDS_TEST_OPENCODE=1`,
 * running a turn in a sandbox of this machine's, or of Daytona's with `AMENDS_TEST_DAYTONA=1` and
 * `DAYTONA_API_KEY` too, which costs money.
 */
const openRouterKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = "nvidia/nemotron-3-super-120b-a12b:free";
const openRouter = connectionTo("openrouter", "OpenRouter", "apiKey");
const timeout = 120_000;

const LiveLayer = Layer.mergeAll(
  BunServices.layer,
  BunSocket.layerWebSocketConstructor,
  ModelCatalog.layer,
  Models.layer.pipe(Layer.provideMerge(FetchHttpClient.layer)),
);

/** The endpoint of OpenRouter's free model, from the connection to OpenRouter. */
const openRouterEndpoint = (integrations: Integrations.Integrations["Service"]) =>
  Effect.flatMap(integrations.find(openRouter.integration), (integration) =>
    integration.modelEndpoint(
      openRouter,
      { apiKey: Redacted.make(openRouterKey ?? "") },
      { model: openRouterModel },
    ),
  );

const LookUpCodeword = Tool.make("look_up_codeword", {
  description: "Looks up the codeword the user asks about.",
  parameters: Schema.Struct({ topic: Schema.String }),
  success: Schema.String,
});
const Codewords = Toolkit.make(LookUpCodeword);

/** An MCP server on this machine that gives `look_up_codeword`, at the URL it returns. */
const serveCodewords = Effect.gen(function* () {
  const app = yield* HttpRouter.toHttpEffect(
    McpServer.toolkit(Codewords).pipe(
      Layer.provide(Codewords.toLayer({ look_up_codeword: () => Effect.succeed("TIDEPOOL-42") })),
      Layer.provide(
        McpServer.layerHttp({
          name: "codewords",
          version: "1.0.0",
          path: "/mcp",
          protocols: [McpProtocol.v2025_11_25],
        }),
      ),
      Layer.provide(Logger.layer([])),
    ),
  );
  const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 });
  yield* server.serve(app);
  if (server.address._tag === "UnixPathAddress") {
    return yield* Effect.die("The MCP server listens on no port");
  }
  return `http://127.0.0.1:${server.address.port}/mcp`;
});

describe.skipIf(process.env.AMENDS_TEST_MODELS !== "1" || openRouterKey === undefined)(
  "amends's agent set up from connections",
  () => {
    it.live(
      "answers a turn on a model connection, calling a tool of an MCP connection",
      () =>
        Effect.gen(function* () {
          const integrations = yield* Integrations.make([
            ...(yield* ModelIntegrations.catalogProviders),
            yield* ToolIntegrations.mcp,
            yield* HarnessIntegrations.amends(),
          ]);
          const codewords = connectionTo("mcp", "codewords", "none", {
            url: yield* serveCodewords,
          });

          const model = yield* openRouterEndpoint(integrations);
          const harness = yield* (yield* integrations.find(amends.integration)).harness(
            amends,
            undefined,
            { model },
          );
          const source = yield* (yield* integrations.find(codewords.integration)).toolSource(
            codewords,
            undefined,
          );
          const toolkit = yield* Assembly.toolkit(
            [{ source, definitions: yield* source.discover }],
            () => "allow",
          );
          const session = yield* harness.createSession({ id });
          const result = yield* session.generate({
            prompt:
              "Use the codewords__look_up_codeword tool for the topic `harbor`, then tell me the codeword.",
            toolkit,
          });

          expect(result.toolCalls.map((call) => call.name)).toContain(
            "codewords__look_up_codeword",
          );
          expect(result.text).toContain("TIDEPOOL-42");
        }).pipe(Effect.provide(LiveLayer)),
      timeout,
    );
  },
);

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

/** The sandboxes opencode runs in, and opencode's environment there. */
interface Sandboxes {
  readonly env: Effect.Effect<
    Readonly<Record<string, string>>,
    unknown,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  >;
  readonly create: (
    template: Template.Template | undefined,
  ) => Effect.Effect<
    Sandbox.Sandbox["Service"],
    unknown,
    Scope.Scope | Layer.Success<typeof LiveLayer>
  >;
}

/** Directories on this machine, where opencode keeps apart from this machine's own. */
const localSandboxes: Sandboxes = {
  env: makeOpencodeEnv,
  create: (template) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const sandboxProvider = yield* LocalSandboxProvider.make({
        directory: yield* fs.makeTempDirectoryScoped(),
      });
      return yield* sandboxProvider.createScoped(template === undefined ? {} : { template });
    }),
};

/** Machines of their own in Daytona's cloud. */
const daytonaSandboxes: Sandboxes = {
  env: Effect.succeed({}),
  create: (template) =>
    Effect.gen(function* () {
      const sandboxProvider = yield* DaytonaSandboxProvider.make({
        apiKey: Redacted.make(process.env.DAYTONA_API_KEY ?? ""),
      });
      return yield* sandboxProvider.createScoped(template === undefined ? {} : { template });
    }),
};

/** What the host does with opencode set up from connections, in a new sandbox of `sandboxes`. */
const describeOpencode = (title: string, enabled: boolean, sandboxes: Sandboxes, timeout: number) =>
  describe.skipIf(!enabled)(title, () => {
    it.live(
      "runs a turn on a model connection, in a sandbox",
      () =>
        Effect.gen(function* () {
          const integrations = yield* Integrations.make([
            ...(yield* ModelIntegrations.catalogProviders),
            yield* HarnessIntegrations.opencode({
              token: (sandboxId) => Redacted.make(`the hosts' secret/${sandboxId}`),
              config,
              env: yield* sandboxes.env,
            }),
          ]);

          const model = yield* openRouterEndpoint(integrations);
          const harness = yield* (yield* integrations.find(opencode.integration)).harness(
            opencode,
            undefined,
            { model },
          );
          const sandbox = yield* sandboxes.create(harness.agent.template);
          const session = yield* harness.createSession({ sandbox, id });
          const result = yield* session.generate({
            prompt:
              "Run `echo live-opencode` with your bash tool, then reply with what it printed.",
          });

          expect(result.parts.find((part) => part.type === "tool-call")).toEqual(
            expect.objectContaining({ name: "bash", providerExecuted: true }),
          );
          expect(result.text).toContain("live-opencode");
        }).pipe(Effect.provide(LiveLayer)),
      timeout,
    );
  });

const opencodeEnabled = process.env.AMENDS_TEST_OPENCODE === "1" && openRouterKey !== undefined;

describeOpencode(
  "opencode set up from connections, in this machine's sandboxes",
  opencodeEnabled,
  localSandboxes,
  timeout,
);

// Daytona's sandboxes cost money, so opencode is set up there only with `AMENDS_TEST_DAYTONA=1` too.
describeOpencode(
  "opencode set up from connections, in Daytona's sandboxes",
  opencodeEnabled &&
    process.env.AMENDS_TEST_DAYTONA === "1" &&
    process.env.DAYTONA_API_KEY !== undefined,
  daytonaSandboxes,
  300_000,
);
