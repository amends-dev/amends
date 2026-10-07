/**
 * The host's side of `Bridge.Rpcs`, for an agent that works in a sandbox and is reached through a
 * bridge there. The adapter's `Agent.Agent` requires a sandbox and starts each session with
 * `createSession`, from what the adapter says of its bridge.
 *
 * A session's own bridge is the one its options launch: its `Bridge.BridgeId` is a digest of them
 * and of the sandbox's token, so that sessions of hosts that launch a bridge alike share one, and a
 * host with other options, such as another model, runs its own beside it. A session finds the
 * bridge's port in `Bridge.listeningFile`, in the bridge's state directory, exposes the port, and
 * launches the bridge when none answers there.
 *
 * A session connects to its bridge while it uses it, and closes the connection when it lets go, or
 * once it has gone unused for a minute. Each connection launches the bridge when none answers, and
 * starts the session there from the state the bridge last gave, so that a bridge that restarted,
 * as after it died or exited idle, has the session again. A connection that drops is not opened
 * again: a request it dropped is sent again over another, for up to 30 seconds, as AI SDK's harness
 * reconnects, unless the bridge must not receive it twice.
 *
 * A turn is two requests: `StartTurn`, under an id the host picks, and `ReadTurn`, which reads the
 * turn's parts, on from the last part read after the connection drops. The turn runs in the bridge
 * whoever reads it, so `suspendTurn` only stops reading, keeping which bridge runs the turn, and
 * `continueTurn` starts the turn again there, which the bridge continues if it did not finish it,
 * as when it died, and reads it again from its start, after the steps the harness has. A session
 * resumed with other options continues the turn in the bridge that runs it and then goes on in its
 * own; one whose turn's bridge is gone runs the turn again from its prompt in its own. A session
 * whose bridge cannot answer, as when its sandbox is gone, lets go with the state the bridge last
 * gave.
 */
import { type Network, Sandbox, type Template } from "@amends/sandbox";
import {
  Crypto,
  Deferred,
  Effect,
  Exit,
  FileSystem,
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
import { Hex } from "effect/encoding";
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

  /** The command that runs the bridge in the sandbox, and its arguments. */
  readonly command: string;

  readonly args?: ReadonlyArray<string>;

  /**
   * The token the bridges in the sandbox `id` take, derived from the id with a secret every host
   * shares, such as an HMAC of it, so that every host connects to a bridge any of them launched.
   */
  readonly token: (id: Sandbox.SandboxId) => Redacted.Redacted<string>;

  /** The agent's own options, which the bridge makes its driver with when it launches. */
  readonly agentOptions: Schema.Json;
}

/** What `suspendTurn`, `detach`, and `stop` return, for `createSession` to take back. */
const State = Schema.Struct({
  /** What the agent behind the bridge gave as the session's state. */
  agentState: Schema.Json,

  /** The turn `suspendTurn` cut short, and the bridge that runs it. */
  unfinishedTurn: Schema.optionalKey(
    Schema.Struct({ turn: Bridge.TurnId, bridge: Bridge.BridgeId }),
  ),
});

const StateJson = Schema.toCodecJson(State);

/** A client of the bridge in a sandbox. */
type Client = RpcClient.FromGroup<typeof Bridge.Rpcs, RpcClientError.RpcClientError>;

/**
 * Creates a session, as `Agent.createSession` does, of the agent behind the bridge that `options`
 * describes, in the sandbox of the session's workspace. It connects with the `WebSocketConstructor`
 * provided, which must send headers when it opens a connection, as Bun's and Node's do.
 */
export const createSession = Effect.fn("BridgeClient.createSession")(function* (
  options: Options,
  sessionOptions: Agent.CreateSessionOptions,
) {
  const harnessError = (reason: HarnessErrorReason, cause?: unknown) =>
    new HarnessError({ agent: options.id, reason, cause });
  const { workspace } = sessionOptions;
  if (workspace === undefined) {
    const description = `${options.id} works in a sandbox`;
    return yield* harnessError(new UnsupportedError({ description }));
  }
  const { sandbox, directory } = workspace;
  const session = sessionOptions.id;
  const crypto = yield* Crypto.Crypto;
  const token = options.token(sandbox.id);
  const own = yield* bridgeIdOf(options, token);

  const saved = yield* Schema.decodeEffect(Schema.UndefinedOr(StateJson))(
    sessionOptions.unfinishedTurn ?? sessionOptions.agentState,
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
  const running = yield* Ref.make(saved?.unfinishedTurn?.turn);
  /** The bridge the session uses: the one that runs the turn `suspendTurn` cut short, or its own. */
  const bridge = yield* Ref.make(saved?.unfinishedTurn?.bridge ?? own);
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
   * A client of the session's bridge, or of its own when that bridge is gone, launching its own when
   * none answers: only the options of its own are the session's to launch.
   */
  const connectToBridge = Effect.gen(function* () {
    const current = yield* Ref.get(bridge);
    const found = current === own ? undefined : yield* findBridge(options, sandbox, token, current);
    if (found !== undefined) return found;
    yield* Ref.set(bridge, own);
    return yield* connect(options, sandbox, token, own);
  });

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
      history: sessionOptions.history,
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
    acquire: Effect.flatMap(connectToBridge, startInBridge),
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
      const state: typeof State.Type =
        unfinishedTurn === undefined
          ? { agentState }
          : {
              agentState,
              unfinishedTurn: { turn: unfinishedTurn, bridge: yield* Ref.get(bridge) },
            };
      return yield* Schema.encodeEffect(StateJson)(state).pipe(Effect.orDie);
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
          if ((yield* Ref.get(bridge)) !== own) {
            // The turn ran in the bridge of the host that started it, with that host's options;
            // the session goes on in its own, which starts it from the state this one gives.
            const agentState = yield* send((client) => client.StopSession({ session }));
            yield* Ref.set(latestState, agentState);
            yield* Ref.set(bridge, own);
            yield* RcRef.invalidate(connection);
          } else if (yield* Ref.get(finished)) {
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
 * A client of the bridge `bridge`, which `options` launch in `sandbox`, over a WebSocket open for as
 * long as the scope is, launching the bridge when none answers.
 */
const connect = Effect.fnUntraced(function* (
  options: Options,
  sandbox: Sandbox.Sandbox["Service"],
  token: Redacted.Redacted<string>,
  bridge: Bridge.BridgeId,
) {
  // The client lives in this scope, whichever effect finds the bridge.
  const find = findBridge(options, sandbox, token, bridge).pipe(Scope.provide(yield* Effect.scope));
  return (yield* find) ?? (yield* launch(options, sandbox, token, bridge, find));
});

/**
 * A client of the bridge `bridge` in `sandbox`, at the port its `Bridge.listeningFile` names, over a
 * WebSocket open for as long as the scope is, or nothing, with the WebSocket closed, when no bridge
 * answers there as that bridge within 2 seconds: one that exited left its file behind, and another
 * may listen on its port since. A bridge that is not running refuses the WebSocket, so the question
 * fails rather than waits. The WebSocket is not opened again when it drops, so that requests then
 * fail with `RpcClientError` rather than reach a bridge that restarted without the session.
 */
const findBridge = Effect.fnUntraced(function* (
  options: Options,
  sandbox: Sandbox.Sandbox["Service"],
  token: Redacted.Redacted<string>,
  bridge: Bridge.BridgeId,
) {
  const listening = yield* readListening(sandbox, options.id, bridge);
  if (listening === undefined) return undefined;
  const endpoint = yield* endpointOf(options.id, sandbox, listening.port);
  const clientScope = yield* Scope.fork(yield* Effect.scope);
  return yield* openClient(endpoint, token).pipe(
    Effect.tap((client) =>
      Effect.timeout(client.Hello(), "2 seconds").pipe(
        Effect.filterOrFail((hello) => hello.agent === options.id && hello.bridge === bridge),
      ),
    ),
    Scope.provide(clientScope),
    Effect.onError((cause) => Scope.close(clientScope, Exit.failCause(cause))),
    Effect.orElseSucceed(() => undefined),
  );
});

/** Where the bridge `bridge` of the agent `agent` says it listens, or nothing when it says nothing. */
const readListening = (
  sandbox: Sandbox.Sandbox["Service"],
  agent: string,
  bridge: Bridge.BridgeId,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* stateDirectoryOf(sandbox, agent, bridge);
    const text = yield* fs.readFileString(path.join(directory, Bridge.listeningFile));
    return yield* Schema.decodeEffect(Schema.fromJsonString(Bridge.Listening))(text);
  }).pipe(
    Effect.orElseSucceed(() => undefined),
    Effect.provide(Sandbox.layerServices(sandbox)),
  );

/**
 * The directory in `sandbox` that the bridge `bridge` of the agent `agent` keeps its state in,
 * outside every session's directory.
 */
const stateDirectoryOf = (
  sandbox: Sandbox.Sandbox["Service"],
  agent: string,
  bridge: Bridge.BridgeId,
) => Effect.map(Path.Path, (path) => path.join(sandbox.workingDirectory, ".bridge", agent, bridge));

/** How to reach `port` of `sandbox`, which the sandbox exposes first if it does not yet. */
const endpointOf = (agent: string, sandbox: Sandbox.Sandbox["Service"], port: Network.Port) =>
  sandbox.endpoint(port, "ws").pipe(
    Effect.catchReason("SandboxError", "NotFoundError", () =>
      Effect.andThen(sandbox.exposePorts([port]), sandbox.endpoint(port, "ws")),
    ),
    Effect.mapError(
      (error) =>
        new HarnessError({
          agent,
          reason:
            error.reason._tag === "UnavailableError"
              ? new UnavailableError({ description: error.message })
              : new UnknownError({ description: error.message }),
          cause: error,
        }),
    ),
  );

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
 * Launches the bridge `bridge`, once the template has installed it, giving it its launch options on
 * standard input, and waits until `find` finds it. Unreferenced, the bridge outlives the scope that
 * launched it and the host; it exits once idle, or stops with the sandbox.
 */
const launch = Effect.fnUntraced(
  function* (
    options: Options,
    sandbox: Sandbox.Sandbox["Service"],
    token: Redacted.Redacted<string>,
    bridge: Bridge.BridgeId,
    find: Effect.Effect<Client | undefined, HarnessError, Socket.WebSocketConstructor>,
  ) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const unavailable = (description: string) =>
      new HarnessError({ agent: options.id, reason: new UnavailableError({ description }) });

    const launchOptions = yield* Schema.encodeEffect(Schema.fromJsonString(Bridge.LaunchOptions))({
      token: Redacted.value(token),
      bridge,
      stateDirectory: yield* stateDirectoryOf(sandbox, options.id, bridge),
      agentOptions: options.agentOptions,
    }).pipe(Effect.orDie);
    // A sandbox prepared with another version of the template lacks this version's bridge.
    yield* options.template.prepare;
    // TODO: Keep the bridge's own output in its state directory, for a host to report why the
    // bridge failed to start.
    const process = yield* spawner.spawn(
      ChildProcess.make(options.command, options.args ?? [], {
        cwd: sandbox.workingDirectory,
        // One line, which the bridge reads without waiting for its input to end.
        stdin: Stream.encodeText(Stream.make(`${launchOptions}\n`)),
        stdout: "ignore",
        stderr: "ignore",
      }),
    );
    // Never referenced again, so the effect that would do so is dropped.
    yield* Effect.asVoid(process.unref);

    const found = find.pipe(
      Effect.filterOrFail(
        (client) => client !== undefined,
        () => unavailable("The bridge did not answer within 30 seconds"),
      ),
      Effect.retry(Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "30 seconds" }))),
    );
    // A bridge that fails to start exits, which the host learns at once rather than in 30 seconds.
    const exited = Effect.flatMap(process.exitCode, (code) =>
      Effect.filterOrFail(
        find,
        (client) => client !== undefined,
        () => unavailable(`The bridge exited with code ${code} before it answered`),
      ),
    );
    return yield* Effect.raceFirst(found, exited);
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

// Every runtime this package runs on has the WHATWG `TextEncoder`, which no type the package
// includes declares, and Effect exports no encoder of its own.
declare const TextEncoder: new () => { readonly encode: (text: string) => Uint8Array };

/**
 * The id of the bridge `options` launch, in the sandbox whose bridges take `token`: a digest of
 * everything the bridge is launched with, keyed by the token, so that it says nothing of the
 * options' keys, and hosts with another secret never share a bridge.
 */
const bridgeIdOf = Effect.fnUntraced(function* (
  options: Options,
  token: Redacted.Redacted<string>,
) {
  const crypto = yield* Crypto.Crypto;
  const launchedWith = canonicalJsonOf({
    token: Redacted.value(token),
    agent: options.id,
    protocolVersion: Bridge.protocolVersion,
    template: options.template.identity,
    command: options.command,
    args: options.args ?? [],
    agentOptions: options.agentOptions,
  });
  const digest = yield* crypto
    .digest("SHA-256", new TextEncoder().encode(launchedWith))
    .pipe(Effect.orDie);
  return Bridge.BridgeId.make(Hex.encode(digest).slice(0, 32));
});

/** `value` as JSON with each object's keys in order, so that equal values have equal text. */
const canonicalJsonOf = (value: Schema.Json): string => JSON.stringify(sortedKeys(value));

const sortedKeys = (value: Schema.Json): Schema.Json => {
  if (value === null || typeof value !== "object") return value;
  if (isJsonArray(value)) return value.map(sortedKeys);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedKeys(value[key] ?? null)]),
  );
};

// `Array.isArray` narrows no readonly array out of a union.
const isJsonArray = (value: Schema.JsonArray | Schema.JsonObject): value is Schema.JsonArray =>
  Array.isArray(value);
