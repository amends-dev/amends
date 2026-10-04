/**
 * A session is one conversation with an agent, run a turn at a time. It is what callers hold:
 * `Harness.startSession` starts one over an agent session, and the session adds the host's tools,
 * whole-turn results, and the record of the conversation that `SessionState` keeps.
 *
 * `SessionState` is what `suspend`, `detach`, and `stop` return for the caller to store. It records
 * the conversation as Effect AI `Prompt` messages, so that `Harness.startSession` can pick the
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
import { type StreamPart, stepsOf } from "./StreamPart.ts";

/** A turn that `suspend` cut short, kept so that the session can finish it later. */
export const UnfinishedTurn = Schema.Struct({
  prompt: Prompt.UserMessage,

  /** What the agent's `suspend` returned. Without it, the next agent runs the turn again from `prompt`. */
  agentState: Schema.optional(Schema.Json),
});

export interface UnfinishedTurn extends Schema.Schema.Type<typeof UnfinishedTurn> {}

export const SessionState = Schema.Struct({
  id: SessionId,

  /** The agent that last ran the session, whose `agentState` only it can read. */
  agent: Schema.String,

  /** The conversation so far: each finished turn's prompt, the tools its steps called, and its answer. */
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
   * Runs a turn, streaming its parts until `finish`. Interrupting the stream aborts the turn. A
   * failure the agent reports arrives as an `error` part, and the turn finishes with `error`.
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

  /** Streams the unfinished turn the session was started with, like `stream`. */
  readonly continue: <Tools extends Record<string, Tool.Any> = {}>(
    options: ContinueOptions<Tools>,
  ) => Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>>;

  /** Answers a `tool-approval-request` from the agent. */
  readonly approve: AgentSession["approve"];

  /** Asks the agent to replace its conversation so far with a summary, which arrives as a `compaction` part. */
  readonly compact: AgentSession["compact"];

  /**
   * Ends the running turn's stream while the agent keeps working, and returns the session with the
   * turn unfinished, for `continue` to finish after `Harness.startSession`.
   */
  readonly suspend: Effect.Effect<SessionState, HarnessError>;

  /** Lets go of the session between turns while the agent keeps running. */
  readonly detach: Effect.Effect<SessionState, HarnessError>;

  /** Stops the agent, aborting a running turn, and returns the session to start again later. */
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
  const history = yield* Ref.make(options.history);
  const status = yield* Ref.make<Status>(
    options.unfinishedTurn === undefined
      ? Status.Idle()
      : Status.Unfinished({ turn: options.unfinishedTurn }),
  );

  const harnessError = (method: string, reason: HarnessErrorReason, cause?: unknown) =>
    new HarnessError({ harness: options.agent, method, reason, cause });

  /** Fails when `operation` cannot run in the session's current status. */
  const checkStatus = (operation: Operation) =>
    Effect.flatMap(Ref.get(status), (current) => {
      const reason = refusal(current, operation);
      return reason === undefined
        ? Effect.succeed(current)
        : Effect.fail(harnessError(operation, reason));
    });

  /** Marks the session as running a new turn, failing when it cannot start one now. */
  const startTurn = (method: string, prompt: Prompt.UserMessage) =>
    Effect.flatten(
      Ref.modify(status, (current): [Effect.Effect<void, HarnessError>, Status] => {
        const reason = refusal(current, "stream");
        return reason === undefined
          ? [Effect.void, Status.Running({ prompt })]
          : [Effect.fail(harnessError(method, reason)), current];
      }),
    );

  /** Marks the session as running its unfinished turn and returns the turn, failing when it has none. */
  const resumeTurn = Effect.flatten(
    Ref.modify(status, (current): [Effect.Effect<UnfinishedTurn, HarnessError>, Status] => {
      if (current._tag === "Unfinished") {
        return [Effect.succeed(current.turn), Status.Running({ prompt: current.turn.prompt })];
      }
      const reason =
        current._tag === "Closed"
          ? closedReason()
          : current._tag === "Running"
            ? new TurnInProgressError({})
            : new NotFoundError({ description: "The session has no unfinished turn" });
      return [Effect.fail(harnessError("continue", reason)), current];
    }),
  );

  /**
   * Streams a turn the agent runs, running the host's tools it calls, and records the turn in the
   * conversation once it finishes.
   */
  const runTurn = <Tools extends Record<string, Tool.Any>>(
    method: string,
    prompt: Prompt.UserMessage,
    agentTurn: Stream.Stream<StreamPart, HarnessError>,
    toolkit: Toolkit.WithHandler<Tools> | undefined,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> =>
    Stream.suspend(() => {
      const parts: Array<StreamPart> = [];
      return agentTurn.pipe(
        Stream.flatMap((part) =>
          part.type === "tool-call" && part.providerExecuted !== true
            ? Stream.concat(Stream.succeed(part), runHostTool(method, toolkit, part))
            : Stream.succeed(part),
        ),
        Stream.tap((part) => Effect.sync(() => parts.push(part))),
        Stream.ensuring(
          Effect.gen(function* () {
            yield* Ref.update(status, (current) =>
              current._tag === "Running" ? Status.Idle() : current,
            );
            if (parts.some((part) => part.type === "finish")) {
              yield* Ref.update(history, Prompt.concat(conversationOf(prompt, parts)));
            }
          }),
        ),
      );
    });

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
          prompt,
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

  /** What `suspend`, `detach`, and `stop` return, given the agent's state and the unfinished turn. */
  const stateOf = (
    agentState: Schema.Json | undefined,
    unfinishedTurn: UnfinishedTurn | undefined,
  ) =>
    Effect.map(Ref.get(history), (conversation): SessionState => ({
      id: options.id,
      agent: options.agent,
      history: conversation,
      agentState,
      unfinishedTurn,
    }));

  const close = Ref.set(status, Status.Closed());

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
          // Only the agent that cut the turn short can continue it; any other runs it again.
          const agentTurn =
            turn.agentState === undefined
              ? agentSession.prompt(turnOptions)
              : agentSession.continue(turnOptions);
          return runTurn("continue", turn.prompt, agentTurn, continueOptions.toolkit);
        }),
      ),

    approve: (response) => Effect.andThen(checkStatus("approve"), agentSession.approve(response)),

    compact: (instructions) =>
      Effect.andThen(checkStatus("compact"), agentSession.compact(instructions)),

    suspend: Effect.gen(function* () {
      const current = yield* checkStatus("suspend");
      const agentState = yield* agentSession.suspend;
      yield* close;
      // `checkStatus` lets `suspend` run only while a turn is running.
      const unfinishedTurn =
        current._tag === "Running" ? { prompt: current.prompt, agentState } : undefined;
      return yield* stateOf(undefined, unfinishedTurn);
    }),

    detach: Effect.gen(function* () {
      const current = yield* checkStatus("detach");
      const agentState = yield* agentSession.detach;
      yield* close;
      return yield* stateOf(agentState, current._tag === "Unfinished" ? current.turn : undefined);
    }),

    stop: Effect.gen(function* () {
      const current = yield* checkStatus("stop");
      const agentState = yield* agentSession.stop;
      yield* close;
      return yield* stateOf(agentState, current._tag === "Unfinished" ? current.turn : undefined);
    }),

    destroy: Effect.gen(function* () {
      yield* checkStatus("destroy");
      yield* agentSession.destroy;
      yield* close;
    }),
  };
  return session;
});

/** Where a session is: between turns, holding a turn `suspend` cut short, running a turn, or let go of. */
type Status = Data.TaggedEnum<{
  Idle: {};
  Unfinished: { readonly turn: UnfinishedTurn };
  Running: { readonly prompt: Prompt.UserMessage };
  Closed: {};
}>;

const Status = Data.taggedEnum<Status>();

type Operation = "stream" | "approve" | "compact" | "suspend" | "detach" | "stop" | "destroy";

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
    case "suspend":
      return status._tag === "Running"
        ? undefined
        : new NotFoundError({ description: "The session is not running a turn" });
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

// TODO: Record what the model reasoned, and the files it wrote, once a model can read them back
// from another: providers read back only the reasoning they produced.
/**
 * A finished turn as the conversation records it: its prompt, then each step the model took, as an
 * assistant message with what it wrote and the tools it called, followed by a tool message with the
 * results. In a prompt, a `providerExecuted` call is one the model's provider ran, so every call is
 * recorded as one the model made, whoever ran the tool, which any model reads.
 */
const conversationOf = (prompt: Prompt.UserMessage, parts: ReadonlyArray<StreamPart>) =>
  Prompt.fromMessages([prompt, ...stepsOf(parts).flatMap(messagesOfStep)]);

/** The messages that record one step of a turn: none for a step that wrote nothing and called none. */
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
  return [
    ...(said.length === 0 ? [] : [Prompt.makeMessage("assistant", { content: said })]),
    ...(results.length === 0 ? [] : [Prompt.makeMessage("tool", { content: results })]),
  ];
};

const isToolName = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  name: string,
): name is Extract<keyof Tools, string> => Object.hasOwn(toolkit.tools, name);
