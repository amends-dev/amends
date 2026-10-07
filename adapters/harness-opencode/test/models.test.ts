import type { ModelEndpoint } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { Redacted, Result } from "effect";
import * as Models from "../src/Models.ts";

const key = Redacted.make("secret-key");

const sonnet = {
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  protocol: "anthropic-messages",
  url: "https://api.anthropic.com/v1",
  apiKey: key,
} satisfies ModelEndpoint.ModelEndpoint;

const gpt = {
  provider: "openai",
  model: "gpt-5.6",
  protocol: "openai-responses",
  url: "https://api.openai.com/v1/",
  apiKey: Redacted.make("other-key"),
  effort: "xhigh",
} satisfies ModelEndpoint.ModelEndpoint;

const gptOss = {
  provider: "openrouter",
  model: "openai/gpt-oss-120b",
  protocol: "openai-chat",
  url: "https://openrouter.ai/api/v1",
  effort: "low",
  maxOutputTokens: 8000,
} satisfies ModelEndpoint.ModelEndpoint;

/** Why opencode cannot serve `endpoints`, or nothing when it can. */
const refusalOf = (endpoints: Parameters<typeof Models.fromEndpoints>[0]) => {
  const models = Models.fromEndpoints(endpoints);
  return Result.isFailure(models) ? models.failure : undefined;
};

describe("Models.fromEndpoints", () => {
  it("serves each endpoint's model through its protocol, at its URL, with its key", () => {
    const models = Result.getOrThrow(
      Models.fromEndpoints({ model: sonnet, models: { deep: gpt, open: gptOss } }),
    );

    expect(models.providers).toEqual({
      anthropic: {
        request: { body: { apiKey: "secret-key" } },
        models: {
          "claude-sonnet-5-5": {
            api: {
              id: "claude-sonnet-5-5",
              type: "aisdk",
              package: "@ai-sdk/anthropic",
              url: "https://api.anthropic.com/v1",
            },
          },
        },
      },
      openai: {
        request: { body: { apiKey: "other-key" } },
        models: {
          "gpt-5.6": {
            api: {
              id: "gpt-5.6",
              type: "aisdk",
              package: "@ai-sdk/openai",
              url: "https://api.openai.com/v1",
            },
            variants: [{ id: "amends-xhigh", body: { reasoning: { effort: "xhigh" } } }],
          },
        },
      },
      openrouter: {
        models: {
          "openai/gpt-oss-120b": {
            api: {
              id: "openai/gpt-oss-120b",
              type: "aisdk",
              package: "@ai-sdk/openai-compatible",
              url: "https://openrouter.ai/api/v1",
            },
            limit: { output: 8000 },
            variants: [{ id: "amends-low", body: { reasoning_effort: "low" } }],
          },
        },
      },
    });
    expect(models.model).toEqual({ providerID: "anthropic", id: "claude-sonnet-5-5" });
    expect(models.models).toEqual({
      deep: { providerID: "openai", id: "gpt-5.6", variant: "amends-xhigh" },
      open: { providerID: "openrouter", id: "openai/gpt-oss-120b", variant: "amends-low" },
    });
  });

  it("asks a model on the Messages API for an effort in `output_config`", () => {
    const models = Result.getOrThrow(
      Models.fromEndpoints({ model: { ...sonnet, effort: "max" }, models: {} }),
    );

    expect(models.providers["anthropic"]).toMatchObject({
      models: {
        "claude-sonnet-5-5": {
          variants: [{ id: "amends-max", body: { output_config: { effort: "max" } } }],
        },
      },
    });
    expect(models.model.variant).toBe("amends-max");
  });

  it("names one model at several efforts as variants of it", () => {
    const models = Result.getOrThrow(
      Models.fromEndpoints({
        model: sonnet,
        models: {
          quick: { ...sonnet, effort: "low" },
          deep: { ...sonnet, effort: "high" },
          deeper: { ...sonnet, effort: "high" },
        },
      }),
    );

    expect(models.providers["anthropic"]).toMatchObject({
      models: {
        "claude-sonnet-5-5": {
          variants: [
            { id: "amends-low", body: { output_config: { effort: "low" } } },
            { id: "amends-high", body: { output_config: { effort: "high" } } },
          ],
        },
      },
    });
    expect(models.model).toEqual({ providerID: "anthropic", id: "claude-sonnet-5-5" });
    expect(models.models["quick"]?.variant).toBe("amends-low");
    expect(models.models["deep"]).toEqual(models.models["deeper"]);
  });

  it("serves the models of one provider at URLs of their own, under its key", () => {
    const models = Result.getOrThrow(
      Models.fromEndpoints({
        model: sonnet,
        models: {
          gateway: { ...sonnet, model: "claude-opus-5-5", url: "https://gateway.example/v1" },
        },
      }),
    );

    expect(models.providers["anthropic"]).toMatchObject({
      request: { body: { apiKey: "secret-key" } },
      models: {
        "claude-sonnet-5-5": { api: { url: "https://api.anthropic.com/v1" } },
        "claude-opus-5-5": { api: { url: "https://gateway.example/v1" } },
      },
    });
  });

  it("refuses endpoints of one provider with different keys", () => {
    const refused = refusalOf({
      model: sonnet,
      models: { other: { ...sonnet, model: "claude-opus-5-5", apiKey: Redacted.make("another") } },
    });

    expect(refused).toMatchObject({
      _tag: "UnsupportedError",
      description:
        "opencode presents one key for each provider, and the endpoints for anthropic have different keys",
    });
  });

  it("refuses endpoints of one model that it is served differently for", () => {
    const differences = [
      { url: "https://gateway.example/v1" },
      { protocol: "openai-chat" },
      { maxOutputTokens: 4096 },
    ] as const;

    const refusals = differences.map((difference) =>
      refusalOf({ model: sonnet, models: { other: { ...sonnet, ...difference } } }),
    );

    for (const refused of refusals) {
      expect(refused).toMatchObject({
        _tag: "UnsupportedError",
        description:
          "opencode serves a model through one protocol, at one URL, with one output limit, and the endpoints for anthropic/claude-sonnet-5-5 differ in them",
      });
    }
  });

  it("takes a URL that ends in a slash as the one without it", () => {
    const models = Result.getOrThrow(
      Models.fromEndpoints({
        model: sonnet,
        models: { slashed: { ...sonnet, url: "https://api.anthropic.com/v1/" } },
      }),
    );

    expect(models.models["slashed"]).toEqual(models.model);
  });
});
