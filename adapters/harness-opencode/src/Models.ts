/**
 * The models opencode runs on, made from model endpoints: the providers of opencode's configuration
 * that serve them, and each endpoint's model as opencode names it. opencode serves a model through
 * the endpoint's protocol, at its URL, with its output limit, and with the key of its provider. An
 * endpoint's effort is a variant of the model, which the endpoint's model names.
 *
 * opencode finds the providers and models that models.dev lists by their ids, as endpoints name
 * them, and knows the rest of a model from there, such as whether it calls tools.
 */
import { HarnessError, type ModelEndpoint } from "@amends/harness-v2";
import { Array, Redacted, Result, type Schema } from "effect";
import type { ModelRef } from "./bridge/SessionEvent.ts";

// TODO: Tell opencode what a model it does not find in models.dev takes and how much, such as
// whether it calls tools and its context window, once endpoints say: opencode runs such a model
// without tools.
export interface Models {
  /** The `providers` of opencode's configuration, which serve the endpoints' models. */
  readonly providers: { readonly [providerId: string]: Schema.Json };

  /** The model a turn runs on when it names none. */
  readonly model: ModelRef;

  /** The models a turn can name, by name. */
  readonly models: { readonly [name: string]: ModelRef };
}

/**
 * The models opencode runs on for the endpoint `model`, and `models` by name. opencode presents one
 * key for each provider, and serves a model through one protocol, at one URL, with one output
 * limit, so endpoints that differ in them fail with `UnsupportedError`.
 */
export const fromEndpoints = (endpoints: {
  readonly model: ModelEndpoint.ModelEndpoint;
  readonly models: Readonly<Record<string, ModelEndpoint.ModelEndpoint>>;
}): Result.Result<Models, HarnessError.UnsupportedError> => {
  const byProvider = Object.entries(
    Array.groupBy(
      [endpoints.model, ...Object.values(endpoints.models)],
      (endpoint) => endpoint.provider,
    ),
  );
  for (const [providerId, ofProvider] of byProvider) {
    const conflict = conflictIn(providerId, ofProvider);
    if (conflict !== undefined) {
      return Result.fail(new HarnessError.UnsupportedError({ description: conflict }));
    }
  }
  return Result.succeed({
    providers: Object.fromEntries(
      byProvider.map(([providerId, ofProvider]) => [providerId, providerOf(ofProvider)]),
    ),
    model: modelRefOf(endpoints.model),
    models: Object.fromEntries(
      Object.entries(endpoints.models).map(([name, endpoint]) => [name, modelRefOf(endpoint)]),
    ),
  });
};

/** Why opencode cannot serve the endpoints of the provider `providerId`, or nothing when it can. */
const conflictIn = (
  providerId: string,
  endpoints: ReadonlyArray<ModelEndpoint.ModelEndpoint>,
): string | undefined => {
  if (new Set(endpoints.map(keyOf)).size > 1) {
    return `opencode presents one key for each provider, and the endpoints for ${providerId} have different keys`;
  }
  for (const [modelId, ofModel] of Object.entries(
    Array.groupBy(endpoints, (endpoint) => endpoint.model),
  )) {
    const served = new Set(
      ofModel.map((endpoint) =>
        JSON.stringify([endpoint.protocol, urlOf(endpoint), endpoint.maxOutputTokens]),
      ),
    );
    if (served.size > 1) {
      return `opencode serves a model through one protocol, at one URL, with one output limit, and the endpoints for ${providerId}/${modelId} differ in them`;
    }
  }
  return undefined;
};

/** The configuration of the provider that serves `endpoints`, which share their provider. */
const providerOf = (endpoints: Array.NonEmptyReadonlyArray<ModelEndpoint.ModelEndpoint>) => {
  const key = keyOf(endpoints[0]);
  const provider: Schema.Json = {
    // A provider that opencode has a key for, as here, is one it serves models of.
    ...(key === undefined ? {} : { request: { body: { apiKey: key } } }),
    models: Object.fromEntries(
      Object.entries(Array.groupBy(endpoints, (endpoint) => endpoint.model)).map(
        ([modelId, ofModel]) => [modelId, modelOf(ofModel)],
      ),
    ),
  };
  return provider;
};

/** The configuration of the model that `endpoints`, which share their model, name. */
const modelOf = (endpoints: Array.NonEmptyReadonlyArray<ModelEndpoint.ModelEndpoint>) => {
  const [endpoint] = endpoints;
  const efforts = [
    ...new Set(endpoints.flatMap(({ effort }) => (effort === undefined ? [] : [effort]))),
  ];
  const model: Schema.Json = {
    api: {
      id: endpoint.model,
      type: "aisdk",
      package: packages[endpoint.protocol],
      url: urlOf(endpoint),
    },
    ...(endpoint.maxOutputTokens === undefined
      ? {}
      : { limit: { output: endpoint.maxOutputTokens } }),
    ...(efforts.length === 0
      ? {}
      : {
          variants: efforts.map((effort) => ({
            id: variantOf(effort),
            body: effortFields[endpoint.protocol](effort),
          })),
        }),
  };
  return model;
};

const modelRefOf = (endpoint: ModelEndpoint.ModelEndpoint): ModelRef => ({
  providerID: endpoint.provider,
  id: endpoint.model,
  ...(endpoint.effort === undefined ? {} : { variant: variantOf(endpoint.effort) }),
});

/**
 * The AI SDK package opencode serves a protocol with: opencode's runner sends a model's requests as
 * the API that the package its model names reaches.
 */
const packages: Record<ModelEndpoint.Protocol, string> = {
  "anthropic-messages": "@ai-sdk/anthropic",
  "openai-responses": "@ai-sdk/openai",
  "openai-chat": "@ai-sdk/openai-compatible",
};

/**
 * The fields of a request's body that ask for an effort, as each protocol takes them. opencode adds
 * a variant's fields to the requests of a model that runs in it.
 */
const effortFields: Record<
  ModelEndpoint.Protocol,
  (effort: ModelEndpoint.Effort) => { readonly [field: string]: Schema.Json }
> = {
  "anthropic-messages": (effort) => ({ output_config: { effort } }),
  "openai-responses": (effort) => ({ reasoning: { effort } }),
  "openai-chat": (effort) => ({ reasoning_effort: effort }),
};

/**
 * The variant of a model that asks for `effort`, named apart from the variants that opencode gives
 * models itself, whose fields one of the same name would join.
 */
const variantOf = (effort: ModelEndpoint.Effort) => `amends-${effort}`;

/** The endpoint's URL without a slash at its end, which the protocol's paths follow. */
const urlOf = (endpoint: ModelEndpoint.ModelEndpoint) => endpoint.url.replace(/\/+$/, "");

const keyOf = (endpoint: ModelEndpoint.ModelEndpoint) =>
  endpoint.apiKey === undefined ? undefined : Redacted.value(endpoint.apiKey);
