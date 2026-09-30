import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

/** Claude models through the Anthropic API, with an API key. */
export const declaration = ConnectionImplementation.Declaration.make({
  id: ConnectionImplementation.Id.make("anthropic"),
  name: "Anthropic",
  description: "Claude models through the Anthropic API.",
  capabilities: {
    modelInference: {
      interface: "anthropic-messages",
      models: [
        { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
        { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
        { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      ],
    },
  },
  settings: [
    {
      key: "baseUrl",
      label: "API URL",
      kind: "url",
      required: false,
      description: "Leave empty to use Anthropic's API.",
      placeholder: "https://api.anthropic.com",
    },
  ],
  authentication: [{ _tag: "ApiKey", label: "API key" }],
});

/** How much the models Anthropic offers take, as Anthropic documents them. */
const limits: Readonly<Record<string, ModelInference.Limits>> = {
  "claude-opus-5-5": { contextTokens: 1_000_000, outputTokens: 128_000 },
  "claude-sonnet-5": { contextTokens: 1_000_000, outputTokens: 128_000 },
  "claude-haiku-4-5-20251001": { contextTokens: 200_000, outputTokens: 64_000 },
};
/** A model this adapter does not know is taken to have the smallest window of those it does. */
const unknownLimits: ModelInference.Limits = { contextTokens: 200_000, outputTokens: undefined };

/**
 * An Anthropic model for a connection's access and an agent's selection, requesting over fetch.
 * An empty API URL uses Anthropic's own.
 */
export const modelInference: ModelInference.Implementation = {
  declaration,
  limits: (_, selection) => limits[selection.model] ?? unknownLimits,
  languageModel: (access, selection) =>
    AnthropicLanguageModel.model(selection.model).pipe(
      Layer.provide(
        AnthropicClient.layer({
          apiKey: access.credential,
          apiUrl: access.settings["baseUrl"] || undefined,
        }),
      ),
      Layer.provide(FetchHttpClient.layer),
    ),
};

export * as AnthropicConnection from "./anthropic.ts";
