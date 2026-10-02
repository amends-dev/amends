import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

/**
 * Models from any API implementing OpenAI's chat completions: OpenAI itself, OpenRouter, Groq, or a
 * local server, with an API key or, for a server that needs none, without.
 */
export const declaration = ConnectionImplementation.Declaration.make({
  id: ConnectionImplementation.Id.make("openai-compatible"),
  name: "OpenAI-compatible",
  description:
    "Models from any API that implements OpenAI's chat completions, such as OpenAI, OpenRouter, Groq, or a local server.",
  capabilities: { modelInference: { interface: "openai-chat-completions" } },
  settings: [
    {
      key: "baseUrl",
      label: "API URL",
      kind: "url",
      required: true,
      description: "The API's base URL, before /chat/completions.",
      placeholder: "https://api.openai.com/v1",
    },
    {
      key: "contextWindow",
      label: "Context window",
      kind: "integer",
      required: false,
      description: "The most tokens the model reads at once. Leave empty for 128,000.",
      placeholder: "128000",
    },
  ],
  authentication: [{ _tag: "ApiKey", label: "API key" }, { _tag: "None" }],
});

/** How many tokens a model reads at once when its connection does not say. */
export const defaultContextTokens = 128_000;

/**
 * A chat-completions model for a connection's access and an agent's selection, over fetch. Its
 * context window is the connection's setting, since servers and models vary.
 */
export const modelInference: ModelInference.Implementation = {
  declaration,
  limits: (access) => {
    const configured = Number(access.settings["contextWindow"]);
    return {
      contextTokens:
        Number.isSafeInteger(configured) && configured > 0 ? configured : defaultContextTokens,
      outputTokens: undefined,
    };
  },
  languageModel: (access, selection) =>
    OpenAiLanguageModel.model(selection.model).pipe(
      Layer.provide(
        OpenAiClient.layer({
          apiKey: access.credential,
          apiUrl: access.settings["baseUrl"] || undefined,
        }),
      ),
      Layer.provide(FetchHttpClient.layer),
    ),
};

export * as OpenAiCompatibleConnection from "./openai-compatible.ts";
