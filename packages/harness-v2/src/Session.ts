/**
 * A session is one conversation with an agent, run a turn at a time. It is what callers hold:
 * `Harness.startSession` starts one over an agent session, and the session adds the host's tools,
 * whole-turn results, and the record of the conversation that `SessionState` keeps.
 *
 * `SessionState` is what `suspend`, `detach`, and `stop` return for the caller to store. It records
 * the conversation as Effect AI `Prompt` messages, so that `Harness.resumeSession` can pick the
 * session up on any agent: the agent that last ran it resumes from its own state, and any other
 * loads the conversation, and runs an unfinished turn again from its prompt.
 */
import { Data, Effect, Ref, Schema, Stream } from "effect";
import type { AiError, Response, Toolkit } from "effect/ai";
import { Prompt, type Tool } from "effect/ai";
import { type AgentSession, SessionId } from "./Agent.ts";
import { GenerateObjectResult, GenerateResult } from "./GenerateResult.ts";
import {
  HarnessError,
  type HarnessErrorReason,
  InvalidOutputError,
  NotFoundError,
  StructuredOutputError,
  TurnFailedError,
  TurnInProgressError,
} from "./HarnessError.ts";
import type { StreamPart } from "./StreamPart.ts";

/** A turn that `suspend` cut short, kept so that the session can finish it later. */
export const UnfinishedTurn = Schema.Struct({
  prompt: Prompt.UserMessage,

  /**
   * The steps the turn finished before `suspend`, each as the messages that record it. The agent
   * that cut the turn short continues it after them; any other runs the turn again without them.
   */
  steps: Schema.Array(Prompt.Prompt),

  /** What the agent's `suspend` returned. Without it, the next agent runs the turn again from `prompt`. */
  agentState: Schema.optional(Schema.Json),
});

export interface UnfinishedTurn extends Schema.Schema.Type<typeof UnfinishedTurn> {}

export const SessionState = Schema.Struct({
  id: SessionId,

  /** The agent that last ran the session, whose `agentState` only it can read. */
  agent: Schema.String,

  /**
   * The conversation so far: each turn's prompt, the tools its steps called, and its answer. A turn
   * that ended early, as when `stop` aborted it, is kept as far as it got.
   */
  history: Prompt.Prompt,

  /** What the agent's `detach` or `stop` returned. */
  agentState: Schema.optional(Schema.Json),

  unfinishedTurn: Schema.optional(UnfinishedTurn),
});

export interface SessionState extends Schema.Schema.Type<typeof SessionState> {}

// TODO: Add `continueGenerate`, which finishes an unfinished turn and returns it whole, and let
// `continue` finish a turn that answers in JSON, once a caller continues such turns.
// TODO: Ask the host before running its tools that need approval, as `LanguageModel` does for
// tools with `needsApproval`.
export interface StreamOptions<Tools extends Record<string, Tool.Any> = {}> {
  /** What the turn asks: text, or a user message that can also carry files. */
  readonly prompt: string | Prompt.UserMessage;

  /** Instructions for this turn, given as system or developer instructions where the agent has them. */
  readonly instructions?: string;

  /** The model for this turn, as the agent names models. The agent's default when omitted. */
  readonly model?: string;

  /**
   * The host's tools, with their handlers. When the agent calls one, the session runs its handler,
   * streams the result as a `tool-result` part, and gives the result back to the agent.
   */
  readonly toolkit?: Toolkit.WithHandler<Tools>;
}

/** The settings the unfinished turn started with, given again for an agent that runs it again. */
export type ContinueOptions<Tools extends Record<string, Tool.Any> = {}> = Omit<
  StreamOptions<Tools>,
  "prompt"
>;

export interface GenerateObjectOptions<
  S extends Schema.Top,
  Tools extends Record<string, Tool.Any> = {},
> extends StreamOptions<Tools> {
  /** The schema the turn's answer decodes to, as JSON. */
  readonly schema: S;

  /** Names the object for agents that name the JSON they answer with. Defaults to `output`. */
  readonly objectName?: string;
}

/** What a turn fails with: the harness's errors, and those of the host's tools the agent called. */
export type TurnError<Tools extends Record<string, Tool.Any>> =
  | HarnessError
  | AiError.AiError
  | Tool.HandlerError<Tools[keyof Tools]>;

/** What the host's tools that a turn can call need. */
export type TurnServices<Tools extends Record<string, Tool.Any>> = Tool.HandlerServices<
  Tools[keyof Tools]
>;

export interface Session {
  readonly id: SessionId;

  /**
   * Runs a turn, streaming its parts until `finish`. Interrupting the stream aborts the turn, which
   * the conversation keeps as far as it got. A failure the agent reports arrives as an `error` part,
   * and the turn finishes with `error`.
   */
  readonly stream: <Tools extends Record<string, Tool.Any> = {}>(
    options: StreamOptions<Tools>,
  ) => Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>>;

  /** Runs a turn and returns it whole. Fails with `TurnFailedError` when the agent reports a failure. */
  readonly generate: <Tools extends Record<string, Tool.Any> = {}>(
    options: StreamOptions<Tools>,
  ) => Effect.Effect<GenerateResult, TurnError<Tools>, TurnServices<Tools>>;

  /**
   * Runs a turn that answers in JSON and decodes the answer with `schema`. Fails with
   * `StructuredOutputError` when the answer does not decode, and with `UnsupportedError` when the
   * agent cannot answer in JSON.
   */
  readonly generateObject: <S extends Schema.Top, Tools extends Record<string, Tool.Any> = {}>(
    options: GenerateObjectOptions<S, Tools>,
  ) => Effect.Effect<
    GenerateObjectResult<S["Type"]>,
    TurnError<Tools>,
    TurnServices<Tools> | S["DecodingServices"]
  >;

  /**
   * Streams the unfinished turn the session was started with, like `stream`, from the step that
   * was in flight when `suspend` cut it short. That step starts over, so the parts of it delivered
   * before `suspend` are replaced by the ones `continue` streams. An agent that does not have the
   * turn, such as another agent, runs it again from its prompt.
   */
  readonly continue: <Tools extends Record<string, Tool.Any> = {}>(
    options: ContinueOptions<Tools>,
  ) => Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>>;

  /** Answers a `tool-approval-request` from the agent. */
  readonly approve: AgentSession["approve"];

  /** Asks the agent to replace its conversation so far with a summary, which arrives as a `compaction` part. */
  readonly compact: AgentSession["compact"];

  /**
   * Ends the running turn's stream, while the agent keeps working where it can, and returns the
   * session with the turn unfinished, for `continue` to finish after `Harness.resumeSession`.
   */
  readonly suspend: Effect.Effect<SessionState, HarnessError>;

  /** Lets go of the session between turns while the agent keeps running. */
  readonly detach: Effect.Effect<SessionState, HarnessError>;

  /**
   * Stops the agent, aborting a running turn, whose stream ends with an error and which the
   * conversation keeps as far as it got, and returns the session to start again later.
   */
  readonly stop: Effect.Effect<SessionState, HarnessError>;

  /** Stops the agent for good. */
  readonly destroy: Effect.Effect<void, HarnessError>;
}

/** Makes the session `Harness.startSession` hands out, over an agent session it started. */
export const make = Effect.fn("Session.make")(function* (options: {
  readonly id: SessionId;
  readonly agent: string;
  readonly agentSession: AgentSession;
  readonly history: Prompt.Prompt;
  readonly unfinishedTurn: UnfinishedTurn | undefined;
}) {
  const { agentSession } = options;
  // An agent that does not have the unfinished turn runs it again from its prompt, so the steps
  // the turn finished before are not part of it.
  const unfinishedTurn =
    options.unfinishedTurn !== undefined && !agentSession.hasUnfinishedTurn
      ? { prompt: options.unfinishedTurn.prompt, steps: [] }
      : options.unfinishedTurn;
  const state = yield* Ref.make<State>({
    status:
      unfinishedTurn === undefined ? Status.Idle() : Status.Unfinished({ turn: unfinishedTurn }),
    history: options.history,
  });

  const harnessError = (method: string, reason: HarnessErrorReason, cause?: unknown) =>
    new HarnessError({ harness: options.agent, method, reason, cause });

  /** Fails when `operation` cannot run in the session's current status. */
  const checkStatus = (operation: Operation) =>
    Effect.flatMap(Ref.get(state), ({ status }) => {
      const reason = refusal(status, operation);
      return reason === undefined ? Effect.void : Effect.fail(harnessError(operation, reason));
    });

  /** Marks the session as running a new turn of `prompt`, failing when it cannot start one now. */
  const startTurn = (method: string, prompt: Prompt.UserMessage) =>
    Effect.flatten(
      Ref.modify(state, (current): [Effect.Effect<void, HarnessError>, State] => {
        const reason = refusal(current.status, "stream");
        return reason === undefined
          ? [
              Effect.void,
              {
                ...current,
                status: Status.Running({
                  turn: { prompt, steps: [], stepParts: [] },
                  lettingGo: undefined,
                }),
              },
            ]
          : [Effect.fail(harnessError(method, reason)), current];
      }),
    );

  /** Marks the session as running its unfinished turn and returns the turn, failing when it has none. */
  const resumeTurn = Effect.flatten(
    Ref.modify(state, (current): [Effect.Effect<UnfinishedTurn, HarnessError>, State] => {
      const { status } = current;
      if (status._tag === "Unfinished") {
        const { prompt, steps } = status.turn;
        const turn = { prompt, steps, stepParts: [] };
        return [
          Effect.succeed(status.turn),
          { ...current, status: Status.Running({ turn, lettingGo: undefined }) },
        ];
      }
      const reason =
        status._tag === "Closed"
          ? closedReason()
          : status._tag === "Running"
            ? new TurnInProgressError({})
            : new NotFoundError({ description: "The session has no unfinished turn" });
      return [Effect.fail(harnessError("continue", reason)), current];
    }),
  );

  /** Marks the running turn as one `suspend` lets go of, failing when the session runs none. */
  const startSuspending = Effect.flatten(
    Ref.modify(state, (current): [Effect.Effect<void, HarnessError>, State] => {
      const { status } = current;
      if (status._tag === "Running" && status.lettingGo === undefined) {
        return [
          Effect.void,
          { ...current, status: Status.Running({ turn: status.turn, lettingGo: "suspend" }) },
        ];
      }
      const reason =
        status._tag === "Closed"
          ? closedReason()
          : new NotFoundError({ description: "The session is not running a turn" });
      return [Effect.fail(harnessError("suspend", reason)), current];
    }),
  );

  /** Marks the running turn, if the session runs one, as one `stop` or `destroy` aborts. */
  const startAborting = Ref.update(state, (current) =>
    current.status._tag === "Running" && current.status.lettingGo === undefined
      ? { ...current, status: Status.Running({ turn: current.status.turn, lettingGo: "abort" }) }
      : current,
  );

  /**
   * Streams the parts of the running turn that `agentTurn` streams, running the host's tools it
   * calls. A part is delivered only while the session runs the turn, so once `suspend` or `stop`
   * let go of it, the session holds every part the caller has. The stream of a turn `stop` or
   * `destroy` aborted ends with an error, and a stream that ends otherwise without the turn's
   * `finish` ends the turn as far as it got.
   */
  const runTurn = <Tools extends Record<string, Tool.Any>>(
    method: string,
    agentTurn: Stream.Stream<StreamPart, HarnessError>,
    toolkit: Toolkit.WithHandler<Tools> | undefined,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> =>
    agentTurn.pipe(
      Stream.flatMap((part) =>
        part.type === "tool-call" && part.providerExecuted !== true
          ? Stream.concat(Stream.succeed(part), runHostTool(method, toolkit, part))
          : Stream.succeed(part),
      ),
      Stream.takeWhileEffect((part) => Ref.modify(state, (current) => deliver(current, part))),
      Stream.concat(
        Stream.unwrap(
          Effect.map(Ref.get(state), ({ status }) =>
            wasAborted(status) ? Stream.fromIterable(abortedEnding) : Stream.empty,
          ),
        ),
      ),
      Stream.ensuring(
        Ref.update(state, (current) =>
          current.status._tag === "Running" && current.status.lettingGo === undefined
            ? {
                status: Status.Idle(),
                history: withEndedTurn(current.history, current.status.turn),
              }
            : current,
        ),
      ),
    );

  /** Runs the host's tool `call` names, streaming its results and giving the final one to the agent. */
  const runHostTool = <Tools extends Record<string, Tool.Any>>(
    method: string,
    toolkit: Toolkit.WithHandler<Tools> | undefined,
    call: Response.ToolCallPartEncoded,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> => {
    if (toolkit === undefined || !isToolName(toolkit, call.name)) {
      const description = `The agent called ${call.name}, which is not one of the host's tools`;
      return Stream.fail(harnessError(method, new InvalidOutputError({ description })));
    }
    // `handle` decodes the params with the tool's schema and fails on a mismatch, so they need no
    // type of their own here.
    const params = call.params as Tool.ParametersEncoded<Tools[typeof call.name]>;
    return Stream.unwrap(toolkit.handle(call.name, params, call.id)).pipe(
      Stream.mapEffect((handled) => {
        const part = {
          type: "tool-result",
          id: call.id,
          name: call.name,
          result: handled.encodedResult,
          isFailure: handled.isFailure,
          providerExecuted: false,
          preliminary: handled.preliminary,
        } as const;
        return handled.preliminary
          ? Effect.succeed(part)
          : Effect.as(agentSession.submitToolResult(part), part);
      }),
    );
  };

  /** Runs a new turn with the caller's prompt, once the session can start one. */
  const promptTurn = <Tools extends Record<string, Tool.Any>>(
    method: string,
    options: StreamOptions<Tools>,
    responseFormat: Parameters<AgentSession["prompt"]>[0]["responseFormat"],
  ) => {
    const prompt = userMessageOf(options.prompt);
    return Stream.unwrap(
      Effect.as(
        startTurn(method, prompt),
        runTurn(
          method,
          agentSession.prompt({ ...turnOptionsOf(options), prompt, responseFormat }),
          options.toolkit,
        ),
      ),
    );
  };

  /** The whole turn, failing with `TurnFailedError` when the agent reported a failure. */
  const resultOf = (method: string, parts: ReadonlyArray<StreamPart>) => {
    const error = parts.find((part) => part.type === "error");
    return error === undefined
      ? Effect.succeed(new GenerateResult(parts))
      : Effect.fail(harnessError(method, new TurnFailedError({ error: error.error })));
  };

  /** Lets go of the session, returning where it was and its conversation when it did. */
  const close = Ref.getAndUpdate(state, (current) => ({
    ...current,
    status: Status.Closed({ abortedTurn: wasAborted(current.status) }),
  }));

  /** What `suspend`, `detach`, and `stop` return. */
  const savedState = (
    history: Prompt.Prompt,
    agentState: Schema.Json | undefined,
    unfinishedTurn: UnfinishedTurn | undefined,
  ): SessionState => ({
    id: options.id,
    agent: options.agent,
    history,
    agentState,
    unfinishedTurn,
  });

  const session: Session = {
    id: options.id,

    stream: (streamOptions) => promptTurn("stream", streamOptions, { type: "text" }),

    generate: Effect.fn("Session.generate")(function* (generateOptions) {
      const parts = yield* Stream.runCollect(
        promptTurn("generate", generateOptions, { type: "text" }),
      );
      return yield* resultOf("generate", parts);
    }),

    generateObject: Effect.fn("Session.generateObject")(function* (objectOptions) {
      const parts = yield* Stream.runCollect(
        promptTurn("generateObject", objectOptions, {
          type: "json",
          objectName: objectOptions.objectName ?? "output",
          schema: objectOptions.schema,
        }),
      );
      const result = yield* resultOf("generateObject", parts);
      const value = yield* Schema.decodeEffect(Schema.fromJsonString(objectOptions.schema))(
        result.text,
      ).pipe(
        Effect.mapError((cause) =>
          harnessError(
            "generateObject",
            new StructuredOutputError({
              description: cause.message,
              responseText: result.text,
              usage: result.usage,
            }),
            cause,
          ),
        ),
      );
      return new GenerateObjectResult(value, parts);
    }),

    continue: (continueOptions) =>
      Stream.unwrap(
        Effect.map(resumeTurn, (turn) => {
          const turnOptions = {
            ...turnOptionsOf(continueOptions),
            prompt: turn.prompt,
            responseFormat: { type: "text" } as const,
          };
          const agentTurn = agentSession.hasUnfinishedTurn
            ? agentSession.continue(turnOptions, turn.steps.length)
            : agentSession.prompt(turnOptions);
          return runTurn("continue", agentTurn, continueOptions.toolkit);
        }),
      ),

    approve: (response) => Effect.andThen(checkStatus("approve"), agentSession.approve(response)),

    compact: (instructions) =>
      Effect.andThen(checkStatus("compact"), agentSession.compact(instructions)),

    suspend: Effect.gen(function* () {
      yield* startSuspending;
      const agentState = yield* agentSession.suspend;
      const { status, history } = yield* close;
      // A turn that finished while the agent let go of it is in the conversation already.
      const unfinishedTurn =
        status._tag === "Running"
          ? { prompt: status.turn.prompt, steps: status.turn.steps, agentState }
          : undefined;
      return savedState(history, undefined, unfinishedTurn);
    }),

    detach: Effect.gen(function* () {
      yield* checkStatus("detach");
      const agentState = yield* agentSession.detach;
      const { status, history } = yield* close;
      return savedState(
        history,
        agentState,
        status._tag === "Unfinished" ? status.turn : undefined,
      );
    }),

    stop: Effect.gen(function* () {
      yield* checkStatus("stop");
      yield* startAborting;
      const agentState = yield* agentSession.stop;
      const { status, history } = yield* close;
      return savedState(
        status._tag === "Running" ? withEndedTurn(history, status.turn) : history,
        agentState,
        status._tag === "Unfinished" ? status.turn : undefined,
      );
    }),

    destroy: Effect.gen(function* () {
      yield* checkStatus("destroy");
      yield* startAborting;
      yield* agentSession.destroy;
      yield* close;
    }),
  };
  return session;
});

/**
 * Where a session is, and its conversation so far. They change together, so that a turn that
 * finishes leaves the session idle with the turn in its conversation at once.
 */
interface State {
  readonly status: Status;
  readonly history: Prompt.Prompt;
}

/** Where a session is: between turns, holding a turn `suspend` cut short, running a turn, or let go of. */
type Status = Data.TaggedEnum<{
  Idle: {};
  Unfinished: { readonly turn: UnfinishedTurn };
  Running: {
    readonly turn: RunningTurn;

    /**
     * Whether `suspend` is letting go of the turn to continue it later, or `stop` or `destroy` is
     * aborting it. Its stream then ends without its `finish`, and they end the turn themselves.
     */
    readonly lettingGo: "suspend" | "abort" | undefined;
  };
  Closed: {
    /** Whether `stop` or `destroy` aborted a running turn, before its `finish`. */
    readonly abortedTurn: boolean;
  };
}>;

const Status = Data.taggedEnum<Status>();

/** Whether `stop` or `destroy` aborted the turn a session ran, before its `finish`. */
const wasAborted = (status: Status) =>
  (status._tag === "Running" && status.lettingGo === "abort") ||
  (status._tag === "Closed" && status.abortedTurn);

/** How the stream of a turn `stop` or `destroy` aborted ends: as a turn that failed. */
const abortedEnding: ReadonlyArray<StreamPart> = [
  { type: "error", error: { type: "aborted", message: "The session was stopped during the turn" } },
  { type: "finish", reason: "error", usage: { inputTokens: {}, outputTokens: {} } },
];

/** A turn a session is running, as far as its stream has delivered it. */
interface RunningTurn {
  readonly prompt: Prompt.UserMessage;

  /** The steps the turn finished, each as the messages that record it, with those before `suspend`. */
  readonly steps: ReadonlyArray<Prompt.Prompt>;

  /** The parts delivered of the step the turn is taking. */
  readonly stepParts: ReadonlyArray<StreamPart>;
}

/**
 * Whether a session in `state` delivers `part` of its running turn, and the session after it does.
 * A session that no longer runs the turn delivers nothing more. A `finish-step` adds the step it
 * ends to the turn's steps, and the turn's `finish` adds the turn to the conversation.
 */
const deliver = (state: State, part: StreamPart): [boolean, State] => {
  if (state.status._tag !== "Running") return [false, state];
  const { turn } = state.status;
  if (part.type === "finish") {
    return [
      true,
      { status: Status.Idle(), history: Prompt.concat(state.history, conversationOf(turn)) },
    ];
  }
  const { lettingGo } = state.status;
  if (part.type === "finish-step") {
    const step = Prompt.fromMessages(messagesOfStep(turn.stepParts));
    const next = { ...turn, steps: [...turn.steps, step], stepParts: [] };
    return [true, { ...state, status: Status.Running({ turn: next, lettingGo }) }];
  }
  const next = { ...turn, stepParts: [...turn.stepParts, part] };
  return [true, { ...state, status: Status.Running({ turn: next, lettingGo }) }];
};

type Operation = "stream" | "approve" | "compact" | "detach" | "stop" | "destroy";

/** Why `operation` cannot run in a session in `status`, or nothing when it can. */
const refusal = (status: Status, operation: Operation): HarnessErrorReason | undefined => {
  if (status._tag === "Closed") return closedReason();
  switch (operation) {
    case "stream":
      if (status._tag === "Unfinished") {
        return new TurnInProgressError({
          description: "The session has an unfinished turn, which `continue` finishes",
        });
      }
      return status._tag === "Running" ? new TurnInProgressError({}) : undefined;
    case "detach":
      return status._tag === "Running"
        ? new TurnInProgressError({
            description: "A running turn must be suspended before the session detaches",
          })
        : undefined;
    case "approve":
    case "compact":
    case "stop":
    case "destroy":
      return undefined;
  }
};

const closedReason = () =>
  new NotFoundError({ description: "The session was suspended, detached, stopped, or destroyed" });

const userMessageOf = (prompt: string | Prompt.UserMessage): Prompt.UserMessage =>
  typeof prompt === "string"
    ? Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: prompt })] })
    : prompt;

/** The agent's settings for a turn, with the host's tools as the toolkit declares them. */
const turnOptionsOf = <Tools extends Record<string, Tool.Any>>(
  options: ContinueOptions<Tools>,
) => ({
  instructions: options.instructions,
  model: options.model,
  tools: options.toolkit === undefined ? [] : Object.values<Tool.Any>(options.toolkit.tools),
});

/**
 * The conversation with a turn that ended without its `finish`, other than by `suspend`, as far as
 * the session delivered it. A turn that delivered nothing, such as one the agent refused, is left out.
 */
const withEndedTurn = (history: Prompt.Prompt, turn: RunningTurn) =>
  turn.steps.length === 0 && turn.stepParts.length === 0
    ? history
    : Prompt.concat(history, conversationOf(turn));

/** A turn as the conversation records it: its prompt, then each step it took. */
const conversationOf = (turn: RunningTurn) =>
  Prompt.fromMessages([
    turn.prompt,
    ...turn.steps.flatMap((step) => step.content),
    ...messagesOfStep(turn.stepParts),
  ]);

// TODO: Record what the model reasoned, and the files it wrote, once a model can read them back
// from another: providers read back only the reasoning they produced.
/**
 * The messages that record one step of a turn: an assistant message with what the model wrote and
 * the tools it called, followed by a tool message with the results, and none for a step that wrote
 * nothing and called none. In a prompt, a `providerExecuted` call is one the model's provider ran,
 * so every call is recorded as one the model made, whoever ran the tool, which any model reads.
 *
 * A step its turn ended partway through keeps what it wrote so far, and each call it left without a
 * result is answered as interrupted, as Effect AI answers the calls of a response cut short, since
 * models refuse a conversation with a call no result answers.
 */
const messagesOfStep = (step: ReadonlyArray<StreamPart>): ReadonlyArray<Prompt.Message> => {
  const said: Array<Prompt.TextPart | Prompt.ToolCallPart> = [];
  const results: Array<Prompt.ToolResultPart> = [];
  /** The text of each text the step is writing, by its id, until it ends. */
  const writing = new Map<string, string>();
  for (const part of step) {
    switch (part.type) {
      case "text-delta":
        writing.set(part.id, (writing.get(part.id) ?? "") + part.delta);
        break;
      case "text-end": {
        const text = writing.get(part.id) ?? "";
        writing.delete(part.id);
        if (text !== "") said.push(Prompt.makePart("text", { text }));
        break;
      }
      case "tool-call":
        said.push(
          Prompt.makePart("tool-call", {
            id: part.id,
            name: part.name,
            params: part.params,
            providerExecuted: false,
          }),
        );
        break;
      case "tool-result":
        if (part.preliminary !== true) {
          results.push(
            Prompt.makePart("tool-result", {
              id: part.id,
              name: part.name,
              isFailure: part.isFailure,
              result: part.result,
              providerExecuted: false,
            }),
          );
        }
        break;
    }
  }
  for (const text of writing.values()) {
    if (text !== "") said.push(Prompt.makePart("text", { text }));
  }
  const answered = new Set(results.map((result) => result.id));
  for (const part of said) {
    if (part.type === "tool-call" && !answered.has(part.id)) {
      results.push(interruptedResultOf(part));
    }
  }
  return [
    ...(said.length === 0 ? [] : [Prompt.makeMessage("assistant", { content: said })]),
    ...(results.length === 0 ? [] : [Prompt.makeMessage("tool", { content: results })]),
  ];
};

/** The result of a call its turn ended before answering, as Effect AI writes one. */
const interruptedResultOf = (call: Prompt.ToolCallPart) =>
  Prompt.makePart("tool-result", {
    id: call.id,
    name: call.name,
    isFailure: true,
    result: { type: "execution-interrupted", reason: "The turn ended before the tool finished" },
    providerExecuted: false,
  });

const isToolName = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  name: string,
): name is Extract<keyof Tools, string> => Object.hasOwn(toolkit.tools, name);
