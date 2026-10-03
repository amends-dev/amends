import type { Subject } from "@amends/harness/conformance";
import { AmendsHarness } from "@amends/harness-amends";
import { Effect, Layer, Stream } from "effect";
import { AiError, LanguageModel } from "effect/ai";

/** A model whose replies follow the script, keeping the prompt of each request. */
export const subject: Subject<LanguageModel.LanguageModel> = {
  name: "amends",
  available: true,
  harness: Effect.succeed(AmendsHarness.harness),
  model: (script) =>
    Effect.gen(function* () {
      const requests: Array<string> = [];
      const model = yield* LanguageModel.make({
        generateText: () => Effect.die(new Error("The harness streams.")),
        streamText: (options) =>
          Stream.suspend(() => {
            requests.push(JSON.stringify(options.prompt));
            const reply = script.replies[requests.length - 1];
            if (script.refuseKey === true)
              return Stream.fail(
                AiError.make({
                  module: "Test",
                  method: "streamText",
                  reason: new AiError.AuthenticationError({ kind: "InvalidKey" }),
                }),
              );
            if (reply === undefined) return Stream.die(new Error("No reply left."));
            return Stream.make(
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: reply },
              { type: "text-end", id: "t1" },
              {
                type: "finish",
                reason: "stop",
                usage: { inputTokens: { total: 10 }, outputTokens: { total: 2 } },
              },
            );
          }),
      });
      return {
        layer: Layer.succeed(LanguageModel.LanguageModel, model),
        requests: Effect.sync(() => [...requests]),
      };
    }),
  timeout: 5_000,
};
