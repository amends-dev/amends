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
  capabilities: { modelInference: { interface: "anthropic-messages" } },
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

/**
 * An Anthropic model for a connection's access and an agent's selection, requesting over fetch.
 * An empty API URL uses Anthropic's own.
 */
export const modelInference: ModelInference.Implementation = {
  declaration,
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
