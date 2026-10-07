/**
 * The host's side of `Bridge.Rpcs`, for an agent that works in a sandbox and is reached through the
 * bridge there. The adapter's `Agent.Agent` requires a sandbox, lists the bridge's port among its
 * `ports`, and starts each session with `startSession`, from what the adapter says of its bridge.
 *
 * A session connects to the bridge in its sandbox while it uses it, and closes the connection when
 * it lets go, or once it has gone unused for a minute. Each connection launches the bridge when none
 * answers, and starts the session there from the state the bridge last gave, so that a bridge that
 * restarted, as after it died, has the session again. A connection that drops is not opened again:
 * a request it dropped is sent again over another, for up to 30 seconds, as AI SDK's harness
 * reconnects, unless the bridge must not receive it twice.
 *
 * A turn is two requests: `StartTurn`, under an id the host picks, and `ReadTurn`, which reads the
 * turn's parts, on from the last part read after the connection drops. The turn runs in the bridge
 * whoever reads it, so `suspendTurn` only stops reading, and `continueTurn` starts the turn again,
 * which the bridge continues if it did not finish it, as when it died, and reads it again from its
 * start, after the steps the harness has. A session whose bridge cannot answer, as when its sandbox
 * is gone, lets go with the state the bridge last gave.
 */
import { type Network, Sandbox, type Template } from "@amends/sandbox";
import {
  Crypto,
  Deferred,
  Effect,
  Exit,
  Path,
  RcRef,
  Record,
  Redacted,
  Ref,
  Schedule,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from "effect";
import { Tool } from "effect/ai";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { RpcClient, type RpcClientError, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";
import type * as Agent from "./Agent.ts";
import * as Bridge from "./Bridge.ts";
import {
  HarnessError,
  type HarnessErrorReason,
  InvalidOutputError,
  NoTurnError,
  UnavailableError,
  UnknownError,
  UnsupportedError,
} from "./HarnessError.ts";
import type { StreamPart } from "./StreamPart.ts";

/** What an adapter says of its bridge: how to install and launch it, and where to reach it. */
export interface Options {
  /** Names the agent, as its `Bridge.Driver` does. The bridge must answer with it. */
  readonly id: string;

  /**
   * Installs the bridge and the agent in a sandbox. A session runs it again before it launches the
   * bridge, for a sandbox prepared with another version of it, so it keeps what the sandbox has and
   * installs only what it lacks.
   */
  readonly template: Template.Template;

  /** The port the bridge listens on in its sandbox, which the agent lists among its `ports`. */
  readonly port: Network.Port;

  /** The command that runs the bridge in the sandbox, and its arguments. */
  readonly command: string;

  readonly args?: ReadonlyArray<string>;

  /**
   * The token the bridge in the sandbox `id` takes, derived from the id with a secret every host
   * shares, such as an HMAC of it, so that every host connects to a bridge any of them launched.
   */
  readonly token: (id: Sandbox.SandboxId) => Redacted.Redacted<string>;

  /** The agent's own options, which the bridge makes its driver with when it launches. */
  readonly agentOptions: Schema.Json;
}

/** What `suspendTurn`, `detach`, and `stop` return, for `startSession` to take back. */
const State = Schema.Struct({
  /** What the agent behind the bridge gave as the session's state. */
  agentState: Schema.Json,

  /** The turn `suspendTurn` cut short. */
  unfinishedTurn: Schema.optionalKey(Bridge.TurnId),
});

const StateJson = Schema.toCodecJson(State);

/** A client of the bridge in a sandbox. */
type Client = RpcClient.FromGroup<typeof Bridge.Rpcs, RpcClientError.RpcClientError>;

/** A client of a bridge, with what the bridge answered to `Hello`. */
interface Answer extends Schema.Schema.Type<typeof Bridge.Hello.successSchema> {
  readonly client: Client;
}

/**
 * Starts a session, as `Agent.startSession` does, of the agent behind the bridge that `options`
 * describes, in the sandbox of the session's workspace. It connects with the `WebSocketConstructor`
 * provided, which must send headers when it opens a connection, as Bun's and Node's do.
 */
export const startSession = Effect.fn("BridgeClient.startSession")(function* (
  options: Options,
  startOptions: Agent.StartSessionOptions,
) {
  const harnessError = (reason: HarnessErrorReason, cause?: unknown) =>
    new HarnessError({ agent: options.id, reason, cause });
  const { workspace } = startOptions;
  if (workspace === undefined) {
    const description = `${options.id} works in a sandbox`;
    return yield* harnessError(new UnsupportedError({ description }));
  }
  const { sandbox, directory } = workspace;
  const session = startOptions.id;
  const crypto = yield* Crypto.Crypto;

  const saved = yield* Schema.decodeEffect(Schema.UndefinedOr(StateJson))(
    startOptions.unfinishedTurn ?? startOptions.agentState,
  ).pipe(
    Effect.mapError((cause) =>
      harnessError(
        new InvalidOutputError({
          description: `${options.id} cannot read the state it was given: ${cause.message}`,
        }),
        cause,
      ),
    ),
  );

  /** The turn running, or the one `suspendTurn` cut short, for `continueTurn` to read. */
  const running = yield* Ref.make(saved?.unfinishedTurn);
  /**
   * The session's state as the bridge last gave it, which a bridge that restarted starts the
   * session again from, and which the session lets go with when the bridge cannot answer.
   */
  const latestState = yield* Ref.make(saved?.agentState);
  /** Done once the session starts to let go, ending the running turn's stream. */
  const closed = yield* Deferred.make<void>();
  const destroyed = yield* Ref.make(false);
  /**
   * Held while a turn starts and while the session closes, so that a closed session starts none,
   * and the session closes knowing the turn the bridge runs.
   */
  const admission = yield* Semaphore.make(1);

  /**
   * Starts the session in the bridge from its latest state, with the turn running, or takes up the
   * one the bridge runs. A turn the session cannot continue, as one the bridge ran when it died in
   * a conversation the agent then lost, is over.
   */
  const startInBridge = Effect.fnUntraced(function* (client: Client) {
    const agentState = yield* Ref.get(latestState);
    const started = yield* client.StartSession({
      session,
      directory,
      history: startOptions.history,
      ...(agentState === undefined ? {} : { agentState }),
      unfinishedTurn: yield* Ref.get(running),
    });
    yield* Ref.set(latestState, started.agentState);
    if (!started.hasUnfinishedTurn) yield* Ref.set(running, undefined);
    return client;
  });

  /**
   * The connection to the bridge, open while a request or a turn's reader uses it, and for a
   * minute after, so that a session dropped without letting go leaves none open. Opening it
   * launches the bridge when none answers, and starts the session there. It outlives the effect
   * that starts the session, in a scope of its own that nothing closes.
   */
  const connection = yield* RcRef.make({
    acquire: Effect.flatMap(connect(options, sandbox), startInBridge),
    idleTimeToLive: "1 minute",
  }).pipe(Scope.provide(yield* Scope.make()));

  /** Lets go of a connection that dropped, for the next request to open another. */
  const forgetDropped = (error: HarnessError | RpcClientError.RpcClientError) =>
    error._tag === "RpcClientError" ? RcRef.invalidate(connection) : Effect.void;

  /** Sends a request over the connection, letting go of the connection if it dropped. */
  const sendOver = <A>(
    requestOf: (client: Client) => Effect.Effect<A, HarnessError | RpcClientError.RpcClientError>,
  ) =>
    Effect.tapError(Effect.scoped(Effect.flatMap(RcRef.get(connection), requestOf)), forgetDropped);

  /**
   * Sends a request, and again over another connection while the connection drops, for up to 30
   * seconds, reporting one it could not send as `UnavailableError`.
   */
  const send = <A>(
    requestOf: (client: Client) => Effect.Effect<A, HarnessError | RpcClientError.RpcClientError>,
  ) =>
    sendOver(requestOf).pipe(
      Effect.retry(whileReconnecting),
      Effect.mapError((error) => fromRequestError(options.id, error)),
    );

  /** Sends a request the bridge must not receive twice, such as a tool's result, once. */
  const sendOnce = <A>(
    requestOf: (client: Client) => Effect.Effect<A, HarnessError | RpcClientError.RpcClientError>,
  ) => Effect.mapError(sendOver(requestOf), (error) => fromRequestError(options.id, error));

  // Opening the connection starts the session in the bridge, which says whether it has the turn.
  yield* send(() => Effect.void);
  const hasUnfinishedTurn = (yield* Ref.get(running)) !== undefined;

  /** Closes the session once no turn is starting, returning the turn running then. */
  const close = Semaphore.withPermit(
    admission,
    Effect.flatMap(Ref.get(running), (turn) =>
      Effect.as(Deferred.succeed(closed, undefined), turn),
    ),
  );

  /**
   * Lets go of the bridge with the session's state, as `stateOf` asks the bridge for it, closing
   * the connection. When the bridge cannot answer, the session lets go with the state the bridge
   * last gave.
   */
  const letGo = (
    stateOf: (
      client: Client,
    ) => Effect.Effect<Schema.Json, HarnessError | RpcClientError.RpcClientError>,
    unfinishedTurn?: Bridge.TurnId,
  ) =>
    Effect.gen(function* () {
      const agentState = yield* send(stateOf).pipe(
        Effect.catch((error) =>
          Effect.flatMap(Ref.get(latestState), (latest) =>
            latest === undefined
              ? Effect.fail(error)
              : Effect.as(
                  Effect.logWarning(
                    `${options.id} lets go of the session with the state its bridge last gave`,
                    error,
                  ),
                  latest,
                ),
          ),
        ),
      );
      yield* Ref.set(latestState, agentState);
      yield* RcRef.invalidate(connection);
      return yield* Schema.encodeEffect(StateJson)(
        unfinishedTurn === undefined ? { agentState } : { agentState, unfinishedTurn },
      ).pipe(Effect.orDie);
    });

  /**
   * Streams `turn` from the step after its first `finishedSteps`, until its last part. After the
   * connection drops, it reads on from the last part read. A stream that ends before the turn
   * finishes aborts the turn, unless the session let go of it, leaving it to run in the bridge.
   */
  const readTurn = (turn: Bridge.TurnId, finishedSteps: number) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const lastSeq = yield* Ref.make(0);
        const finished = yield* Ref.make(false);
        // A turn that finished may have changed the session's state, as by switching its model.
        const afterTurn = Effect.gen(function* () {
          if (yield* Deferred.isDone(closed)) return;
          yield* Ref.set(running, undefined);
          if (yield* Ref.get(finished)) {
            const agentState = yield* send((client) => client.ReadState({ session }));
            yield* Ref.set(latestState, agentState);
          } else {
            yield* send((client) => client.AbortTurn({ session, turn }));
          }
        }).pipe(Effect.ignore);
        // The stream holds the connection while it reads.
        const readAfterLast = Stream.unwrap(
          Effect.flatMap(Ref.get(lastSeq), (after) =>
            Effect.map(RcRef.get(connection), (client) =>
              client.ReadTurn({ session, turn, after }),
            ),
          ),
        );
        // TODO: Continue a turn the bridge lost while the stream read it, as when it died, as
        // `continueTurn` does after `suspendTurn`, rather than fail the stream with `NoTurnError`.
        return readAfterLast.pipe(
          Stream.tap(({ seq }) => Ref.set(lastSeq, seq)),
          Stream.tapError(forgetDropped),
          Stream.retry(whileReconnecting),
          Stream.mapError((error) => fromRequestError(options.id, error)),
          Stream.map(({ part }) => part),
          afterSteps(finishedSteps),
          Stream.interruptWhen(Deferred.await(closed)),
          Stream.tap((part) => (part.type === "finish" ? Ref.set(finished, true) : Effect.void)),
          Stream.ensuring(afterTurn),
        );
      }),
    );

  /** Starts `turn` in the bridge, returning it, or nothing once the session has closed. */
  const startTurn = Effect.fnUntraced(function* (
    turn: Bridge.TurnId,
    turnOptions: Agent.TurnOptions,
  ) {
    const bridgeOptions = yield* bridgeOptionsOf(options.id, turnOptions);
    return yield* Semaphore.withPermit(
      admission,
      Effect.gen(function* () {
        if (yield* Deferred.isDone(closed)) return undefined;
        // Starting the turn again under its id starts it once.
        yield* send((client) => client.StartTurn({ session, turn, options: bridgeOptions }));
        yield* Ref.set(running, turn);
        return turn;
      }),
    );
  });

  const agentSession: Agent.AgentSession = {
    hasUnfinishedTurn,

    promptTurn: (turnOptions) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const id = Bridge.TurnId.make(yield* Effect.orDie(crypto.randomUUIDv4));
          const turn = yield* startTurn(id, turnOptions);
          return turn === undefined ? Stream.empty : readTurn(turn, 0);
        }),
      ),

    // The bridge continues the turn if it did not finish it, and has it already otherwise.
    continueTurn: (turnOptions, finishedSteps) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const unfinished = yield* Ref.get(running);
          if (unfinished === undefined) {
            const description = `${options.id} has no unfinished turn`;
            return Stream.fail(harnessError(new NoTurnError({ description })));
          }
          const turn = yield* startTurn(unfinished, turnOptions);
          return turn === undefined ? Stream.empty : readTurn(turn, finishedSteps);
        }),
      ),

    submitToolResult: ({ id, name, result, isFailure }) =>
      Schema.decodeUnknownEffect(Schema.Json)(result).pipe(
        Effect.mapError((cause) =>
          harnessError(
            new UnsupportedError({
              description: `The result of ${name} is not JSON, which the bridge takes`,
            }),
            cause,
          ),
        ),
        Effect.flatMap((json) =>
          sendOnce((client) =>
            client.SubmitToolResult({ session, result: { id, name, result: json, isFailure } }),
          ),
        ),
      ),

    approve: (response) => sendOnce((client) => client.Approve({ session, response })),

    compact: (instructions) => sendOnce((client) => client.Compact({ session, instructions })),

    suspendTurn: Effect.flatMap(close, (turn) =>
      letGo((client) => client.ReadState({ session }), turn),
    ),

    detach: Effect.andThen(
      close,
      letGo((client) => client.ReadState({ session })),
    ),

    stop: Effect.andThen(
      close,
      letGo((client) => client.StopSession({ session })),
    ),

    destroy: Effect.gen(function* () {
      yield* close;
      if (yield* Ref.get(destroyed)) return;
      // A session that let go may have ended in the bridge, or the bridge with its sandbox, so the
      // connection starts it again, from its latest state, to be destroyed.
      yield* send((client) => client.DestroySession({ session }));
      yield* Ref.set(destroyed, true);
      yield* RcRef.invalidate(connection);
    }),
  };
  return agentSession;
});

/**
 * A client of the bridge in `sandbox`, over a WebSocket open for as long as the scope is, launching
 * the bridge when none answers, and replacing one that speaks an older version of the protocol. The
 * WebSocket is not opened again when it drops, so that requests then fail with `RpcClientError`
 * rather than reach a bridge that restarted without the session. Fails with `UnsupportedError` when
 * the bridge on the port runs another agent, or speaks a newer version of the protocol.
 */
const connect = Effect.fnUntraced(function* (
  options: Options,
  sandbox: Sandbox.Sandbox["Service"],
) {
  const endpoint = yield* sandbox.endpoint(options.port, "ws").pipe(
    Effect.mapError(
      (error) =>
        new HarnessError({
          agent: options.id,
          reason:
            error.reason._tag === "UnavailableError"
              ? new UnavailableError({ description: error.message })
              : new UnknownError({ description: error.message }),
          cause: error,
        }),
    ),
  );
  const token = options.token(sandbox.id);
  const scope = yield* Effect.scope;

  /**
   * A client over a new WebSocket, and what the bridge there answers to `Hello`, or nothing, with
   * the WebSocket closed, when no bridge answers within 2 seconds. A bridge that is not running
   * refuses the WebSocket, so the question fails rather than waits.
   */
  const answer = Effect.gen(function* () {
    const clientScope = yield* Scope.fork(scope);
    return yield* openClient(endpoint, token).pipe(
      Effect.flatMap((client) =>
        Effect.map(Effect.timeout(client.Hello(), "2 seconds"), (hello): Answer => ({
          client,
          ...hello,
        })),
      ),
      Scope.provide(clientScope),
      Effect.onError((cause) => Scope.close(clientScope, Exit.failCause(cause))),
      Effect.orElseSucceed(() => undefined),
    );
  });

  /**
   * Asks a bridge of an older version of the protocol to exit, which aborts its turns, and launches
   * this host's once no bridge answers.
   */
  const replace = (older: Answer) =>
    Effect.gen(function* () {
      yield* Effect.ignore(older.client.Exit());
      yield* Effect.repeat(answer, {
        until: (reply) => reply === undefined,
        schedule: Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
      });
      return yield* launch(options, sandbox, token, answer);
    });

  const unsupported = (description: string) =>
    new HarnessError({ agent: options.id, reason: new UnsupportedError({ description }) });

  const found = (yield* answer) ?? (yield* launch(options, sandbox, token, answer));
  if (found.agent !== options.id) {
    return yield* unsupported(
      `The bridge on port ${options.port} runs ${found.agent}, not ${options.id}`,
    );
  }
  const answered = found.protocolVersion < Bridge.protocolVersion ? yield* replace(found) : found;
  if (answered.protocolVersion !== Bridge.protocolVersion) {
    return yield* unsupported(
      `The bridge on port ${options.port} speaks version ${answered.protocolVersion} of the bridge protocol, and this host version ${Bridge.protocolVersion}`,
    );
  }
  return answered.client;
});

/**
 * A client of the bridge at `endpoint`, over a WebSocket that presents `token`, for as long as the
 * scope is open. The WebSocket is never opened again once it drops.
 */
const openClient = Effect.fnUntraced(function* (
  endpoint: Network.Endpoint,
  token: Redacted.Redacted<string>,
) {
  const makeWebSocket = yield* Socket.WebSocketConstructor;
  const socket = yield* Socket.fromWebSocket(
    Effect.acquireRelease(
      Effect.sync(() =>
        makeWebSocket(endpoint.url, {
          headers: {
            ...Record.map(endpoint.headers, Redacted.value),
            authorization: `Bearer ${Redacted.value(token)}`,
          },
        }),
      ),
      (webSocket) => Effect.sync(() => webSocket.close(1000)),
    ),
  );
  const protocol = yield* RpcClient.makeProtocolSocket({ retryPolicy: Schedule.recurs(0) }).pipe(
    Effect.provideService(Socket.Socket, socket),
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.json),
  );
  return yield* RpcClient.make(Bridge.Rpcs).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
  );
});

/**
 * Launches the bridge, once the template has installed it, giving it its launch options on standard
 * input, and waits until it answers, as `answer` asks it. Unreferenced, the bridge outlives the
 * scope that launched it and the host; it stops with the sandbox.
 */
const launch = Effect.fnUntraced(
  function* (
    options: Options,
    sandbox: Sandbox.Sandbox["Service"],
    token: Redacted.Redacted<string>,
    answer: Effect.Effect<Answer | undefined, never, Socket.WebSocketConstructor>,
  ) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const path = yield* Path.Path;
    const unavailable = (description: string) =>
      new HarnessError({ agent: options.id, reason: new UnavailableError({ description }) });

    const launchOptions = yield* Schema.encodeEffect(Schema.fromJsonString(Bridge.LaunchOptions))({
      token: Redacted.value(token),
      port: options.port,
      stateDirectory: path.join(sandbox.workingDirectory, ".bridge", options.id),
      agentOptions: options.agentOptions,
    }).pipe(Effect.orDie);
    // A sandbox prepared with another version of the template lacks this version's bridge.
    yield* options.template.prepare;
    // TODO: Keep the bridge's own output in its state directory, for a host to report why the
    // bridge failed to start.
    const bridge = yield* spawner.spawn(
      ChildProcess.make(options.command, options.args ?? [], {
        cwd: sandbox.workingDirectory,
        // One line, which the bridge reads without waiting for its input to end.
        stdin: Stream.encodeText(Stream.make(`${launchOptions}\n`)),
        stdout: "ignore",
        stderr: "ignore",
      }),
    );
    // Never referenced again, so the effect that would do so is dropped.
    yield* Effect.asVoid(bridge.unref);

    const answered = answer.pipe(
      Effect.filterOrFail(
        (reply) => reply !== undefined,
        () => "no answer" as const,
      ),
      Effect.retry(Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "30 seconds" }))),
      Effect.mapError(() => unavailable("The bridge did not answer within 30 seconds")),
    );
    // Another host launching a bridge at the same time takes the port first; this one then exits
    // while the other answers. A bridge already on the port that refuses the token makes it exit
    // too.
    const exited = Effect.flatMap(bridge.exitCode, (code) =>
      Effect.filterOrFail(
        answer,
        (reply) => reply !== undefined,
        () =>
          unavailable(
            `The bridge exited with code ${code} before it answered. A bridge already on port ${options.port} that refuses this host's token makes it exit so.`,
          ),
      ),
    );
    return yield* Effect.raceFirst(answered, exited);
  },
  Effect.scoped,
  (effect, _options, sandbox) => Effect.provide(effect, Sandbox.layerServices(sandbox)),
  (effect, options) =>
    Effect.catchTag(effect, "PlatformError", (error) =>
      Effect.fail(
        new HarnessError({
          agent: options.id,
          reason: new UnknownError({ description: error.message }),
          cause: error,
        }),
      ),
    ),
);

/**
 * Tries a request again after the connection to the bridge drops, for up to 30 seconds. A failure
 * the bridge reports is not tried again: the schedule fails with it.
 */
const whileReconnecting = Schedule.spaced("100 millis").pipe(
  Schedule.upTo({ duration: "30 seconds" }),
  Schedule.setInputType<HarnessError | RpcClientError.RpcClientError>(),
  Schedule.tap(({ input }) => (input._tag === "RpcClientError" ? Effect.void : Effect.fail(input))),
);

const fromRequestError = (agent: string, error: HarnessError | RpcClientError.RpcClientError) =>
  error._tag === "HarnessError"
    ? error
    : new HarnessError({
        agent,
        reason: new UnavailableError({
          description: `The bridge cannot be reached: ${error.message}`,
        }),
        cause: error,
      });

/**
 * `turnOptions` as data for the bridge, with the host's tools and the answer's schema as JSON
 * Schemas.
 */
const bridgeOptionsOf = (agent: string, turnOptions: Agent.TurnOptions) => {
  const toJson = (jsonSchema: unknown) =>
    Schema.decodeUnknownEffect(Schema.Json)(jsonSchema).pipe(
      Effect.mapError(
        (cause) =>
          new HarnessError({
            agent,
            reason: new UnsupportedError({ description: "A JSON Schema the bridge cannot take" }),
            cause,
          }),
      ),
    );
  return Effect.gen(function* () {
    const tools = yield* Effect.forEach(turnOptions.tools, (tool) =>
      Effect.map(toJson(Tool.getJsonSchema(tool)), (parameters): Bridge.ToolDefinition => ({
        name: tool.name,
        description: Tool.getDescription(tool),
        parameters,
      })),
    );
    const { responseFormat } = turnOptions;
    const bridgeOptions: Bridge.TurnOptions = {
      prompt: turnOptions.prompt,
      instructions: turnOptions.instructions,
      model: turnOptions.model,
      tools,
      responseFormat:
        responseFormat.type === "text"
          ? { type: "text" }
          : {
              type: "json",
              objectName: responseFormat.objectName,
              schema: yield* toJson(Tool.getJsonSchemaFromSchema(responseFormat.schema)),
            },
    };
    return bridgeOptions;
  });
};

/** Drops the parts of a turn's first `steps` steps. */
const afterSteps = (steps: number) =>
  Stream.mapAccum(
    () => 0,
    (finished: number, part: StreamPart) =>
      [
        part.type === "finish-step" ? finished + 1 : finished,
        finished < steps ? [] : [part],
      ] as const,
  );
