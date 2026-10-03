import { LocalSandboxProvider } from "@amends/sandbox-local-v2";
import { Effect, FileSystem, Stream } from "effect";
import { type AiError, LanguageModel, type Response } from "effect/ai";

/** A new sandbox on this machine, removed with its directory when the test's scope closes. */
export const makeSandbox = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const provider = yield* LocalSandboxProvider.make({
    directory: yield* fs.makeTempDirectoryScoped(),
  });
  return yield* provider.create();
});

/** What a scripted model responds to a request with. */
export type Script = (
  request: LanguageModel.ProviderOptions,
) => Stream.Stream<Response.StreamPartEncoded, AiError.AiError>;

export interface ScriptedModel {
  readonly model: LanguageModel.LanguageModel;

  /** The requests the model got, in order. */
  readonly requests: ReadonlyArray<LanguageModel.ProviderOptions>;
}

/**
 * A language model that responds to each request as `script` says, recording the requests. Asked
 * for a whole response, as `generateObject` asks, it responds with the script's text.
 */
export const makeScriptedModel = (script: Script) =>
  Effect.gen(function* () {
    const requests: Array<LanguageModel.ProviderOptions> = [];
    const model = yield* LanguageModel.make({
      streamText: (request) =>
        Stream.suspend(() => {
          requests.push(request);
          return script(request);
        }),
      generateText: (request) =>
        Effect.suspend(() => {
          requests.push(request);
          return Effect.map(Stream.runCollect(script(request)), wholeResponseOf);
        }),
    });
    const scripted: ScriptedModel = { model, requests };
    return scripted;
  });

/** A streamed response as one whole response: its text, and how it finished. */
const wholeResponseOf = (
  parts: ReadonlyArray<Response.StreamPartEncoded>,
): Array<Response.PartEncoded> => [
  {
    type: "text",
    text: parts.flatMap((part) => (part.type === "text-delta" ? [part.delta] : [])).join(""),
  },
  ...parts.filter((part) => part.type === "finish"),
];

/** The tokens each response uses. */
const usage = { inputTokens: { total: 10 }, outputTokens: { total: 5 } };

/** A response that answers `text`. */
export const answer = (text: string) =>
  Stream.fromIterable<Response.StreamPartEncoded>([
    { type: "text-start", id: "answer" },
    { type: "text-delta", id: "answer", delta: text },
    { type: "text-end", id: "answer" },
    { type: "finish", reason: "stop", usage },
  ]);

/** A response that calls the tool `name` with `params`, as the call `id`. */
export const callTool = (id: string, name: string, params: unknown) =>
  Stream.fromIterable<Response.StreamPartEncoded>([
    { type: "tool-call", id, name, params },
    { type: "finish", reason: "tool-calls", usage },
  ]);

/** The results of tool calls in a request's conversation, in order. */
export const toolResultsOf = (request: LanguageModel.ProviderOptions) =>
  request.prompt.content.flatMap((message) =>
    message.role === "tool"
      ? message.content.flatMap((part) => (part.type === "tool-result" ? [part.result] : []))
      : [],
  );
