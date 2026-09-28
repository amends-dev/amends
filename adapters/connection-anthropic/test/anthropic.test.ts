import { ConnectionImplementation } from "@amends/connection";
import { expect, it } from "@effect/vitest";
import { Effect, Redacted, Schema } from "effect";
import { LanguageModel, Model } from "effect/unstable/ai";
import { AnthropicConnection } from "../src/index.ts";

interface Recorded {
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/** A fake Anthropic API on a free port, recording each request and answering with one message. */
const fakeApi = Effect.acquireRelease(
  Effect.sync(() => {
    const requests: Array<Recorded> = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        requests.push({
          path: new URL(request.url).pathname,
          headers: Object.fromEntries(request.headers),
          body: await request.json(),
        });
        return Response.json({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-test",
          content: [{ type: "text", text: "Hello from Claude" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 3,
            output_tokens: 4,
            cache_creation: null,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            inference_geo: null,
            service_tier: "standard",
          },
        });
      },
    });
    return { url: `http://127.0.0.1:${server.port}`, requests, server };
  }),
  ({ server }) => Effect.promise(() => server.stop(true)),
);

it("declares model inference through Anthropic's messages API, with an API key", () => {
  const declaration = Schema.decodeSync(ConnectionImplementation.Declaration)(
    AnthropicConnection.declaration,
  );
  expect(declaration.capabilities.modelInference?.interface).toBe("anthropic-messages");
  expect(declaration.capabilities.modelInference?.models?.map((model) => model.id)).toContain(
    "claude-opus-5-5",
  );
  expect(declaration.authentication).toEqual([{ _tag: "ApiKey", label: "API key" }]);
});

it.live("sends the connection's key to its API URL and answers as the selected model", () =>
  Effect.gen(function* () {
    const api = yield* fakeApi;
    const answer = yield* Effect.gen(function* () {
      const response = yield* LanguageModel.generateText({ prompt: "Hi" });
      return { text: response.text, provider: yield* Model.ProviderName };
    }).pipe(
      Effect.provide(
        AnthropicConnection.modelInference.languageModel(
          { settings: { baseUrl: api.url }, credential: Redacted.make("sk-ant-test") },
          { model: "claude-test" },
        ),
      ),
    );
    expect(answer).toEqual({ text: "Hello from Claude", provider: "anthropic" });
    expect(api.requests).toMatchObject([
      {
        path: "/v1/messages",
        headers: { "x-api-key": "sk-ant-test" },
        body: { model: "claude-test" },
      },
    ]);
  }),
);
