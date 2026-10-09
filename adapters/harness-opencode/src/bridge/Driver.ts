/**
 * opencode's driver, which runs opencode for the bridge in its sandbox. One opencode server, which
 * the driver starts when the first session starts, serves every session there, each an opencode session in the session's
 * directory. A turn is a prompt to it, whose parts `Turn` translates from the events opencode
 * records for the turn, as they happen. A session that starts with a conversation from another
 * agent has it written into opencode's record by `History`, tool calls included, before its first
 * turn.
 *
 * opencode's server runs until the bridge stops. A server that fails to start is started again by
 * the next session, and one that exits by itself completes `serverExited`, for the bridge to exit
 * with it.
 *
 * opencode's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 */
import { type Bridge, HarnessError } from "@amends/harness";
import {
  Clock,
  type Crypto,
  Deferred,
  Effect,
  Exit,
  type FileSystem,
  type Path,
  Ref,
  Schedule,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from "effect";
import type { Prompt } from "effect/ai";
import type { HttpClient } from "effect/http";
import type { ChildProcessSpawner } from "effect/process";
import * as History from "./History.ts";
import * as Server from "./Server.ts";
import { ModelRef, type SessionEvent } from "./SessionEvent.ts";
import * as Turn from "./Turn.ts";

/** What the host gives the bridge for opencode, as its agent options. */
export const Options = Schema.Struct({
  /** The model a turn runs on when it names none. */
  model: ModelRef,

  /** The models a turn can name, by name. A turn that names another fails with `UnsupportedError`. */
  models: Schema.Record(Schema.String, ModelRef),

  /**
   * The command that runs opencode in the sandbox, when it is not the opencode the template installs
   * beside the bridge program.
   */
  command: Schema.optionalKey(Schema.String),

  /** opencode's configuration, as its `opencode.json` takes it, with the providers of the models. */
  config: Schema.Record(Schema.String, Schema.Json),

  /** Environment variables opencode runs with. */
  env: Schema.Record(Schema.String, Schema.String),
});

export interface Options extends Schema.Schema.Type<typeof Options> {}

export interface Driver extends Bridge.Driver {
  /**
   * Completes when opencode's server exits before the bridge stops it, for the bridge to exit with
   * it.
   */
  readonly serverExited: Effect.Effect<void>;
}

/** What `state` returns, for `createSession` to take back. */
const State = Schema.Struct({
  sessionID: Schema.String,

  /** The model the session runs its turns on. */
  model: ModelRef,
});

const StateJson = Schema.toCodecJson(State);

/**
 * The driver, which starts opencode's server with `options` when the first session starts. The
 * server runs in the scope the driver is made in.
 */
export const make = Effect.fn("OpencodeDriver.make")(function* (options: Required<Options>) {
  const services = yield* Effect.context<
    | ChildProcessSpawner.ChildProcessSpawner
    | HttpClient.HttpClient
    | Crypto.Crypto
    | FileSystem.FileSystem
    | Path.Path
  >();
  const driverScope = yield* Effect.scope;
  const serverExited = yield* Deferred.make<void>();
  const running = yield* Ref.make<Server.Server | undefined>(undefined);
  /** Held while the server starts, so that sessions starting together start one. */
  const starting = yield* Semaphore.make(1);

  /** opencode's server, which the first session to need it starts. */
  const startedServer = Semaphore.withPermit(
    starting,
    Effect.gen(function* () {
      const current = yield* Ref.get(running);
      if (current !== undefined) return current;
      const serverScope = yield* Scope.fork(driverScope);
      const server = yield* Server.start({
        command: options.command,
        config: options.config,
        env: options.env,
      }).pipe(
        Scope.provide(serverScope),
        Effect.onError((cause) => Scope.close(serverScope, Exit.failCause(cause))),
      );
      yield* Effect.forkIn(
        Effect.andThen(server.exited, Deferred.succeed(serverExited, undefined)),
        serverScope,
      );
      yield* Ref.set(running, server);
      return server;
    }),
  ).pipe(Effect.provide(services));

  const driver: Driver = {
    id: "opencode",
    serverExited: Deferred.await(serverExited),
    createSession: (sessionOptions) =>
      Effect.flatMap(startedServer, (server) => createSession(server, options, sessionOptions)),
  };
  return driver;
});

const createSession = Effect.fn("OpencodeDriver.createSession")(function* (
  server: Server.Server,
  options: Pick<Options, "model" | "models">,
  sessionOptions: Bridge.CreateSessionOptions,
) {
  // opencode may have lost the session, as when the sandbox lost its data, and then starts one
  // from the conversation.
  const saved = yield* readState(sessionOptions.agentState);
  const kept =
    saved !== undefined && (yield* server.hasSession(saved.sessionID)) ? saved : undefined;
  const state =
    kept ??
    (yield* createOpencodeSession(
      server,
      sessionOptions.directory,
      options.model,
      sessionOptions.history,
    ));
  const { sessionID } = state;

  /** The model the session runs its turns on, switched when a turn names another. */
  const sessionModel = yield* Ref.make(state.model);

  /**
   * Waits until opencode has loaded `model`'s provider, failing when it has not within 10 seconds:
   * opencode drops a turn on a model it does not have, recording nothing.
   */
  const awaitProvider = (model: ModelRef) => {
    const missing = harnessError(
      new HarnessError.UnsupportedError({
        description: `opencode has no model provider ${model.providerID}`,
      }),
    );
    return server.hasProvider(model.providerID).pipe(
      Effect.filterOrFail(
        (loaded) => loaded,
        () => missing,
      ),
      // A request that fails is not tried again.
      Effect.retry({
        while: (error) => error === missing,
        schedule: Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "10 seconds" })),
      }),
    );
  };

  /** Gives opencode the turn's prompt on the turn's model, returning where the turn starts. */
  const admitPrompt = Effect.fnUntraced(function* (turnOptions: Bridge.TurnOptions) {
    const unsupported = unsupportedIn(turnOptions);
    if (unsupported !== undefined) {
      return yield* harnessError(new HarnessError.UnsupportedError({ description: unsupported }));
    }
    const model = yield* modelNamed(options, turnOptions.model);
    yield* awaitProvider(model);
    if (!isSameModel(model, yield* Ref.get(sessionModel))) {
      yield* server.switchModel(sessionID, model);
      yield* Ref.set(sessionModel, model);
    }
    return yield* server.prompt(sessionID, textOf(turnOptions.prompt));
  });

  /**
   * Runs a turn, streaming its parts until its `finish`. A stream that ends before the turn
   * finishes, as when the bridge aborts the turn, interrupts the turn in opencode.
   */
  const runTurn = (turnOptions: Bridge.TurnOptions) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const finished = yield* Ref.make(false);
        // Interrupting a session that runs no turn does nothing, so this holds from before opencode
        // admits the prompt.
        yield* Effect.addFinalizer(() =>
          Effect.flatMap(Ref.get(finished), (done) =>
            done ? Effect.void : Effect.ignore(server.interrupt(sessionID)),
          ),
        );
        const admittedSeq = yield* admitPrompt(turnOptions);
        /** The turn as translated so far. */
        const translated = yield* Ref.make(Turn.initial);
        const translate = (event: SessionEvent) =>
          Effect.flatMap(Ref.get(translated), (turn) =>
            Effect.fromResult(Turn.translate(turn, event)),
          ).pipe(
            Effect.flatMap(([turn, parts]) => Effect.as(Ref.set(translated, turn), parts)),
            Effect.mapError((reason) => harnessError(reason)),
          );
        /** What ends the turn when its events end before its `finish`: opencode stopped it. */
        const finishStopped = Stream.unwrap(
          Effect.map(Ref.get(translated), (turn) => Stream.fromIterable(Turn.finishStopped(turn))),
        );
        return eventsOfTurn(server, sessionID, admittedSeq).pipe(
          Stream.mapEffect(translate),
          Stream.flattenIterable,
          // A failure reading the events fails the turn, rather than ending it as stopped.
          Stream.concat(finishStopped),
          Stream.takeUntil((part) => part.type === "finish"),
          Stream.tap((part) => (part.type === "finish" ? Ref.set(finished, true) : Effect.void)),
        );
      }),
    );

  const session: Bridge.DriverSession = {
    keptConversation: kept !== undefined,

    promptTurn: runTurn,

    // TODO: Give opencode the host's tools through `HostToolRelay`, as an MCP server in the bridge,
    // once its session API shows MCP tools to the model, which 1.18.23 does not: the runner behind
    // `/api/session` takes only the tools registered in its process. Its older session API does.
    submitToolResult: () =>
      Effect.fail(
        harnessError(
          new HarnessError.UnsupportedError({
            description: "opencode's session API does not offer the host's tools to its model yet",
          }),
        ),
      ),

    // TODO: Answer opencode's permission requests, once a permission mode says when it asks.
    approve: () =>
      Effect.fail(
        harnessError(
          new HarnessError.UnsupportedError({
            description: "The opencode agent answers no permission requests yet",
          }),
        ),
      ),

    // TODO: Compact through opencode's session API, once opencode implements it there.
    compact: () =>
      Effect.fail(
        harnessError(
          new HarnessError.UnsupportedError({
            description: "opencode's session API does not compact on request yet",
          }),
        ),
      ),

    state: Effect.flatMap(Ref.get(sessionModel), (model) =>
      Effect.orDie(Schema.encodeEffect(StateJson)({ sessionID, model })),
    ),

    destroy: server.deleteSession(sessionID),
  };
  return session;
});

/**
 * A new opencode session in `directory` on `model`, holding `history`. A session the history could
 * not be written into is deleted.
 */
const createOpencodeSession = Effect.fnUntraced(function* (
  server: Server.Server,
  directory: string,
  model: ModelRef,
  history: Prompt.Prompt,
) {
  const sessionID = yield* server.createSession({ directory, model });
  if (history.content.length > 0) {
    const now = yield* Clock.currentTimeMillis;
    yield* Effect.fromResult(History.eventsOf(history, { sessionID, now })).pipe(
      Effect.mapError((reason) => harnessError(reason)),
      Effect.flatMap((events) => server.replay(directory, events)),
      Effect.onError(() => Effect.ignore(server.deleteSession(sessionID))),
    );
  }
  const created: typeof State.Type = { sessionID, model };
  return created;
});

/**
 * The events of the turn whose prompt opencode admitted at `admittedSeq`, as they happen, from
 * opencode taking the prompt. Those before are not the turn's: opencode first fails a call that it
 * was running when it stopped, as when the bridge died. A turn can stop without an event that says
 * so, so they end once opencode stops running the session after taking the prompt, with the events
 * it recorded after the last one streamed.
 */
const eventsOfTurn = (server: Server.Server, sessionID: string, admittedSeq: number) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const lastSeq = yield* Ref.make(admittedSeq);
      const prompted = yield* Deferred.make<void>();
      const stopped = Effect.andThen(
        Deferred.await(prompted),
        Effect.repeat(server.isRunning(sessionID), {
          while: (isRunning) => isRunning,
          schedule: Schedule.spaced("1 second"),
        }),
      );
      const recordedAfterLast = Stream.unwrap(
        Effect.map(Ref.get(lastSeq), (seq) => server.history(sessionID, seq)),
      );
      return server.events(sessionID, admittedSeq).pipe(
        Stream.interruptWhen(stopped),
        // Only an event streamed counts: one read just as opencode stops is dropped there, and
        // comes from the history instead.
        Stream.tap((event) =>
          Effect.andThen(
            Ref.set(lastSeq, event.durable.seq),
            event.type === "session.next.prompted"
              ? Deferred.succeed(prompted, undefined)
              : Effect.void,
          ),
        ),
        Stream.concat(recordedAfterLast),
        Stream.dropWhile((event) => event.type !== "session.next.prompted"),
      );
    }),
  );

// TODO: Run a turn whose instructions opencode cannot take without them, rather than refusing
// it, and give opencode the instructions once its session API takes them.
// TODO: Answer in JSON, once opencode's session API takes a response format.
// TODO: Send the files a prompt carries, once `Server.prompt` sends files.
/** Why opencode cannot run a turn with `turnOptions`, or nothing when it can. */
const unsupportedIn = (turnOptions: Bridge.TurnOptions): string | undefined => {
  if (turnOptions.instructions !== undefined) {
    return "opencode's session API takes no instructions for a turn";
  }
  if (turnOptions.responseFormat.type === "json") {
    return "opencode's session API does not answer in JSON";
  }
  if (turnOptions.tools.length > 0) {
    return "opencode's session API does not offer the host's tools to its model yet";
  }
  if (turnOptions.prompt.content.some((part) => part.type === "file")) {
    return "The opencode agent does not send files with a prompt yet";
  }
  return undefined;
};

/** The model a turn that names `name` runs on, failing for a name the options do not give. */
const modelNamed = (options: Pick<Options, "model" | "models">, name: string | undefined) => {
  if (name === undefined) return Effect.succeed(options.model);
  const model = Object.hasOwn(options.models, name) ? options.models[name] : undefined;
  if (model !== undefined) return Effect.succeed(model);
  const description = `The opencode agent has no model named ${name}`;
  return Effect.fail(harnessError(new HarnessError.UnsupportedError({ description })));
};

const isSameModel = (one: ModelRef, other: ModelRef) =>
  one.providerID === other.providerID && one.id === other.id && one.variant === other.variant;

const textOf = (message: Prompt.UserMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

/** The state `createSession` was given, if any, as the state `state` returned. */
const readState = (json: Schema.Json | undefined) =>
  Schema.decodeEffect(Schema.UndefinedOr(StateJson))(json).pipe(
    Effect.mapError((cause) =>
      harnessError(
        new HarnessError.AgentContractError({
          description: `opencode cannot read the state it was given: ${cause.message}`,
        }),
        cause,
      ),
    ),
  );

const harnessError = (reason: HarnessError.HarnessErrorReason, cause?: unknown) =>
  new HarnessError.HarnessError({ agent: "opencode", reason, cause });
