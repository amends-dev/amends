import {
  Connection,
  Integrations,
  ModelCatalog,
  ModelIntegrations,
  ToolIntegrations,
} from "@amends/connection-v2";
import { Agent, Harness, type ModelEndpoint } from "@amends/harness-v2";
import { LocalSandboxProvider } from "@amends/sandbox-local-v2";
import { Assembly } from "@amends/toolkit";
import { BunHttpServer, BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Logger, Path, Redacted, Schema } from "effect";
import { AiError, LanguageModel, McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { FetchHttpClient, HttpRouter } from "effect/http";
import * as AmendsAgent from "../src/AmendsAgent.ts";
import * as Models from "../src/Models.ts";

/**
 * These tests reach real model APIs over the network and run only with `AMENDS_TEST_MODELS=1`. The
 * turn runs on one of OpenRouter's free models, which costs nothing, with the key in
 * `OPENROUTER_API_KEY`, as `bun --env-file=hosts/local/.env` gives it; `AMENDS_TEST_MODELS_MODEL`
 * names another of OpenRouter's models. Anthropic and OpenAI are reached with a key they refuse,
 * which shows that a request found their API, without spending anything. The agent is also set up as
 * a host sets it up from a workspace's connections: to OpenRouter, to the agent, to an MCP server on
 * this machine, and to this machine's sandboxes.
 */
const enabled = process.env.AMENDS_TEST_MODELS === "1";
const openRouterKey = process.env.OPENROUTER_API_KEY ?? "";
const openRouterModel =
  process.env.AMENDS_TEST_MODELS_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free";

const timeout = 120_000;
const LiveLayer = Layer.merge(
  Models.layer.pipe(Layer.provideMerge(FetchHttpClient.layer)),
  ModelCatalog.layer,
);

/** An endpoint for the catalog's model `modelId` of `providerId`, as a host would make it. */
const endpointFor = (providerId: string, modelId: string, apiKey: string) =>
  Effect.gen(function* () {
    const catalog = yield* ModelCatalog.ModelCatalog;
    const model = yield* catalog.findModel(providerId, modelId);
    if (model === undefined)
      return yield* Effect.die(`The catalog has no ${providerId}/${modelId}`);
    return {
      provider: providerId,
      model: model.id,
      protocol: model.protocol,
      url: model.url,
      apiKey: Redacted.make(apiKey),
      maxOutputTokens: Math.min(model.limits.output, 4096),
    } satisfies ModelEndpoint.ModelEndpoint;
  });

const LookUpCodeword = Tool.make("look_up_codeword", {
  description: "Looks up the codeword the user asks about.",
  parameters: Schema.Struct({ topic: Schema.String }),
  success: Schema.String,
});
const Codewords = Toolkit.make(LookUpCodeword);

/** Whether a request with `endpoint`'s key failed for the key, which only the API itself says. */
const refusesKey = (endpoint: ModelEndpoint.ModelEndpoint) =>
  Effect.gen(function* () {
    const languageModels = yield* Models.LanguageModels;
    const model = yield* languageModels.make(endpoint);
    const error = yield* Effect.flip(
      LanguageModel.generateText({ prompt: "Say hi" }).pipe(
        Effect.provideService(LanguageModel.LanguageModel, model),
      ),
    );
    return AiError.isAiError(error) && error.reason._tag === "AuthenticationError";
  });

describe.skipIf(!enabled)("a model reached from the catalog", () => {
  it.live(
    "answers a turn on OpenRouter, calling a host tool on the way",
    () =>
      Effect.gen(function* () {
        const endpoint = yield* endpointFor("openrouter", openRouterModel, openRouterKey);
        const session = yield* Harness.make(
          yield* AmendsAgent.make({ model: endpoint }),
        ).startSession({
          id: Agent.SessionId.make("live"),
        });
        const toolkit = yield* Effect.provide(
          Codewords,
          Codewords.toLayer({ look_up_codeword: () => Effect.succeed("TIDEPOOL-42") }),
        );

        const result = yield* session.generate({
          prompt:
            "Use the look_up_codeword tool for the topic `harbor`, then tell me the codeword.",
          toolkit,
        });

        expect(result.toolCalls.map((call) => call.name)).toContain("look_up_codeword");
        expect(result.text).toContain("TIDEPOOL-42");
        expect(result.finishReason).toBe("stop");
        expect(result.usage.outputTokens.total).toBeGreaterThan(0);
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "answers a turn asking for JSON on OpenRouter",
    () =>
      Effect.gen(function* () {
        const endpoint = yield* endpointFor("openrouter", openRouterModel, openRouterKey);
        const session = yield* Harness.make(
          yield* AmendsAgent.make({ model: endpoint }),
        ).startSession({
          id: Agent.SessionId.make("live"),
        });

        const result = yield* session.generateObject({
          prompt: "How many sides does a hexagon have? Answer with the number as `sides`.",
          schema: Schema.Struct({ sides: Schema.Finite }),
        });

        expect(result.value).toEqual({ sides: 6 });
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );

  it.live(
    "reaches Anthropic's Messages API and OpenAI's Responses API",
    () =>
      Effect.gen(function* () {
        const anthropic = yield* endpointFor("anthropic", "claude-opus-5-5", "not-a-key");
        const openai = yield* endpointFor("openai", "gpt-5.6", "not-a-key");

        expect(yield* refusesKey(anthropic)).toBe(true);
        expect(yield* refusesKey(openai)).toBe(true);
      }).pipe(Effect.provide(LiveLayer)),
    timeout,
  );
});

const ConnectionsLayer = Layer.mergeAll(
  BunServices.layer,
  Models.layer.pipe(Layer.provideMerge(FetchHttpClient.layer)),
  ModelCatalog.layer,
);

const id = Agent.SessionId.make("live");

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

const openRouter = connectionTo("openrouter", "OpenRouter", "apiKey");
const agent = connectionTo("amends", "amends", "none");
const thisMachine = connectionTo("local", "This machine", "none");

/** The integrations a host installs, with a directory for the local sandboxes until the scope closes. */
const installIntegrations = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* Integrations.make([
    ...(yield* ModelIntegrations.catalogProviders),
    yield* ToolIntegrations.mcp,
    yield* LocalSandboxProvider.integration({ directory: yield* fs.makeTempDirectoryScoped() }),
    yield* AmendsAgent.integration(),
  ]);
});

/** The harness of amends's agent on OpenRouter's free model, as a host makes it of connections. */
const makeHarness = (integrations: Integrations.Integrations["Service"]) =>
  Effect.gen(function* () {
    const model = yield* (yield* integrations.find(openRouter.integration)).modelEndpoint(
      openRouter,
      { apiKey: Redacted.make(openRouterKey) },
      { model: openRouterModel },
    );
    return yield* (yield* integrations.find(agent.integration)).harness(agent, undefined, {
      model,
    });
  });

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

describe.skipIf(!enabled)("amends's agent set up from connections", () => {
  it.live(
    "answers a turn on a model connection, calling a tool of an MCP connection",
    () =>
      Effect.gen(function* () {
        const integrations = yield* installIntegrations;
        const codewords = connectionTo("mcp", "codewords", "none", { url: yield* serveCodewords });
        const harness = yield* makeHarness(integrations);
        const source = yield* (yield* integrations.find(codewords.integration)).toolSource(
          codewords,
          undefined,
        );
        const toolkit = yield* Assembly.toolkit(
          [{ source, definitions: yield* source.discover }],
          () => "allow",
        );
        const session = yield* harness.startSession({ id });

        const result = yield* session.generate({
          prompt:
            "Use the codewords__look_up_codeword tool for the topic `harbor`, then tell me the codeword.",
          toolkit,
        });

        expect(result.toolCalls.map((call) => call.name)).toContain("codewords__look_up_codeword");
        expect(result.text).toContain("TIDEPOOL-42");
      }).pipe(Effect.provide(ConnectionsLayer)),
    timeout,
  );

  it.live(
    "works in a sandbox of a sandbox connection, running a command there",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const integrations = yield* installIntegrations;
        const harness = yield* makeHarness(integrations);
        const provider = yield* (yield* integrations.find(thisMachine.integration)).sandboxProvider(
          thisMachine,
          undefined,
        );
        const sandbox = yield* Effect.acquireRelease(
          provider.create(
            harness.template === undefined
              ? { ports: harness.ports }
              : { template: harness.template, ports: harness.ports },
          ),
          (created) => Effect.ignore(created.destroy),
        );
        const session = yield* harness.startSession({ sandbox, id });

        const result = yield* session.generate({
          prompt: "Run `echo amends-live > proof.txt` with your bash tool, then reply with: done",
        });

        expect(result.toolCalls.map((call) => call.name)).toContain("bash");
        expect(
          yield* sandbox.fileSystem.readFileString(
            path.join(sandbox.workingDirectory, id, "proof.txt"),
          ),
        ).toBe("amends-live\n");
      }).pipe(Effect.provide(ConnectionsLayer)),
    timeout,
  );
});
