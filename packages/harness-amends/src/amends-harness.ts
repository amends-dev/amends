import { Cause, Effect, Option, Queue, Ref, Result, Schema, Semaphore, Stream } from "effect";
import type { JsonSchema } from "effect";
import { AiError, LanguageModel, Model, Tool } from "effect/unstable/ai";
import type { Response, Toolkit } from "effect/unstable/ai";
import {
  Harness,
  HarnessErrors,
  HarnessTool,
  Transcript,
  type HarnessImplementation,
} from "@amends/harness";
import type { HarnessEvent } from "@amends/harness";
import { AmendsPrompt } from "./prompt.ts";

/** Amends's own harness: an agent loop run in process through Effect AI. */
export const name = Harness.Name.make("amends");

/**
 * The loop keeps no state beyond its transcript, so it continues any valid transcript, and a call
 * an earlier session left pending waits for its result.
 */
export const capabilities: Harness.Capabilities = { transcript: true, pendingToolCalls: true };

/**
 * What a host registers: the loop runs in process, over the Effect AI model a connection's
 * implementation supplies, so any model connection the host installed works. Running it inside a
 * sandbox, and reasoning levels, are not supported yet.
 */
export const declaration: HarnessImplementation.Declaration = {
  id: name,
  name: "Amends",
  description: "Amends's own agent loop, over the model a connection provides.",
  placement: ["in-process"],
  models: { _tag: "LanguageModel" },
};

interface State {
  readonly prepared: boolean;
  readonly transcript: ReadonlyArray<Transcript.Item>;
  /** Submitted batches not yet taken in. */
  readonly queued: ReadonlyArray<HarnessEvent.InputBatch>;
  /** Calls this session is running, which only it answers. */
  readonly running: ReadonlySet<string>;
  readonly responses: number;
  /** Whether `Idle` was reported for the transcript as it stands. */
  readonly idle: boolean;
  readonly stopped: HarnessErrors.ExecutionFailed | undefined;
}

/** The session only ever extends a valid transcript validly. */
const summaryOf = (transcript: ReadonlyArray<Transcript.Item>) =>
  Result.getOrThrowWith(
    Transcript.summarize(transcript),
    (reason) => new Error(`The amends harness built an invalid transcript: ${reason}`),
  );

const executionFailed = (error: unknown) =>
  new HarnessErrors.ExecutionFailed({
    reason: error instanceof Error ? error.message : String(error),
    retryable: AiError.isAiError(error) && error.isRetryable,
  });

const unsupported = (what: string) =>
  new HarnessErrors.ExecutionFailed({
    reason: `The amends harness cannot record ${what}.`,
    retryable: false,
  });

/**
 * The session's tools as Effect AI declares them to the model. The loop runs calls itself, so it
 * records each outcome and can leave a call pending; Effect AI never calls `handle`.
 */
const declare = (definition: HarnessTool.Definition) =>
  Tool.dynamic(definition.name, {
    description: definition.description,
    parameters: definition.parameters as JsonSchema.JsonSchema,
  });

const toolkitOf = (
  definitions: ReadonlyArray<HarnessTool.Definition>,
): Toolkit.WithHandler<Record<string, ReturnType<typeof declare>>> => ({
  tools: Object.fromEntries(
    definitions.map((definition) => [definition.name, declare(definition)]),
  ),
  handle: () => Effect.die(new Error("The amends harness runs its tool calls itself.")),
});

const merge = (
  left: Response.ProviderMetadata,
  right: Response.ProviderMetadata,
): Response.ProviderMetadata => {
  const merged: Record<string, Response.ProviderMetadata[string]> = { ...left };
  for (const [provider, metadata] of Object.entries(right)) {
    const previous = merged[provider];
    merged[provider] =
      typeof previous === "object" &&
      previous !== null &&
      !Array.isArray(previous) &&
      typeof metadata === "object" &&
      metadata !== null &&
      !Array.isArray(metadata)
        ? Object.assign({}, previous, metadata)
        : metadata;
  }
  return merged;
};

const withNative = (metadata: Response.ProviderMetadata) => {
  const native = AmendsPrompt.nativeOf(metadata);
  return native === undefined ? {} : { native };
};

const usageOf = (usage: Response.Usage): HarnessEvent.Usage => ({
  ...(usage.inputTokens.total !== undefined && { inputTokens: usage.inputTokens.total }),
  ...(usage.outputTokens.total !== undefined && { outputTokens: usage.outputTokens.total }),
  ...(usage.inputTokens.cacheRead !== undefined && {
    cacheReadTokens: usage.inputTokens.cacheRead,
  }),
  ...(usage.inputTokens.cacheWrite !== undefined && {
    cacheWriteTokens: usage.inputTokens.cacheWrite,
  }),
  ...(usage.outputTokens.reasoning !== undefined && {
    reasoningTokens: usage.outputTokens.reasoning,
  }),
});

interface Streamed {
  readonly _tag: "Text" | "Reasoning";
  text: string;
  metadata: Response.ProviderMetadata;
}

const start = Effect.fnUntraced(function* (options: Harness.StartOptions) {
  const model = yield* LanguageModel.LanguageModel;
  const provider = Option.getOrUndefined(yield* Effect.serviceOption(Model.ProviderName));
  const modelName = Option.getOrUndefined(yield* Effect.serviceOption(Model.ModelName));
  const tools = options.tools;
  const toolkit = toolkitOf(tools?.definitions ?? []);
  const events = yield* Queue.unbounded<
    HarnessEvent.Event,
    HarnessErrors.ExecutionFailed | Cause.Done
  >();
  const wake = yield* Queue.make<void>({ capacity: 1, strategy: "dropping" });
  const lock = yield* Semaphore.make(1);
  const state = yield* Ref.make<State>({
    prepared: false,
    transcript: [],
    queued: [],
    running: new Set(),
    responses: 0,
    idle: false,
    stopped: undefined,
  });

  const emit = (event: HarnessEvent.Event) => Queue.offer(events, event).pipe(Effect.asVoid);
  const wakeUp = Queue.offer(wake, undefined).pipe(Effect.asVoid);
  const usable = (current: State) =>
    current.stopped !== undefined
      ? Effect.fail(current.stopped)
      : current.prepared
        ? Effect.void
        : Effect.fail(new HarnessErrors.NotPrepared());

  /** Takes in submitted input once no call is waiting, and says what the transcript expects. */
  const incorporate = Effect.gen(function* () {
    const current = yield* Ref.get(state);
    const summary = summaryOf(current.transcript);
    if (summary.pending.length > 0 || current.queued.length === 0) return summary;
    const transcript = [...current.transcript, ...current.queued.flatMap((batch) => batch.items)];
    yield* Ref.set(state, { ...current, transcript, queued: [], idle: false });
    for (const batch of current.queued) yield* emit({ _tag: "InputIncorporated", batch });
    return summaryOf(transcript);
  });

  /** Reports `Idle` once, unless input arrived meanwhile, which means more work. */
  const settle = Effect.gen(function* () {
    const current = yield* Ref.get(state);
    if (current.queued.length > 0) return true;
    if (!current.idle) {
      yield* Ref.set(state, { ...current, idle: true });
      yield* emit({ _tag: "Idle" });
    }
    return false;
  });

  /** Streams one response to the transcript, then records it with its calls marked running. */
  const respond = Effect.gen(function* () {
    const current = yield* Ref.get(state);
    const responseId = Transcript.ResponseId.make(`${options.sessionId}/${current.responses + 1}`);
    const parts: Array<Streamed | Transcript.ToolCall> = [];
    const streaming = new Map<string, number>();
    let finish: HarnessEvent.FinishReason = "unknown";
    let usage: HarnessEvent.Usage | undefined;
    let modelId = modelName;

    const open = (kind: Streamed["_tag"], id: string, metadata: Response.ProviderMetadata) => {
      const index = parts.push({ _tag: kind, text: "", metadata }) - 1;
      streaming.set(`${kind}:${id}`, index);
      return index;
    };
    const streamed = (kind: Streamed["_tag"], id: string, metadata: Response.ProviderMetadata) => {
      const index = streaming.get(`${kind}:${id}`) ?? open(kind, id, {});
      const part = parts[index] as Streamed;
      part.metadata = merge(part.metadata, metadata);
      return { index, part };
    };
    const delta = (
      kind: Streamed["_tag"],
      id: string,
      text: string,
      metadata: Response.ProviderMetadata,
    ) => {
      const { index, part } = streamed(kind, id, metadata);
      part.text += text;
      return emit({
        _tag: kind === "Text" ? "TextDelta" : "ReasoningDelta",
        responseId,
        part: index,
        delta: text,
      });
    };

    yield* model
      .streamText({
        prompt: AmendsPrompt.make(options.instructions, current.transcript),
        toolkit,
        disableToolCallResolution: true,
      })
      .pipe(
        Stream.mapError(executionFailed),
        Stream.runForEach((part): Effect.Effect<void, HarnessErrors.ExecutionFailed> => {
          switch (part.type) {
            case "text-start":
              open("Text", part.id, part.metadata);
              return Effect.void;
            case "text-delta":
              return delta("Text", part.id, part.delta, part.metadata);
            case "text-end":
              streamed("Text", part.id, part.metadata);
              return Effect.void;
            case "reasoning-start":
              open("Reasoning", part.id, part.metadata);
              return Effect.void;
            case "reasoning-delta":
              return delta("Reasoning", part.id, part.delta, part.metadata);
            case "reasoning-end":
              streamed("Reasoning", part.id, part.metadata);
              return Effect.void;
            case "tool-params-start":
            case "tool-params-delta":
            case "tool-params-end":
              return Effect.void;
            case "tool-call":
              if (part.providerExecuted) return Effect.fail(unsupported("a call its provider ran"));
              return Schema.decodeUnknownEffect(Schema.Json)(part.params).pipe(
                Effect.mapError(executionFailed),
                Effect.map((params) => {
                  parts.push({
                    _tag: "ToolCall",
                    id: Transcript.ToolCallId.make(part.id),
                    name: part.name,
                    params,
                    ...withNative(part.metadata),
                  });
                }),
              );
            case "response-metadata":
              modelId = part.modelId ?? modelId;
              return Effect.void;
            case "finish":
              finish = part.reason;
              usage = usageOf(part.usage);
              return Effect.void;
            case "error":
              return Effect.fail(executionFailed(part.error));
            default:
              return Effect.fail(unsupported(`a ${part.type} part`));
          }
        }),
      );

    const response: Transcript.Response = {
      _tag: "Response",
      id: responseId,
      parts: parts.map((part) =>
        part._tag === "ToolCall"
          ? part
          : { _tag: part._tag, text: part.text, ...withNative(part.metadata) },
      ),
    };
    const reference: HarnessEvent.ModelReference = {
      ...(provider !== undefined && { provider }),
      ...(modelId !== undefined && { model: modelId }),
    };
    yield* lock.withPermit(
      Effect.gen(function* () {
        const latest = yield* Ref.get(state);
        const calls = response.parts.flatMap((part) => (part._tag === "ToolCall" ? [part.id] : []));
        yield* Ref.set(state, {
          ...latest,
          transcript: [...latest.transcript, response],
          running: new Set([...latest.running, ...calls]),
          responses: latest.responses + 1,
          idle: false,
        });
        yield* emit({
          _tag: "ResponseCompleted",
          response,
          finish,
          ...(Object.keys(reference).length > 0 && { model: reference }),
          ...(usage !== undefined && { usage }),
        });
      }),
    );
    return response;
  });

  const record = (result: Transcript.ToolResult) =>
    lock.withPermit(
      Effect.gen(function* () {
        const current = yield* Ref.get(state);
        const running = new Set(current.running);
        running.delete(result.callId);
        yield* Ref.set(state, {
          ...current,
          transcript: [...current.transcript, result],
          running,
          idle: false,
        });
        yield* emit({ _tag: "ToolCallCompleted", result });
      }),
    );

  const execute = (call: Transcript.ToolCall) =>
    (tools === undefined
      ? Effect.succeed(HarnessTool.failure(`No tool is named ${call.name}.`))
      : tools.invoke(call)
    ).pipe(Effect.flatMap((outcome) => record(Transcript.toolResult(call, outcome))));

  /** One pass: take in input, then answer it and run the calls the answer asks for. */
  const step = Effect.gen(function* () {
    const summary = yield* lock.withPermit(incorporate);
    if (summary.pending.length > 0) return false;
    if (!summary.awaitsResponse) return yield* lock.withPermit(settle);
    const response = yield* respond;
    yield* Effect.forEach(
      response.parts.flatMap((part) => (part._tag === "ToolCall" ? [part] : [])),
      execute,
      { concurrency: "unbounded", discard: true },
    );
    return true;
  });

  const drive = Effect.gen(function* () {
    let working = true;
    while (working) working = yield* step;
  });

  const stop = (failure: HarnessErrors.ExecutionFailed) =>
    lock.withPermit(
      Ref.update(state, (current) => ({ ...current, stopped: failure })).pipe(
        Effect.andThen(Queue.fail(events, failure)),
        Effect.asVoid,
      ),
    );

  yield* Effect.addFinalizer(() => Queue.end(events));
  yield* Queue.take(wake).pipe(
    Effect.andThen(drive),
    Effect.forever,
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
      const error = Cause.squash(cause);
      return stop(
        error instanceof HarnessErrors.ExecutionFailed
          ? error
          : new HarnessErrors.ExecutionFailed({ reason: Cause.pretty(cause), retryable: false }),
      );
    }),
    Effect.forkScoped,
  );

  return {
    prepare: (transcript) =>
      lock.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          if (current.prepared) return yield* new HarnessErrors.AlreadyPrepared();
          const summary = Transcript.summarize(transcript);
          if (Result.isFailure(summary))
            return yield* new HarnessErrors.InvalidTranscript({ reason: summary.failure });
          yield* Ref.set(state, { ...current, prepared: true, transcript: [...transcript] });
        }),
      ),
    submit: (batch) =>
      lock
        .withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            yield* usable(current);
            yield* Ref.set(state, { ...current, queued: [...current.queued, batch], idle: false });
          }),
        )
        .pipe(Effect.andThen(wakeUp)),
    resolve: (callId, outcome) =>
      lock
        .withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            yield* usable(current);
            const call = summaryOf(current.transcript).pending.find(
              (pending) => pending.id === callId,
            );
            if (call === undefined || current.running.has(callId))
              return yield* new HarnessErrors.NotPending({ callId });
            const result = Transcript.toolResult(call, outcome);
            yield* Ref.set(state, {
              ...current,
              transcript: [...current.transcript, result],
              idle: false,
            });
            yield* emit({ _tag: "ToolCallCompleted", result });
          }),
        )
        .pipe(Effect.andThen(wakeUp)),
    resume: lock
      .withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          yield* usable(current);
          yield* Ref.set(state, { ...current, idle: false });
        }),
      )
      .pipe(Effect.andThen(wakeUp)),
    events: Stream.fromQueue(events),
  } satisfies Harness.Session;
});

/**
 * The amends harness. Its sessions use the `LanguageModel` in their environment, which the
 * environment builds from the agent's model connection and selection.
 */
export const make = (): Harness.Interface<LanguageModel.LanguageModel> => ({
  name,
  capabilities,
  start,
});

export * as AmendsHarness from "./amends-harness.ts";
