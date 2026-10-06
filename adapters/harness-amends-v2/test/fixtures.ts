import type { ModelEndpoint } from "@amends/harness-v2";
import { LocalSandboxProvider } from "@amends/sandbox-local-v2";
import { Effect, FileSystem, Stream } from "effect";
import { type AiError, LanguageModel, type Response } from "effect/ai";
import * as AmendsAgent from "../src/AmendsAgent.ts";
import * as Models from "../src/Models.ts";

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

/** The endpoint that stands for the scripted model `id`, which reaches nothing. */
const endpointOf = (id: string): ModelEndpoint.ModelEndpoint => ({
  provider: "scripted",
  model: id,
  protocol: "openai-chat",
  url: "http://scripted.invalid/v1",
});

/**
 * amends's agent on scripted models: `model` by default, and `models` that a turn names. It is made
 * with endpoints that stand for them, which `Models.LanguageModels` turns into the models.
 */
export const makeAgent = (
  options: Omit<AmendsAgent.Options, "model" | "models"> & {
    readonly model: LanguageModel.LanguageModel;
    readonly models?: Readonly<Record<string, LanguageModel.LanguageModel>>;
  },
) => {
  const { model, models = {}, ...rest } = options;
  const byId = new Map([
    ["default", model],
    ...Object.entries(models).map(([name, named]) => [`named-${name}`, named] as const),
  ]);
  return AmendsAgent.make({
    ...rest,
    model: endpointOf("default"),
    models: Object.fromEntries(
      Object.keys(models).map((name) => [name, endpointOf(`named-${name}`)]),
    ),
  }).pipe(
    Effect.provideService(
      Models.LanguageModels,
      Models.LanguageModels.of({
        make: (endpoint) =>
          Effect.suspend(() => {
            const scripted = byId.get(endpoint.model);
            return scripted === undefined
              ? Effect.die(`No scripted model stands for ${endpoint.model}`)
              : Effect.succeed(scripted);
          }),
      }),
    ),
  );
};

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
  callTools([{ id, name, params }]);

/** A response that calls several tools together, each `name` with `params`, as the call `id`. */
export const callTools = (
  calls: ReadonlyArray<{ readonly id: string; readonly name: string; readonly params: unknown }>,
) =>
  Stream.fromIterable<Response.StreamPartEncoded>([
    ...calls.map((call): Response.StreamPartEncoded => ({ type: "tool-call", ...call })),
    { type: "finish", reason: "tool-calls", usage },
  ]);

/** The results of tool calls in a request's conversation, in order. */
export const toolResultsOf = (request: LanguageModel.ProviderOptions) =>
  request.prompt.content.flatMap((message) =>
    message.role === "tool"
      ? message.content.flatMap((part) => (part.type === "tool-result" ? [part.result] : []))
      : [],
  );
