import { ModelInference } from "@amends/connection/model-inference";
import type { Subject } from "@amends/harness/conformance";
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer, Redacted } from "effect";
import { AcpHarness, OpenCodeHarness } from "../src/index.ts";

/** Whether the pinned opencode release is on the `PATH`; the suites need it and skip without it. */
export const installed = (() => {
  try {
    const result = Bun.spawnSync(["opencode", "--version"]);
    return result.stdout.toString().trim() === OpenCodeHarness.version;
  } catch {
    return false;
  }
})();

/** A server-sent event of a streamed chat completion. */
export const chunk = (choice: object, extra: object = {}) =>
  `data: ${JSON.stringify({ id: "c1", model: "fake-model", created: 0, choices: [choice], ...extra })}\n\n`;
export const finish = (reason: "stop" | "tool_calls") =>
  chunk(
    { index: 0, delta: {}, finish_reason: reason },
    { usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } },
  ) + "data: [DONE]\n\n";
export const textReply = (text: string) =>
  chunk({ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }) +
  finish("stop");

/**
 * A model behind OpenAI's chat completions API on a local port: `respond` gives the streamed body
 * of the reply to each request by its index, or a response to send instead.
 */
export const fakeModel = (respond: (index: number) => string | Response) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const requests: Array<string> = [];
      const server = Bun.serve({
        port: 0,
        fetch: async (request) => {
          if (new URL(request.url).pathname !== "/v1/chat/completions")
            return new Response("Not found", { status: 404 });
          requests.push(await request.text());
          const reply = respond(requests.length - 1);
          return typeof reply === "string"
            ? new Response(reply, { headers: { "content-type": "text/event-stream" } })
            : reply;
        },
      });
      return { server, requests };
    }),
    ({ server }) => Effect.promise(() => server.stop(true)),
  ).pipe(
    Effect.map(({ server, requests }) => ({
      layer: Layer.merge(
        Layer.succeed(ModelInference.Endpoint, {
          interface: "openai-chat-completions",
          baseUrl: `${server.url.origin}/v1`,
          apiKey: Redacted.make("test-key"),
          model: "fake-model",
          limits: { contextTokens: 100_000, outputTokens: 4_096 },
        }),
        BunServices.layer,
      ),
      requests: Effect.sync(() => [...requests]),
    })),
  );

const model: Subject<ModelInference.Endpoint | AcpHarness.Services>["model"] = (script) =>
  fakeModel((index) => {
    if (script.refuseKey === true)
      return Response.json(
        { error: { message: "Incorrect API key provided.", type: "invalid_request_error" } },
        { status: 401 },
      );
    const reply = script.replies[index];
    return reply === undefined ? new Response("No reply left.", { status: 500 }) : textReply(reply);
  });

/** A working directory for one test, removed when it ends. */
export const workdir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "amends-opencode-" }));
}).pipe(Effect.provide(BunServices.layer), Effect.orDie);

export const subject: Subject<ModelInference.Endpoint | AcpHarness.Services> = {
  name: "opencode",
  available: installed,
  harness: Effect.map(workdir, OpenCodeHarness.make),
  model,
  timeout: 30_000,
};
