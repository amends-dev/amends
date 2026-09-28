import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

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
  ],
  authentication: [{ _tag: "ApiKey", label: "API key" }, { _tag: "None" }],
});

/** A chat-completions model for a connection's access and an agent's selection, over fetch. */
export const modelInference: ModelInference.Implementation = {
  declaration,
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
