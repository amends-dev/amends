import { ModelCatalog } from "@amends/connection-v2";
import { Agent, Harness, type ModelEndpoint } from "@amends/harness-v2";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted, Schema } from "effect";
import { AiError, LanguageModel, Tool, Toolkit } from "effect/ai";
import { FetchHttpClient } from "effect/http";
import * as AmendsAgent from "../src/AmendsAgent.ts";
import * as Models from "../src/Models.ts";

/**
 * These tests reach real model APIs over the network and run only with `AMENDS_TEST_MODELS=1`. The
 * turn runs on one of OpenRouter's free models, which costs nothing, with the key in
 * `OPENROUTER_API_KEY`, as `bun --env-file=hosts/local/.env` gives it; `AMENDS_TEST_MODELS_MODEL`
 * names another of OpenRouter's models. Anthropic and OpenAI are reached with a key they refuse,
 * which shows that a request found their API, without spending anything.
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
