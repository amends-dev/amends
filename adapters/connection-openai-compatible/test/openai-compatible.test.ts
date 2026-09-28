import { ConnectionImplementation } from "@amends/connection";
import { expect, it } from "@effect/vitest";
import { Effect, Redacted, Schema } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { OpenAiCompatibleConnection } from "../src/index.ts";

interface Recorded {
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/** A fake chat-completions API on a free port, recording requests and answering with one reply. */
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
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1_790_000_000,
          model: "local-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello from a local model" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
        });
      },
    });
    return { url: `http://127.0.0.1:${server.port}/v1`, requests, server };
  }),
  ({ server }) => Effect.promise(() => server.stop(true)),
);

const ask = (
  access: Parameters<typeof OpenAiCompatibleConnection.modelInference.languageModel>[0],
) =>
  LanguageModel.generateText({ prompt: "Hi" }).pipe(
    Effect.map((response) => response.text),
    Effect.provide(
      OpenAiCompatibleConnection.modelInference.languageModel(access, { model: "local-model" }),
    ),
  );

it("declares model inference through chat completions, with or without an API key", () => {
  const declaration = Schema.decodeSync(ConnectionImplementation.Declaration)(
    OpenAiCompatibleConnection.declaration,
  );
  expect(declaration.capabilities).toEqual({
    modelInference: { interface: "openai-chat-completions" },
  });
  expect(declaration.authentication.map((method) => method._tag)).toEqual(["ApiKey", "None"]);
  expect(declaration.settings.find((setting) => setting.key === "baseUrl")?.required).toBe(true);
});

it.live("sends the key as a bearer token to the configured API", () =>
  Effect.gen(function* () {
    const api = yield* fakeApi;
    expect(
      yield* ask({ settings: { baseUrl: api.url }, credential: Redacted.make("sk-compatible") }),
    ).toBe("Hello from a local model");
    expect(api.requests).toMatchObject([
      {
        path: "/v1/chat/completions",
        headers: { authorization: "Bearer sk-compatible" },
        body: { model: "local-model" },
      },
    ]);
  }),
);

it.live("sends no authorization to a server that needs none", () =>
  Effect.gen(function* () {
    const api = yield* fakeApi;
    expect(yield* ask({ settings: { baseUrl: api.url }, credential: undefined })).toBe(
      "Hello from a local model",
    );
    expect(api.requests[0]?.headers["authorization"]).toBeUndefined();
  }),
);
