/**
 * How a `Session` runs a conversation: its state, which every operation changes in one step, the
 * delivery of each turn's parts, the host's tools, and the record of the conversation. `Harness`
 * makes sessions with `makeSession`; the package does not export this module.
 */
import {
  type Cause,
  Data,
  Deferred,
  Effect,
  HashMap,
  Option,
  Queue,
  Ref,
  Schema,
  type Scope,
  Stream,
} from "effect";
import type { Response, Toolkit } from "effect/ai";
import { Prompt, type Tool } from "effect/ai";
import type { AgentSession, SessionId } from "../Agent.ts";
import { GenerateObjectResult, GenerateResult } from "../GenerateResult.ts";
import {
  HarnessError,
  type HarnessErrorReason,
  InvalidOutputError,
  NoTurnError,
  SessionClosedError,
  StructuredOutputError,
  TurnFailedError,
  TurnInProgressError,
} from "../HarnessError.ts";
import {
  type ContinueOptions,
  messagesOfStep,
  type Session,
  type SessionState,
  type StreamOptions,
  type TurnError,
  type TurnServices,
  type UnfinishedTurn,
} from "../Session.ts";
import { type StreamPart, stepsOf } from "../StreamPart.ts";

/** Makes the session `Harness.createSession` hands out, over an agent session it started. */
export const makeSession = Effect.fn("Session.make")(function* (options: {
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
    lettingGo: undefined,
  });

  /**
   * The calls of the host's tools that wait for `approve`, each with the answer its request
   * awaits, by the request's id. They are not in `state`, which holds what saving the session
   * records: a request lives only as long as the stream that made it.
   */
  const pendingApprovals = yield* Ref.make(
    HashMap.empty<string, Deferred.Deferred<ApprovalResponse>>(),
  );

  const harnessError = (reason: HarnessErrorReason, cause?: unknown) =>
    new HarnessError({ agent: options.agent, reason, cause });

  /** Fails when `operation` cannot run in the session now. */
  const checkStatus = (operation: Operation) =>
    Effect.flatMap(Ref.get(state), (current) => {
      const reason = refusal(current, operation);
      return reason === undefined ? Effect.void : Effect.fail(harnessError(reason));
    });

  /** Marks the session as running a new turn of `prompt`, failing when it cannot start one now. */
  const startTurn = (prompt: Prompt.UserMessage) =>
    Effect.flatten(
      Ref.modify(state, (current): [Effect.Effect<void, HarnessError>, State] => {
        const reason = refusal(current, "stream");
        if (reason !== undefined) return [Effect.fail(harnessError(reason)), current];
        const turn = { prompt, steps: [], stepParts: [] };
        return [Effect.void, { ...current, status: Status.Running({ turn }) }];
      }),
    );

  /** Marks the session as running its unfinished turn and returns the turn, failing when it has none. */
  const resumeTurn = Effect.flatten(
    Ref.modify(state, (current): [Effect.Effect<UnfinishedTurn, HarnessError>, State] => {
      const { status } = current;
      const reason = refusal(current, "continueStream");
      // `refusal` lets the session continue only an unfinished turn.
      if (reason !== undefined || status._tag !== "Unfinished") {
        return [Effect.fail(harnessError(reason ?? new NoTurnError({}))), current];
      }
      const turn = { prompt: status.turn.prompt, steps: status.turn.steps, stepParts: [] };
      return [Effect.succeed(status.turn), { ...current, status: Status.Running({ turn }) }];
    }),
  );

  /**
   * Lets go of the session with `operation`: takes hold of it, so that no turn starts and no other
   * operation lets go of it meanwhile, asks the agent with `agentCall`, and closes the session.
   * Returns what the agent answered and the session as it was when it closed. When `agentCall`
   * fails, the session releases its hold and stays open.
   */
  const letGo = Effect.fnUntraced(function* <A>(
    operation: LetGo,
    agentCall: Effect.Effect<A, HarnessError>,
  ): Effect.fn.Return<readonly [A, State], HarnessError> {
    yield* Effect.flatten(
      Ref.modify(state, (current): [Effect.Effect<void, HarnessError>, State] => {
        const reason = refusal(current, operation);
        if (reason !== undefined) return [Effect.fail(harnessError(reason)), current];
        // `destroy` also runs once the session is let go of, or while it is.
        const holds = current.status._tag !== "Closed" && current.lettingGo === undefined;
        return [Effect.void, holds ? { ...current, lettingGo: operation } : current];
      }),
    );
    const answer = yield* Effect.onError(agentCall, () =>
      Ref.update(state, (current) =>
        current.lettingGo === operation ? { ...current, lettingGo: undefined } : current,
      ),
    );
    const closed = yield* close;
    return [answer, closed] as const;
  });

  /**
   * Streams the parts of the running turn that `agentTurn` streams, with the results of the host's
   * tools it calls. A part is delivered only while the session runs the turn, so once `suspendTurn`
   * or `stop` let go of it, the session holds every part the caller has. The stream of a turn
   * `stop` or `destroy` aborted ends with an error, and a stream that ends otherwise without the
   * turn's `finish` ends the turn as far as it got.
   */
  const runTurn = <Tools extends Record<string, Tool.Any>>(
    agentTurn: Stream.Stream<StreamPart, HarnessError>,
    toolkit: Toolkit.WithHandler<Tools> | undefined,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> =>
    withHostTools(agentTurn, toolkit).pipe(
      Stream.takeWhileEffect((part) => Ref.modify(state, (current) => deliver(current, part))),
      Stream.concat(
        Stream.unwrap(
          Effect.map(Ref.get(state), (current) =>
            wasAborted(current) ? Stream.fromIterable(abortedEnding) : Stream.empty,
          ),
        ),
      ),
      Stream.ensuring(
        Ref.update(state, (current) =>
          current.status._tag === "Running" && current.lettingGo === undefined
            ? {
                ...current,
                status: Status.Idle(),
                history: withEndedTurn(current.history, current.status.turn),
              }
            : current,
        ),
      ),
    );

  /**
   * The agent's parts, each call of the host's tools followed by the tool's results, or by the
   * request to approve it first. A host's tool starts as soon as the agent calls it, so the tools
   * of calls the agent makes together run side by side, while their results, and the requests
   * to approve them, stream in the order of the calls.
   */
  const withHostTools = <Tools extends Record<string, Tool.Any>>(
    agentTurn: Stream.Stream<StreamPart, HarnessError>,
    toolkit: Toolkit.WithHandler<Tools> | undefined,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> =>
    Stream.unwrap(
      Effect.map(Effect.scope, (scope) =>
        agentTurn.pipe(
          Stream.mapEffect((part) =>
            part.type === "tool-call" && part.providerExecuted !== true
              ? Effect.map(startHostTool(toolkit, part, scope), (results) =>
                  Stream.concat(Stream.succeed(part), results),
                )
              : Effect.succeed(Stream.succeed(part)),
          ),
          // Reads the agent's parts ahead, so that a tool it calls next starts while the results
          // of an earlier one still stream.
          Stream.buffer({ capacity: "unbounded" }),
          Stream.flatten(),
        ),
      ),
    );

  /** Starts the host's tool `call` names in `scope`, returning the stream of its results. */
  const startHostTool = Effect.fnUntraced(function* <Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.WithHandler<Tools> | undefined,
    call: Response.ToolCallPartEncoded,
    scope: Scope.Scope,
  ): Effect.fn.Return<Stream.Stream<StreamPart, TurnError<Tools>>, never, TurnServices<Tools>> {
    const results = yield* Queue.unbounded<StreamPart, TurnError<Tools> | Cause.Done>();
    yield* runHostTool(toolkit, call).pipe(Stream.runIntoQueue(results), Effect.forkIn(scope));
    return Stream.fromQueue(results);
  });

  /**
   * Runs the host's tool `call` names, streaming its results and giving the final one to the agent.
   * A tool that needs approval first runs only once `approve` allows it, and is answered as denied
   * when `approve` refuses it.
   */
  const runHostTool = <Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.WithHandler<Tools> | undefined,
    call: Response.ToolCallPartEncoded,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> => {
    const found = toolkit === undefined ? undefined : findTool(toolkit, call.name);
    if (toolkit === undefined || found === undefined) {
      const description = `The agent called ${call.name}, which is not one of the host's tools`;
      return Stream.fail(harnessError(new InvalidOutputError({ description })));
    }
    const { name, tool } = found;
    // `handle` decodes the params with the tool's schema and fails on a mismatch, so they need no
    // type of their own here.
    const params = call.params as Tool.ParametersEncoded<Tools[typeof name]>;
    const callTool: Stream.Stream<
      StreamPart,
      TurnError<Tools>,
      TurnServices<Tools>
    > = Stream.unwrap(toolkit.handle(name, params, call.id)).pipe(
      Stream.mapEffect((handled) => {
        const part = {
          type: "tool-result",
          id: call.id,
          name,
          result: handled.encodedResult,
          isFailure: handled.isFailure,
          providerExecuted: false,
          preliminary: handled.preliminary,
        } as const;
        return handled.preliminary ? Effect.succeed(part) : submitResult(part);
      }),
    );
    const conversation = Effect.map(Ref.get(state), recordedConversation);
    return Stream.unwrap(
      Effect.map(needsApproval(tool, call, conversation), (needed) =>
        needed ? askThenRun(call, callTool) : callTool,
      ),
    );
  };

  // TODO: Ask about the calls an agent makes together all at once, so that a caller can answer a
  // later call's request before an earlier one's: requests now stream in the order of the calls, as
  // their results do.
  /**
   * Streams a `tool-approval-request` for the host's tool `call`, and then `ifApproved`, or the call
   * answered as denied once `approve` refuses it. The request waits in `pendingApprovals` until the
   * stream ends, whether `approve` answered it or the turn was let go of.
   */
  const askThenRun = <E, R>(
    call: Response.ToolCallPartEncoded,
    ifApproved: Stream.Stream<StreamPart, E, R>,
  ): Stream.Stream<StreamPart, E | HarnessError, R> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const approvalId = approvalIdOf(call);
        const answer = yield* Effect.acquireRelease(
          Effect.tap(Deferred.make<ApprovalResponse>(), (deferred) =>
            Ref.update(pendingApprovals, HashMap.set(approvalId, deferred)),
          ),
          () => Ref.update(pendingApprovals, HashMap.remove(approvalId)),
        );
        const request: StreamPart = {
          type: "tool-approval-request",
          approvalId,
          toolCallId: call.id,
        };
        const decided = Stream.unwrap(
          Effect.map(
            Deferred.await(answer),
            (response): Stream.Stream<StreamPart, E | HarnessError, R> =>
              response.approved ? ifApproved : denyHostTool(call, response.reason),
          ),
        );
        return Stream.concat(Stream.make(request), decided);
      }),
    );

  /**
   * Answers the host's tool `call` as denied, without running the tool. The agent gets the denial
   * as the tool's result.
   */
  const denyHostTool = (
    call: Response.ToolCallPartEncoded,
    reason: string | undefined,
  ): Stream.Stream<StreamPart, HarnessError> => {
    const part = {
      type: "tool-result",
      id: call.id,
      name: call.name,
      result: { type: "execution-denied", reason: reason ?? "The tool call was denied" },
      isFailure: true,
      providerExecuted: false,
    } as const;
    return Stream.fromEffect(submitResult(part));
  };

  /** Gives the agent `part`, the result of one of the host's tools, and returns it to stream. */
  const submitResult = <Part extends Parameters<AgentSession["submitToolResult"]>[0]>(part: Part) =>
    Effect.as(agentSession.submitToolResult(part), part);

  /** Runs a new turn with the caller's prompt, once the session can start one. */
  const promptTurn = <Tools extends Record<string, Tool.Any>>(
    options: StreamOptions<Tools>,
    responseFormat: Parameters<AgentSession["promptTurn"]>[0]["responseFormat"],
  ) => {
    const prompt = userMessageOf(options.prompt);
    return Stream.unwrap(
      Effect.as(
        startTurn(prompt),
        runTurn(
          agentSession.promptTurn({ ...turnOptionsOf(options), prompt, responseFormat }),
          options.toolkit,
        ),
      ),
    );
  };

  /** The whole turn, failing with `TurnFailedError` when the agent reported a failure. */
  const resultOf = (parts: ReadonlyArray<StreamPart>) => {
    const error = parts.find((part) => part.type === "error");
    return error === undefined
      ? Effect.succeed(new GenerateResult(parts))
      : Effect.fail(harnessError(new TurnFailedError({ error: error.error })));
  };

  /** Closes the session, returning it as it was when it closed. */
  const close = Ref.getAndUpdate(state, (current) => ({
    ...current,
    status: Status.Closed({ abortedTurn: wasAborted(current) }),
    lettingGo: undefined,
  }));

  /** What `suspendTurn`, `detach`, and `stop` return. */
  const savedState = (
    history: Prompt.Prompt,
    agentState: Schema.Json | undefined,
    unfinishedTurn: UnfinishedTurn | undefined,
  ): SessionState => ({
    id: options.id,
    agent: options.agent,
    history,
    ...(agentState === undefined ? {} : { agentState }),
    unfinishedTurn,
  });

  /**
   * Answers an approval request: one the session made for the host's tool, which it answers once,
   * or else one of the agent's own, which it passes on.
   */
  const approve = Effect.fn("Session.approve")(function* (response: ApprovalResponse) {
    yield* checkStatus("approve");
    const asked = yield* Ref.modify(pendingApprovals, (current) => [
      HashMap.get(current, response.approvalId),
      HashMap.remove(current, response.approvalId),
    ]);
    if (Option.isNone(asked)) return yield* agentSession.approve(response);
    yield* Deferred.succeed(asked.value, response);
  });

  /**
   * Collects a turn that is returned whole. Nothing can answer its approval requests before it
   * ends, so it denies each, and its tools that need approval do not run.
   */
  const collectDenyingApprovals = <E, R>(turn: Stream.Stream<StreamPart, E, R>) =>
    Stream.runCollect(
      Stream.tap(turn, (part) =>
        part.type === "tool-approval-request"
          ? approve({
              approvalId: part.approvalId,
              approved: false,
              reason: "The turn returns whole, so it cannot ask for approval",
            })
          : Effect.void,
      ),
    );

  const session: Session = {
    id: options.id,

    stream: (streamOptions) => promptTurn(streamOptions, { type: "text" }),

    generate: Effect.fn("Session.generate")(function* (generateOptions) {
      const parts = yield* collectDenyingApprovals(promptTurn(generateOptions, { type: "text" }));
      return yield* resultOf(parts);
    }),

    generateObject: Effect.fn("Session.generateObject")(function* (objectOptions) {
      const parts = yield* collectDenyingApprovals(
        promptTurn(objectOptions, {
          type: "json",
          objectName: objectOptions.objectName ?? "output",
          schema: objectOptions.schema,
        }),
      );
      const result = yield* resultOf(parts);
      const value = yield* Schema.decodeEffect(Schema.fromJsonString(objectOptions.schema))(
        result.text,
      ).pipe(
        Effect.mapError((cause) =>
          harnessError(
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

    continueStream: (continueOptions) =>
      Stream.unwrap(
        Effect.map(resumeTurn, (turn) => {
          const turnOptions = {
            ...turnOptionsOf(continueOptions),
            prompt: turn.prompt,
            responseFormat: { type: "text" } as const,
          };
          const agentTurn = agentSession.hasUnfinishedTurn
            ? agentSession.continueTurn(turnOptions, turn.steps.length)
            : agentSession.promptTurn(turnOptions);
          return runTurn(agentTurn, continueOptions.toolkit);
        }),
      ),

    approve,

    compact: (instructions) =>
      Effect.andThen(checkStatus("compact"), agentSession.compact(instructions)),

    suspendTurn: Effect.gen(function* () {
      const [agentState, { status, history }] = yield* letGo(
        "suspendTurn",
        agentSession.suspendTurn,
      );
      // A turn that finished while the agent let go of it is in the conversation already.
      const unfinishedTurn =
        status._tag === "Running"
          ? { prompt: status.turn.prompt, steps: status.turn.steps, agentState }
          : undefined;
      return savedState(history, undefined, unfinishedTurn);
    }),

    detach: Effect.gen(function* () {
      const [agentState, { status, history }] = yield* letGo("detach", agentSession.detach);
      return savedState(
        history,
        agentState,
        status._tag === "Unfinished" ? status.turn : undefined,
      );
    }),

    stop: Effect.gen(function* () {
      const [agentState, { status, history }] = yield* letGo("stop", agentSession.stop);
      return savedState(
        status._tag === "Running" ? withEndedTurn(history, status.turn) : history,
        agentState,
        status._tag === "Unfinished" ? status.turn : undefined,
      );
    }),

    destroy: Effect.asVoid(letGo("destroy", agentSession.destroy)),
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

  /**
   * The operation letting go of the session, from when it takes hold until it closes the session.
   * A running turn's stream then ends without its `finish`, and the operation ends the turn itself.
   */
  readonly lettingGo: LetGo | undefined;
}

/**
 * Where a session is: between turns, holding a turn `suspendTurn` cut short, running a turn, or let
 * go of.
 */
type Status = Data.TaggedEnum<{
  Idle: {};
  Unfinished: { readonly turn: UnfinishedTurn };
  Running: { readonly turn: RunningTurn };
  Closed: {
    /** Whether `stop` or `destroy` aborted a running turn, before its `finish`. */
    readonly abortedTurn: boolean;
  };
}>;

const Status = Data.taggedEnum<Status>();

/** Whether `stop` or `destroy` aborted the turn a session ran, before its `finish`. */
const wasAborted = ({ status, lettingGo }: State) =>
  (status._tag === "Running" && (lettingGo === "stop" || lettingGo === "destroy")) ||
  (status._tag === "Closed" && status.abortedTurn);

/** How the stream of a turn `stop` or `destroy` aborted ends: as a turn that failed. */
const abortedEnding: ReadonlyArray<StreamPart> = [
  { type: "error", error: { type: "aborted", message: "The session was stopped during the turn" } },
  { type: "finish", reason: "error", usage: { inputTokens: {}, outputTokens: {} } },
];

/** A turn a session is running, as far as its stream has delivered it. */
interface RunningTurn {
  readonly prompt: Prompt.UserMessage;

  /**
   * The steps the turn finished, each as the messages that record it, with those before
   * `suspendTurn`.
   */
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
    const history = Prompt.concat(state.history, conversationOf(turn));
    return [true, { ...state, status: Status.Idle(), history }];
  }
  if (part.type === "finish-step") {
    const step = Prompt.fromMessages(messagesOfParts(turn.stepParts));
    const next = { ...turn, steps: [...turn.steps, step], stepParts: [] };
    return [true, { ...state, status: Status.Running({ turn: next }) }];
  }
  const next = { ...turn, stepParts: [...turn.stepParts, part] };
  return [true, { ...state, status: Status.Running({ turn: next }) }];
};

/** The operations that let go of a session. */
type LetGo = "suspendTurn" | "detach" | "stop" | "destroy";

type Operation = "stream" | "continueStream" | "approve" | "compact" | LetGo;

/** Why `operation` cannot run in a session in `state`, or nothing when it can. */
const refusal = (
  { status, lettingGo }: State,
  operation: Operation,
): HarnessErrorReason | undefined => {
  // A session can be destroyed at any time, also once let go of, or while it is.
  if (operation === "destroy") return undefined;
  if (status._tag === "Closed") return new SessionClosedError({});
  if (lettingGo !== undefined) {
    return new SessionClosedError({
      description: `The session is being let go of by ${lettingGo}`,
    });
  }
  switch (operation) {
    case "stream":
      if (status._tag === "Unfinished") {
        return new TurnInProgressError({
          description: "The session has an unfinished turn, which `continueStream` finishes",
        });
      }
      return status._tag === "Running" ? new TurnInProgressError({}) : undefined;
    case "continueStream":
      if (status._tag === "Running") return new TurnInProgressError({});
      return status._tag === "Unfinished"
        ? undefined
        : new NoTurnError({ description: "The session has no unfinished turn" });
    case "suspendTurn":
      return status._tag === "Running"
        ? undefined
        : new NoTurnError({ description: "The session is not running a turn" });
    case "detach":
      return status._tag === "Running"
        ? new TurnInProgressError({
            description: "A running turn must be suspended before the session detaches",
          })
        : undefined;
    case "approve":
    case "compact":
    case "stop":
      return undefined;
  }
};

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
 * The conversation with a turn that ended without its `finish`, other than by `suspendTurn`, as far
 * as the session delivered it. A turn that delivered nothing, such as one the agent refused, is
 * left out.
 */
const withEndedTurn = (history: Prompt.Prompt, turn: RunningTurn) =>
  turn.steps.length === 0 && turn.stepParts.length === 0
    ? history
    : Prompt.concat(history, conversationOf(turn));

/** A turn as the conversation records it: its prompt, then each step it took. */
const conversationOf = (turn: RunningTurn) =>
  Prompt.concat(
    conversationOfFinishedSteps(turn),
    Prompt.fromMessages(messagesOfParts(turn.stepParts)),
  );

/** A turn's prompt and the steps it finished, as the conversation records them. */
const conversationOfFinishedSteps = (turn: RunningTurn) =>
  Prompt.fromMessages([turn.prompt, ...turn.steps.flatMap((step) => step.content)]);

// TODO: Give `needsApproval` the parts of the step its call is in, and of the steps the caller has
// not read yet, by deciding at the call's delivery rather than when the session reads the call.
/**
 * The conversation as the session has recorded it: the turns before, and the running turn's prompt
 * and finished steps. The session reads the agent's parts ahead of the caller, so a step the caller
 * has not read to its end yet may be missing.
 */
const recordedConversation = ({ status, history }: State): ReadonlyArray<Prompt.Message> =>
  (status._tag === "Running"
    ? Prompt.concat(history, conversationOfFinishedSteps(status.turn))
    : history
  ).content;

/** The messages that record the parts a step delivered, as far as they go. */
const messagesOfParts = (parts: ReadonlyArray<StreamPart>): ReadonlyArray<Prompt.Message> =>
  stepsOf(parts).flatMap(messagesOfStep);

/** What `approve` answers a request with. */
type ApprovalResponse = Parameters<AgentSession["approve"]>[0];

/** Names the request to approve the host's tool `call` after the call: unique, and no counter. */
const approvalIdOf = (call: Response.ToolCallPartEncoded) => `approval-${call.id}`;

/**
 * Whether the host's `tool` needs approval before running `call`, as Effect AI decides it for a
 * language model: a boolean, or a function of the call's decoded params and the conversation, which
 * is read only for a function. Params that do not decode need none, since the tool's handler
 * rejects them without running.
 */
const needsApproval = Effect.fnUntraced(
  function* <T extends Tool.Any>(
    tool: T,
    call: Response.ToolCallPartEncoded,
    conversation: Effect.Effect<ReadonlyArray<Prompt.Message>>,
  ): Effect.fn.Return<boolean, Schema.SchemaError, Tool.HandlerServices<T>> {
    const { needsApproval: needed } = tool;
    if (typeof needed !== "function") return needed === true;
    // Decoding needs the services `HandlerServices` names for the tool, which TypeScript cannot
    // relate to the schema of a tool it knows only as `Tool.Any`, as in Effect AI's own check.
    const decodeParams = Schema.decodeUnknownEffect(tool.parametersSchema) as (
      params: unknown,
    ) => Effect.Effect<unknown, Schema.SchemaError, Tool.HandlerServices<T>>;
    const params = yield* decodeParams(call.params);
    const answer = needed(params, { toolCallId: call.id, messages: yield* conversation });
    return Effect.isEffect(answer) ? yield* answer : answer;
  },
  Effect.orElseSucceed(() => false),
);

/**
 * The host's tool that `name` names, with the name as the toolkit declares it, or nothing when the
 * toolkit has none.
 */
const findTool = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  name: string,
) => {
  if (!isToolName(toolkit, name)) return undefined;
  const tool = toolkit.tools[name];
  return tool === undefined ? undefined : { name, tool };
};

const isToolName = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  name: string,
): name is Extract<keyof Tools, string> => Object.hasOwn(toolkit.tools, name);
