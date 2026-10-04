/**
 * amends's own agent: a loop over an Effect AI `LanguageModel` that runs in the host's process. Each
 * step streams the model's response to the conversation so far while Effect AI runs the tools the
 * model calls, and a turn takes steps until the model answers without calling a tool. With a sandbox
 * the agent works with the tools in `Tools`; without one, it answers from its model alone, calling
 * only the host's tools.
 *
 * Its own state is its conversation, tool calls and results included, so a session it resumes goes
 * on as it left off. A turn does not outlive the process running it: `continue` goes on from the
 * steps of a turn `suspend` cut short that the session has, and runs the step in flight again.
 */
import { type Agent, HarnessError, type StreamPart } from "@amends/harness-v2";
import {
  Deferred,
  type Duration,
  Effect,
  flow,
  Layer,
  Queue,
  Ref,
  Result,
  Schema,
  Semaphore,
  Stream,
} from "effect";
import { AiError, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/ai";
import * as Tools from "./Tools.ts";

// TODO: Add instructions of the agent's own, telling the model where it works and how it works
// there, once the tools' descriptions are not enough.
export interface Options {
  /** The model a turn runs on when it names none. */
  readonly model: LanguageModel.LanguageModel;

  /** The models a turn can name, by name. A turn that names another fails with `UnsupportedError`. */
  readonly models?: Readonly<Record<string, LanguageModel.LanguageModel>>;

  /** The most steps a turn takes, ending it even while the model calls tools. Unlimited by default. */
  readonly maxSteps?: number;

  /** How long a `bash` command runs before the agent kills it, 2 minutes by default. */
  readonly commandTimeout?: Duration.Duration;
}

/** What `suspend`, `detach`, and `stop` return, for `start` to take back. */
const State = Schema.Struct({
  /** The finished turns, with their tool calls and results. */
  conversation: Prompt.Prompt,

  /** The steps of the turn `suspend` cut short, each as the messages that record it. */
  unfinishedTurn: Schema.optionalKey(Schema.Array(Prompt.Prompt)),
});

const StateJson = Schema.toCodecJson(State);

/** What `start` takes back, if anything: a state the agent returned. */
const SavedState = Schema.UndefinedOr(StateJson);

/** The agent. It needs no services of its own: a turn runs on the models the options give it. */
export const make = (options: Options): Effect.Effect<Agent.Agent> =>
  Effect.succeed({
    id: "amends",
    requiresSandbox: false,
    start: (startOptions) => startSession(options, startOptions),
  });

const startSession = Effect.fn("AmendsAgent.start")(function* (
  options: Options,
  startOptions: Agent.StartOptions,
) {
  const { workspace } = startOptions;
  const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
  const resumed = yield* readState(startOptions.agentState);
  const suspended = yield* readState(startOptions.unfinishedTurn);
  const conversation = yield* Ref.make(
    (resumed ?? suspended)?.conversation ?? startOptions.history,
  );
  /**
   * The running turn, or the one `suspend` cut short. A turn joins the conversation once the
   * session takes its `finish`, so that a turn which finished before the session had all of it can
   * still be continued, or as far as it got when its stream ends early.
   */
  const turn = yield* Ref.make<Turn | undefined>(undefined);
  /** Held while a turn runs, so that `suspend` and `stop` read the turn once it has stopped. */
  const turnPermit = yield* Semaphore.make(1);
  /** Whether `suspend` let go of the session, keeping the running turn for `continue`. */
  const keepsTurn = yield* Ref.make(false);
  /** Done once the session is suspended, stopped, or destroyed, stopping the running turn. */
  const closed = yield* Deferred.make<void>();
  /** The results the host submits for calls of its tools, by call id, until a stand-in takes them. */
  const hostResults = new Map<string, Deferred.Deferred<unknown, unknown>>();

  /** The model a turn names, or the agent's default. */
  const modelFor = (name: string | undefined) => {
    if (name === undefined) return Effect.succeed(options.model);
    const model =
      options.models !== undefined && Object.hasOwn(options.models, name)
        ? options.models[name]
        : undefined;
    return model === undefined
      ? Effect.fail(
          harnessError(
            new HarnessError.UnsupportedError({ description: `amends has no model named ${name}` }),
          ),
        )
      : Effect.succeed(model);
  };

  /** Where the host's result for the call `id` waits, until the call's stand-in takes it. */
  const hostResultOf = (id: string) =>
    Effect.sync(() => {
      const existing = hostResults.get(id);
      if (existing !== undefined) return existing;
      const created = Deferred.makeUnsafe<unknown, unknown>();
      hostResults.set(id, created);
      return created;
    });

  /** Answers a call of a host's tool with the result the host submits for it. */
  const awaitHostResult = (_params: unknown, context: Toolkit.HandlerContext<HostTool>) => {
    // `LanguageModel` gives each handler the id of the call it answers.
    const id = context.toolCallId ?? "";
    return Effect.flatMap(hostResultOf(id), Deferred.await).pipe(
      Effect.ensuring(Effect.sync(() => hostResults.delete(id))),
    );
  };

  /**
   * The tools a turn offers the model, with their handlers: the agent's own when it works in a
   * sandbox, and stand-ins for the host's.
   */
  const toolkitFor = (hostTools: ReadonlyArray<Tool.Any>) => {
    const standIns = hostTools.map(standInFor);
    const hostHandlers = Toolkit.make(...standIns).toLayer(
      Object.fromEntries(standIns.map((tool) => [tool.name, awaitHostResult])),
    );
    if (workspace === undefined) {
      return Effect.provide(Toolkit.make<ReadonlyArray<TurnTool>>(...standIns), hostHandlers);
    }
    const clash = hostTools.find((tool) => Object.hasOwn(Tools.toolkit.tools, tool.name));
    if (clash !== undefined) {
      const description = `The host's tool ${clash.name} has the name of one of amends's own tools`;
      return Effect.fail(harnessError(new HarnessError.UnsupportedError({ description })));
    }
    return Effect.provide(
      Toolkit.make<ReadonlyArray<TurnTool>>(...Object.values(Tools.toolkit.tools), ...standIns),
      Layer.merge(Tools.layer(workspace, { commandTimeout: options.commandTimeout }), hostHandlers),
    );
  };

  /** Whether `name` is one of the agent's own tools, which it has only in a sandbox. */
  const isOwnTool = (name: string) =>
    workspace !== undefined && Object.hasOwn(Tools.toolkit.tools, name);

  /** The prompt a step sends the model: the turn's instructions, the conversation, and the turn so far. */
  const promptFor = (instructions: string | undefined) =>
    Effect.map(Effect.all([Ref.get(conversation), Ref.get(turn)]), ([finished, current]) =>
      Prompt.fromMessages([
        ...(instructions === undefined
          ? []
          : [Prompt.makeMessage("system", { content: instructions })]),
        ...finished.content,
        ...(current === undefined ? [] : messagesOf(current)),
      ]),
    );

  /** Adds a finished step's messages to the running turn. */
  const recordStep = (step: Prompt.Prompt) =>
    Ref.update(turn, (current) =>
      current === undefined ? current : { ...current, steps: [...current.steps, step] },
    );

  /** Adds the turn, as far as it got, to the conversation. */
  const recordTurn = Effect.flatMap(Ref.getAndSet(turn, undefined), (ended) =>
    ended === undefined
      ? Effect.void
      : Ref.update(conversation, (current) =>
          Prompt.concat(current, Prompt.fromMessages(messagesOf(ended))),
        ),
  );

  /**
   * Runs one step: streams the model's response to the conversation so far while Effect AI runs the
   * tools the model calls, emitting the step's parts. Returns how the step finished.
   */
  const runStep = Effect.fn("AmendsAgent.runStep")(function* (
    instructions: string | undefined,
    toolkit: Toolkit.WithHandler<TurnTools>,
    emit: Emit,
  ) {
    const prompt = yield* promptFor(instructions);
    const parts: Array<Response.StreamPart<TurnTools>> = [];
    yield* LanguageModel.streamText({ prompt, toolkit }).pipe(
      Stream.runForEach((part) => {
        parts.push(part);
        // A step is recorded before its `finish-step` goes out, so that `continue` can go on after
        // any step the session has. Effect AI streams `finish` after the step's tool results.
        const record =
          part.type === "finish" ? recordStep(Prompt.fromResponseParts(parts)) : Effect.void;
        return Effect.andThen(record, Effect.flatMap(streamPartsOf(part, isOwnTool), emit));
      }),
    );
    const finish = parts.findLast((part) => part.type === "finish");
    // A response that did not say how it finished ended no step, and is recorded as it stands.
    if (finish === undefined) yield* recordStep(Prompt.fromResponseParts(parts));
    return finish ?? unknownFinish;
  });

  /**
   * Runs the step that answers a turn asking for JSON: the model answers the conversation so far,
   * without tools, with the JSON `format` describes. Emits the answer as text and returns how the
   * step finished.
   */
  const answerInJson = Effect.fn("AmendsAgent.answerInJson")(function* (
    instructions: string | undefined,
    format: JsonFormat,
    emit: Emit,
  ) {
    const prompt = yield* promptFor(instructions);
    const answer = yield* LanguageModel.generateObject({
      prompt,
      objectName: format.objectName,
      schema: answerSchemaOf(format.schema),
    }).pipe(
      Effect.map((response) => ({ text: response.text, finish: finishPartOf(response) })),
      // The session decodes the answer with the schema itself, and reports one that does not match.
      Effect.catchReason("AiError", "StructuredOutputError", (reason) =>
        Effect.succeed({ text: reason.responseText, finish: unknownFinish }),
      ),
    );
    yield* emit([
      { type: "text-start", id: "json-answer" },
      { type: "text-delta", id: "json-answer", delta: answer.text },
      { type: "text-end", id: "json-answer" },
    ]);
    yield* recordStep(
      Prompt.fromMessages([
        Prompt.makeMessage("assistant", {
          content: [Prompt.makePart("text", { text: answer.text })],
        }),
      ]),
    );
    yield* Effect.flatMap(streamPartsOf(answer.finish, isOwnTool), emit);
    return answer.finish;
  });

  /**
   * Streams a turn after the steps it finished: steps until the model stops calling tools, a step
   * answering in JSON when the turn asks for JSON, and then the turn's `finish`. A failure of the
   * model ends the turn with an `error` part. The turn stops when the session closes.
   */
  const runTurn = (turnOptions: Agent.TurnOptions, finishedSteps: ReadonlyArray<Prompt.Prompt>) =>
    Stream.callback<StreamPart.StreamPart, HarnessError.HarnessError>((queue) =>
      Effect.gen(function* () {
        const emit: Emit = (parts) => Queue.offerAll(queue, parts);
        yield* Ref.set(turn, { prompt: turnOptions.prompt, steps: finishedSteps });
        const languageModel = yield* modelFor(turnOptions.model);
        const toolkit = yield* toolkitFor(turnOptions.tools);
        const { instructions, responseFormat } = turnOptions;

        const steps: Array<Response.FinishPart> = [];
        const runSteps = Effect.gen(function* () {
          do {
            steps.push(yield* runStep(instructions, toolkit, emit));
          } while (takesAnotherStep(steps, maxSteps));
          if (responseFormat.type === "json") {
            steps.push(yield* answerInJson(instructions, responseFormat, emit));
          }
        });
        const outcome = yield* Effect.result(
          Effect.provideService(runSteps, LanguageModel.LanguageModel, languageModel),
        );
        if (Result.isFailure(outcome)) yield* emit([yield* errorPartOf(outcome.failure)]);
        yield* emit([yield* turnFinishOf(steps, Result.isFailure(outcome))]);
      }).pipe(
        Effect.raceFirst(Deferred.await(closed)),
        Semaphore.withPermit(turnPermit),
        Queue.into(queue),
      ),
    ).pipe(
      Stream.tap((part) => (part.type === "finish" ? recordTurn : Effect.void)),
      Stream.ensuring(
        Effect.flatMap(Ref.get(keepsTurn), (keeps) => (keeps ? Effect.void : recordTurn)),
      ),
    );

  /** Runs `effect` once the running turn has stopped, after the session closed. */
  const onceStopped = <A, E>(effect: Effect.Effect<A, E>) =>
    Semaphore.withPermit(turnPermit, effect);

  /** What the agent returns for `start` to take back, with the steps of a turn `suspend` cut short. */
  const saveState = (unfinishedTurn?: ReadonlyArray<Prompt.Prompt>) =>
    Effect.flatMap(Ref.get(conversation), (current) =>
      Schema.encodeEffect(StateJson)({
        conversation: current,
        ...(unfinishedTurn === undefined ? {} : { unfinishedTurn }),
      }),
    ).pipe(Effect.orDie);

  const close = Deferred.succeed(closed, undefined);

  const session: Agent.AgentSession = {
    hasUnfinishedTurn: suspended?.unfinishedTurn !== undefined,

    prompt: (turnOptions) => runTurn(turnOptions, []),

    continue: (turnOptions, finishedSteps) =>
      runTurn(turnOptions, suspended?.unfinishedTurn?.slice(0, finishedSteps) ?? []),

    submitToolResult: ({ id, result, isFailure }) =>
      Effect.flatMap(hostResultOf(id), (deferred) =>
        isFailure ? Deferred.fail(deferred, result) : Deferred.succeed(deferred, result),
      ),

    // TODO: Ask the host before running the agent's own tools, once a permission mode says when.
    approve: () =>
      Effect.fail(
        harnessError(
          new HarnessError.UnsupportedError({ description: "amends asks for no approvals" }),
        ),
      ),

    // TODO: Summarize the conversation, on request and once it outgrows the model's context.
    compact: () =>
      Effect.fail(
        harnessError(
          new HarnessError.UnsupportedError({ description: "amends does not compact yet" }),
        ),
      ),

    suspend: Effect.andThen(
      Effect.andThen(Ref.set(keepsTurn, true), close),
      onceStopped(Effect.flatMap(Ref.get(turn), (unfinished) => saveState(unfinished?.steps))),
    ),

    detach: saveState(),

    stop: Effect.andThen(close, onceStopped(Effect.andThen(recordTurn, saveState()))),

    destroy: close,
  };
  return session;
});

/** A turn as far as it got: its prompt, and the steps it finished, each as the messages that record it. */
interface Turn {
  readonly prompt: Prompt.UserMessage;
  readonly steps: ReadonlyArray<Prompt.Prompt>;
}

/** The messages that record `turn` in a conversation. */
const messagesOf = (turn: Turn) => [turn.prompt, ...turn.steps.flatMap((step) => step.content)];

/** A host's tool as the model sees it: through a stand-in that answers with the host's result. */
type HostTool = ReturnType<typeof standInFor>;

/** The tools a turn offers the model: the agent's own, and stand-ins for the host's. */
type TurnTool = (typeof Tools.toolkit.tools)[keyof typeof Tools.toolkit.tools] | HostTool;

type TurnTools = Toolkit.ToolsByName<ReadonlyArray<TurnTool>>;

type JsonFormat = Extract<Agent.TurnOptions["responseFormat"], { readonly type: "json" }>;

/** Delivers parts of the running turn to its stream. */
type Emit = (parts: ReadonlyArray<StreamPart.StreamPart>) => Effect.Effect<unknown>;

// TODO: Give the stand-in the host's Effect schema instead of its JSON schema, once a provider that
// adapts schemas to the model, such as OpenAI's in strict mode, rejects a host's tool.
/**
 * Stands in for a host's tool: the model sees the tool as the host declares it, and the stand-in
 * answers each call with the result the host submits, as it came. The session, which runs the host's
 * tool, checks the call's params.
 */
const standInFor = (tool: Tool.Any) =>
  Tool.dynamic(tool.name, {
    description: Tool.getDescription(tool),
    parameters: Tool.getJsonSchema(tool),
    success: Schema.Unknown,
    failure: Schema.Unknown,
    failureMode: "return",
  });

/** Whether a turn takes another step after `steps`: while the model calls tools, up to `maxSteps`. */
const takesAnotherStep = (steps: ReadonlyArray<Response.FinishPart>, maxSteps: number) =>
  steps.at(-1)?.reason === "tool-calls" && steps.length < maxSteps;

/**
 * The parts the harness streams for one of Effect AI's. Calls and results of the agent's own tools
 * are `providerExecuted`; results of the host's tools are left to the session, which streams its
 * own; and a response's `finish` ends a step.
 */
const streamPartsOf = (
  part: Response.StreamPart<TurnTools>,
  isOwnTool: (name: string) => boolean,
): Effect.Effect<ReadonlyArray<StreamPart.StreamPart>> => {
  switch (part.type) {
    case "tool-call":
      return Effect.succeed([
        {
          type: "tool-call",
          id: part.id,
          name: part.name,
          params: part.params,
          providerExecuted: isOwnTool(part.name),
          metadata: part.metadata,
        },
      ]);
    case "tool-result":
      return Effect.succeed(
        isOwnTool(part.name)
          ? [
              {
                type: "tool-result",
                id: part.id,
                name: part.name,
                result: part.encodedResult,
                isFailure: part.isFailure,
                providerExecuted: true,
                preliminary: part.preliminary,
                metadata: part.metadata,
              },
            ]
          : [],
      );
    case "finish":
      return Effect.map(encodeFinishPart(part), (finish) => [
        {
          type: "finish-step",
          reason: finish.reason,
          usage: finish.usage,
          metadata: finish.metadata,
        },
      ]);
    default:
      return Effect.map(encodeStreamPart(part), (encoded) => [encoded]);
  }
};

// Encoding what Effect AI decoded cannot fail.
const encodeStreamPart = flow(
  Schema.encodeEffect(Response.StreamPart(Toolkit.empty)),
  Effect.orDie,
);

const encodeFinishPart = flow(Schema.encodeEffect(Response.FinishPart), Effect.orDie);

const encodeAiError = flow(Schema.encodeEffect(Schema.toCodecJson(AiError.AiError)), Effect.orDie);

/** How a step finished when the model did not say. */
const unknownFinish = Response.makePart("finish", {
  reason: "unknown",
  usage: new Response.Usage({ inputTokens: {}, outputTokens: {} }),
  response: undefined,
});

const finishPartOf = (response: LanguageModel.GenerateTextResponse<{}>) =>
  Response.makePart("finish", {
    reason: response.finishReason,
    usage: response.usage,
    response: undefined,
  });

/** The turn's `finish`: why its last step ended, or `error`, and the tokens its steps used. */
const turnFinishOf = (steps: ReadonlyArray<Response.FinishPart>, failed: boolean) =>
  encodeFinishPart(
    Response.makePart("finish", {
      reason: failed ? "error" : (steps.at(-1)?.reason ?? "unknown"),
      usage: usageOf(steps),
      response: undefined,
    }),
  );

/** The tokens `steps` used together. */
const usageOf = (steps: ReadonlyArray<Response.FinishPart>) => {
  const sum = (tokens: (usage: Response.Usage) => number | undefined) =>
    steps.reduce<number | undefined>((total, step) => {
      const used = tokens(step.usage);
      return used === undefined ? total : (total ?? 0) + used;
    }, undefined);
  return new Response.Usage({
    inputTokens: {
      uncached: sum((usage) => usage.inputTokens.uncached),
      total: sum((usage) => usage.inputTokens.total),
      cacheRead: sum((usage) => usage.inputTokens.cacheRead),
      cacheWrite: sum((usage) => usage.inputTokens.cacheWrite),
    },
    outputTokens: {
      total: sum((usage) => usage.outputTokens.total),
      text: sum((usage) => usage.outputTokens.text),
      reasoning: sum((usage) => usage.outputTokens.reasoning),
    },
  });
};

/** The `error` part reporting the model's failure, with the `AiError` as JSON. */
const errorPartOf = (error: AiError.AiError) =>
  Effect.map(encodeAiError(error), (json): StreamPart.StreamPart => ({
    type: "error",
    error: json,
  }));

/**
 * The schema `generateObject` takes for a turn's JSON: `schema`'s encoded side, which describes the
 * JSON and decodes it as it came, needing no services, typed as the JSON object models answer with.
 * The session decodes the answer with `schema` itself.
 */
const answerSchemaOf = (schema: Schema.Top) =>
  Schema.make<Schema.Codec<Record<string, unknown>>>(Schema.toEncoded(schema).ast);

/** Reads a state the agent returned, failing when it is not one. */
const readState = (json: Schema.Json | undefined) =>
  Schema.decodeEffect(SavedState)(json).pipe(
    Effect.mapError((cause) =>
      harnessError(
        new HarnessError.InvalidOutputError({
          description: `amends cannot read the state it was given: ${cause.message}`,
        }),
        cause,
      ),
    ),
  );

const harnessError = (reason: HarnessError.HarnessErrorReason, cause?: unknown) =>
  new HarnessError.HarnessError({ agent: "amends", reason, cause });
