/**
 * The host's side of `Bridge.Rpcs`: an agent that works in a sandbox, reached through the bridge
 * there. `make` gives the `Agent.Agent` a harness runs, from what an adapter says of its bridge.
 *
 * A session connects to the bridge in its sandbox while it uses it, launching the bridge when none
 * answers, and closes the connection when it lets go, or once it has gone unused for a minute.
 *
 * A turn is two requests: `StartTurn`, under an id the host picks, and `ReadTurn`, which reads the
 * turn's parts. When the connection drops, both are sent again for up to 30 seconds, as AI SDK's
 * harness reconnects, and reading goes on after the last part read. The turn runs in the bridge
 * whoever reads it, so `suspend` only stops reading, and `continue` reads the turn again from its
 * start, after the steps the harness has.
 */
import { type Network, Sandbox, type Template } from "@amends/sandbox-v2";
import {
  Crypto,
  Deferred,
  Effect,
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

export interface Options {
  /** Names the agent, as its `Bridge.Agent` does. The bridge must answer with it. */
  readonly id: string;

  /** Installs the bridge and the agent in a sandbox. */
  readonly template: Template.Template;

  /** The port the bridge listens on in its sandbox, which the sandbox must be created with. */
  readonly port: Network.Port;

  /** The command that runs the bridge in the sandbox, and its arguments. */
  readonly command: string;

  readonly args?: ReadonlyArray<string>;

  /**
   * The token the bridge in the sandbox `id` takes, derived from the id with a secret every host
   * shares, such as an HMAC of it, so that every host connects to a bridge any of them launched.
   */
  readonly token: (id: Sandbox.SandboxId) => Redacted.Redacted<string>;

  /** The agent's own options, which the bridge gives the agent when it launches. */
  readonly agentOptions: Schema.Json;
}

/**
 * The agent, which connects to bridges with the `WebSocketConstructor` it is made with. That
 * constructor must send headers when it opens a connection, as Bun's and Node's do.
 */
export const make = Effect.fn("BridgeClient.make")(function* (options: Options) {
  const services = yield* Effect.context<Socket.WebSocketConstructor | Crypto.Crypto>();
  const agent: Agent.Agent = {
    id: options.id,
    requiresSandbox: true,
    template: options.template,
    ports: [options.port],
    start: (startOptions) => Effect.provide(startSession(options, startOptions), services),
  };
  return agent;
});

/** What `suspend`, `detach`, and `stop` return, for `start` to take back. */
const State = Schema.Struct({
  /** What the agent behind the bridge gave as the session's state. */
  agentState: Schema.Json,

  /** The turn `suspend` cut short. */
  unfinishedTurn: Schema.optionalKey(Bridge.TurnId),
});

const StateJson = Schema.toCodecJson(State);

/** A client of the bridge in a sandbox. */
type Client = RpcClient.FromGroup<typeof Bridge.Rpcs, RpcClientError.RpcClientError>;

const startSession = Effect.fn("BridgeClient.start")(function* (
  options: Options,
  startOptions: Agent.StartOptions,
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

  /**
   * The connection to the bridge, open while a request or a turn's reader uses it, and for a
   * minute after, so that a session dropped without letting go leaves none open. Opening it
   * launches the bridge when none answers. It outlives the effect that starts the session, in a
   * scope of its own that nothing closes.
   */
  const connection = yield* RcRef.make({
    acquire: connect(options, sandbox),
    idleTimeToLive: "1 minute",
  }).pipe(Scope.provide(yield* Scope.make()));

  /** Sends a request over the connection, reporting a dropped one as `UnavailableError`. */
  const send = <A>(
    requestOf: (client: Client) => Effect.Effect<A, HarnessError | RpcClientError.RpcClientError>,
  ) =>
    Effect.scoped(
      Effect.flatMap(RcRef.get(connection), (client) => request(options.id, requestOf(client))),
    );

  /** Starts the session in the bridge from `agentState`, or takes up the one the bridge runs. */
  const startInBridge = (
    client: Client,
    agentState: Schema.Json | undefined,
    unfinishedTurn?: Bridge.TurnId,
  ) =>
    client.StartSession({
      session,
      directory,
      history: startOptions.history,
      agentState,
      unfinishedTurn,
    });

  const { hasUnfinishedTurn } = yield* send((client) =>
    startInBridge(client, saved?.agentState, saved?.unfinishedTurn),
  );

  /** The turn running, or the one `suspend` cut short, for `continue` to read. */
  const running = yield* Ref.make(hasUnfinishedTurn ? saved?.unfinishedTurn : undefined);
  /** The session's state when it started or last let go, for `destroy` to start it again from. */
  const latestState = yield* Ref.make(saved?.agentState);
  /** Done once the session starts to let go, ending the running turn's stream. */
  const closed = yield* Deferred.make<void>();
  const destroyed = yield* Ref.make(false);
  /**
   * Held while a turn starts and while the session closes, so that a closed session starts none,
   * and the session closes knowing the turn the bridge runs.
   */
  const admission = yield* Semaphore.make(1);

  /** Closes the session once no turn is starting, returning the turn running then. */
  const close = Semaphore.withPermit(
    admission,
    Effect.flatMap(Ref.get(running), (turn) =>
      Effect.as(Deferred.succeed(closed, undefined), turn),
    ),
  );

  /** Lets go of the bridge, closing the connection, after the session saved `agentState`. */
  const letGo = (agentState: Schema.Json, unfinishedTurn?: Bridge.TurnId) =>
    Effect.gen(function* () {
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
        const endEarly = Effect.gen(function* () {
          if (yield* Deferred.isDone(closed)) return;
          if (!(yield* Ref.get(finished))) {
            yield* Effect.ignore(send((client) => client.AbortTurn({ session, turn })));
          }
          yield* Ref.set(running, undefined);
        });
        // The stream holds the connection while it reads.
        const readAfterLast = Stream.unwrap(
          Effect.flatMap(Ref.get(lastSeq), (after) =>
            Effect.map(RcRef.get(connection), (client) =>
              client.ReadTurn({ session, turn, after }),
            ),
          ),
        );
        return readAfterLast.pipe(
          Stream.tap(({ seq }) => Ref.set(lastSeq, seq)),
          Stream.retry(whileReconnecting),
          Stream.mapError((error) => fromRequestError(options.id, error)),
          Stream.map(({ part }) => part),
          afterSteps(finishedSteps),
          Stream.interruptWhen(Deferred.await(closed)),
          Stream.tap((part) => (part.type === "finish" ? Ref.set(finished, true) : Effect.void)),
          Stream.ensuring(endEarly),
        );
      }),
    );

  /** Starts a turn in the bridge, returning its id, or nothing once the session has closed. */
  const startTurn = Effect.fnUntraced(function* (turnOptions: Agent.TurnOptions) {
    const bridgeOptions = yield* bridgeOptionsOf(options.id, turnOptions);
    const turn = Bridge.TurnId.make(yield* Effect.orDie(crypto.randomUUIDv4));
    return yield* Semaphore.withPermit(
      admission,
      Effect.gen(function* () {
        if (yield* Deferred.isDone(closed)) return undefined;
        yield* send((client) =>
          // Starting the turn again under its id starts it once.
          Effect.retry(
            client.StartTurn({ session, turn, options: bridgeOptions }),
            whileReconnecting,
          ),
        );
        yield* Ref.set(running, turn);
        return turn;
      }),
    );
  });

  const agentSession: Agent.AgentSession = {
    hasUnfinishedTurn,

    prompt: (turnOptions) =>
      Stream.unwrap(
        Effect.map(startTurn(turnOptions), (turn) =>
          turn === undefined ? Stream.empty : readTurn(turn, 0),
        ),
      ),

    continue: (_turnOptions, finishedSteps) =>
      Stream.unwrap(
        Effect.map(Ref.get(running), (turn) =>
          turn === undefined
            ? Stream.fail(
                harnessError(
                  new NoTurnError({ description: `${options.id} has no unfinished turn` }),
                ),
              )
            : readTurn(turn, finishedSteps),
        ),
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
          send((client) =>
            client.SubmitToolResult({ session, result: { id, name, result: json, isFailure } }),
          ),
        ),
      ),

    approve: (response) => send((client) => client.Approve({ session, response })),

    compact: (instructions) => send((client) => client.Compact({ session, instructions })),

    suspend: Effect.gen(function* () {
      const turn = yield* close;
      const agentState = yield* send((client) => client.ReadState({ session }));
      return yield* letGo(agentState, turn);
    }),

    detach: Effect.gen(function* () {
      yield* close;
      const agentState = yield* send((client) => client.ReadState({ session }));
      return yield* letGo(agentState);
    }),

    stop: Effect.gen(function* () {
      yield* close;
      const agentState = yield* send((client) => client.StopSession({ session }));
      return yield* letGo(agentState);
    }),

    // TODO: Read the session's state when it starts, once a bridge that restarted while a host held
    // the session must still destroy the agent's own session rather than a new one.
    destroy: Effect.gen(function* () {
      yield* close;
      if (yield* Ref.get(destroyed)) return;
      // A session that let go may have ended in the bridge, or the bridge with its sandbox, so it
      // is started again, from its latest state, to be destroyed.
      const agentState = yield* Ref.get(latestState);
      yield* send((client) =>
        Effect.andThen(startInBridge(client, agentState), client.DestroySession({ session })),
      );
      yield* Ref.set(destroyed, true);
      yield* RcRef.invalidate(connection);
    }),
  };
  return agentSession;
});

/**
 * A client of the bridge in `sandbox`, for as long as the scope is open, launching the bridge when
 * none answers. Fails with `UnsupportedError` when the bridge on the port runs another agent.
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
  const protocol = yield* RpcClient.makeProtocolSocket({
    // Opens the connection again soon after it drops, as AI SDK's harness does.
    retryPolicy: Schedule.min([Schedule.exponential("50 millis"), Schedule.spaced("2 seconds")]),
  }).pipe(
    Effect.provideService(Socket.Socket, socket),
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.json),
  );
  const client = yield* RpcClient.make(Bridge.Rpcs).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
  );

  // A bridge that is not running refuses the connection, so the question fails rather than waits.
  const answer = client.Hello().pipe(
    Effect.map(({ agent }) => agent),
    Effect.timeout("2 seconds"),
    Effect.orElseSucceed(() => undefined),
  );
  const agent = (yield* answer) ?? (yield* launch(options, sandbox, token, answer));
  if (agent !== options.id) {
    const description = `The bridge on port ${options.port} runs ${agent}, not ${options.id}`;
    return yield* new HarnessError({
      agent: options.id,
      reason: new UnsupportedError({ description }),
    });
  }
  return client;
});

/**
 * Launches the bridge, giving it its launch options on standard input, and waits until it answers
 * with its agent. Unreferenced, the bridge outlives the scope that launched it and the host; it
 * stops with the sandbox.
 */
const launch = Effect.fnUntraced(
  function* (
    options: Options,
    sandbox: Sandbox.Sandbox["Service"],
    token: Redacted.Redacted<string>,
    answer: Effect.Effect<string | undefined>,
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
    // TODO: Keep the bridge's own output in its state directory, for a host to report why the
    // bridge failed to start.
    const bridge = yield* spawner.spawn(
      ChildProcess.make(options.command, options.args ?? [], {
        cwd: sandbox.workingDirectory,
        stdin: Stream.encodeText(Stream.make(launchOptions)),
        stdout: "ignore",
        stderr: "ignore",
      }),
    );
    // Never referenced again, so the effect that would do so is dropped.
    yield* Effect.asVoid(bridge.unref);

    const answered = answer.pipe(
      Effect.filterOrFail(
        (agent) => agent !== undefined,
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
        (agent) => agent !== undefined,
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
 * Tries a request again while the connection to the bridge is down, for up to 30 seconds. A failure
 * the bridge reports is not tried again: the schedule fails with it.
 */
const whileReconnecting = Schedule.spaced("100 millis").pipe(
  Schedule.upTo({ duration: "30 seconds" }),
  Schedule.setInputType<HarnessError | RpcClientError.RpcClientError>(),
  Schedule.tap(({ input }) => (input._tag === "RpcClientError" ? Effect.void : Effect.fail(input))),
);

/** Sends a request once, reporting a dropped connection as `UnavailableError`. */
const request = <A>(
  agent: string,
  effect: Effect.Effect<A, HarnessError | RpcClientError.RpcClientError>,
) => Effect.mapError(effect, (error) => fromRequestError(agent, error));

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
