/**
 * The models amends's agent runs on, made from model endpoints: an Effect AI client for the
 * endpoint's protocol, at its URL and with its key, and the endpoint's model on that client, set
 * to the endpoint's effort and output limit.
 *
 * The agent makes them with `LanguageModels`, which `layer` provides over the host's `HttpClient`,
 * that the requests go out through. A test provides models of its own in its place.
 */
import type { ModelEndpoint } from "@amends/harness";
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import {
  OpenAiClient as ChatClient,
  OpenAiLanguageModel as ChatLanguageModel,
} from "@effect/ai-openai-compat";
import { Context, Effect, Layer, Stream } from "effect";
import type { LanguageModel } from "effect/ai";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export class LanguageModels extends Context.Service<
  LanguageModels,
  {
    /** The language model `endpoint` reaches. */
    readonly make: (
      endpoint: ModelEndpoint.ModelEndpoint,
    ) => Effect.Effect<LanguageModel.LanguageModel>;
  }
>()("@amends/harness-amends/Models/LanguageModels") {}

/** Makes language models whose requests go out through the host's `HttpClient`. */
export const layer = Layer.effect(
  LanguageModels,
  Effect.map(HttpClient.HttpClient, (client) =>
    LanguageModels.of({
      make: (endpoint) =>
        languageModel(endpoint).pipe(Effect.provideService(HttpClient.HttpClient, client)),
    }),
  ),
);

const languageModel = (
  endpoint: ModelEndpoint.ModelEndpoint,
): Effect.Effect<LanguageModel.LanguageModel, never, HttpClient.HttpClient> => {
  // A URL is the one the protocol's paths follow, with or without a slash at its end.
  const url = endpoint.url.replace(/\/+$/, "");
  switch (endpoint.protocol) {
    case "anthropic-messages":
      return anthropicModel(endpoint, url);
    case "openai-responses":
      return responsesModel(endpoint, url);
    case "openai-chat":
      return chatModel(endpoint, url);
  }
};

// TODO: Turn on adaptive thinking for the models that think only when a request asks, such as
// Claude Opus 4.8, once the catalog tells them apart from those that cannot be asked.
const anthropicModel = Effect.fnUntraced(function* (
  endpoint: ModelEndpoint.ModelEndpoint,
  url: string,
) {
  const client = yield* AnthropicClient.make({
    apiKey: endpoint.apiKey,
    apiUrl: url,
    // The client sends to `/v1/messages` after its URL, while the endpoint's URL is the one that
    // `/messages` follows, which ends in `/v1` for Anthropic's own API.
    transformClient: HttpClient.mapRequest(
      HttpClientRequest.updateUrl((requestUrl) => requestUrl.replace(`${url}/v1/`, `${url}/`)),
    ),
  });
  return yield* AnthropicLanguageModel.make({
    model: endpoint.model,
    config: {
      ...(endpoint.maxOutputTokens === undefined ? {} : { max_tokens: endpoint.maxOutputTokens }),
      ...(endpoint.effort === undefined
        ? {}
        : // Effect's settings name only the levels up to `high`; the client sends any it is given,
          // and Anthropic's API takes `xhigh` and `max` too, for the models the catalog lists them for.
          { output_config: { effort: endpoint.effort as "high" } }),
    },
  }).pipe(Effect.provideService(AnthropicClient.AnthropicClient, client));
});

const responsesModel = Effect.fnUntraced(function* (
  endpoint: ModelEndpoint.ModelEndpoint,
  url: string,
) {
  const client = yield* OpenAiClient.make({ apiKey: endpoint.apiKey, apiUrl: url });
  return yield* OpenAiLanguageModel.make({
    model: endpoint.model,
    config: {
      ...(endpoint.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: endpoint.maxOutputTokens }),
      ...(endpoint.effort === undefined
        ? {}
        : // Effect's settings name the levels up to `xhigh`; the client sends any it is given, and
          // OpenAI's API takes `max` too, for the models the catalog lists it for.
          { reasoning: { effort: endpoint.effort as "xhigh" } }),
    },
  }).pipe(Effect.provideService(OpenAiClient.OpenAiClient, client));
});

const chatModel = Effect.fnUntraced(function* (endpoint: ModelEndpoint.ModelEndpoint, url: string) {
  const client = yield* ChatClient.make({
    apiKey: endpoint.apiKey,
    apiUrl: url,
    transformClient: withoutNullServiceTiers,
  });
  return yield* ChatLanguageModel.make({
    model: endpoint.model,
    config: {
      ...(endpoint.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: endpoint.maxOutputTokens }),
      // The Chat Completions API takes the effort as `reasoning_effort`, which the client sends as
      // it is, being a setting it does not name.
      ...(endpoint.effort === undefined ? {} : { reasoning_effort: endpoint.effort }),
    },
  }).pipe(Effect.provideService(ChatClient.OpenAiClient, client));
});

// TODO: Drop this once Effect's Chat Completions client takes a `service_tier` of null, as OpenRouter
// answers. The client refuses a whole answer that has one, and skips a streamed chunk that has one,
// which loses the usage that OpenRouter streams in its last chunk.
/**
 * A Chat Completions API's answers without a `service_tier` of null: in each line of a streamed
 * answer, where every chunk is a line, and in a whole answer.
 */
const withoutNullServiceTiers = HttpClient.transformResponse(
  Effect.flatMap((response: HttpClientResponse.HttpClientResponse) => {
    const answerWith = (body: string | ReadableStream<Uint8Array>) =>
      HttpClientResponse.fromWeb(
        response.request,
        new Response(body, { status: response.status, headers: response.headers }),
      );
    if (response.headers["content-type"]?.startsWith("text/event-stream") === true) {
      const lines = response.stream.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.map((line) => `${withoutNullServiceTier(line)}\n`),
        Stream.encodeText,
      );
      return Effect.succeed(answerWith(Stream.toReadableStream(lines)));
    }
    return Effect.map(response.text, (text) => answerWith(withoutNullServiceTier(text)));
  }),
);

/** `text`, or the JSON in it, after `data: ` in a streamed line, without a `service_tier` of null. */
const withoutNullServiceTier = (text: string): string => {
  if (!/"service_tier"\s*:\s*null/.test(text)) return text;
  const prefix = text.startsWith("data:") ? text.slice(0, text.indexOf(":") + 1) : "";
  try {
    const { service_tier: _, ...rest } = JSON.parse(text.slice(prefix.length));
    return `${prefix}${JSON.stringify(rest)}`;
  } catch {
    return text;
  }
};
