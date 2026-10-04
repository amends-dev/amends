/**
 * opencode as the bridge runs it in its sandbox. One opencode server, which the agent starts when
 * the first session starts, serves every session there, each an opencode session in the session's
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
import { type Bridge, HarnessError } from "@amends/harness-v2";
import {
  Clock,
  type Crypto,
  Deferred,
  Effect,
  Exit,
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
import type { ModelRef, SessionEvent } from "./SessionEvent.ts";
import * as Turn from "./Turn.ts";

/** What the host gives the bridge for opencode, as its agent options. */
export const Options = Schema.Struct({
  /**
   * The model a turn runs on when it names none, as opencode names models: `provider/model`, such
   * as `anthropic/claude-sonnet-4-5`. A turn names another the same way.
   */
  model: Schema.String,

  /**
   * The command that runs opencode in the sandbox, when it is not the opencode the template installs
   * beside the bridge program.
   */
  command: Schema.optionalKey(Schema.String),

  /** opencode's configuration, as its `opencode.json` takes it. */
  config: Schema.Record(Schema.String, Schema.Json),

  /** Environment variables opencode runs with, such as a model provider's API key. */
  env: Schema.Record(Schema.String, Schema.String),
});

export interface Options extends Schema.Schema.Type<typeof Options> {}

export interface Agent extends Bridge.Agent {
  /**
   * Completes when opencode's server exits before the bridge stops it, for the bridge to exit with
   * it.
   */
  readonly serverExited: Effect.Effect<void>;
}

/** What `state` returns, for `start` to take back. */
const State = Schema.Struct({
  sessionID: Schema.String,

  /** The model the session runs its turns on, as the options name models. */
  model: Schema.String,
});

const StateJson = Schema.toCodecJson(State);

/**
 * The agent, which starts opencode's server with `options` when the first session starts. The
 * server runs in the scope the agent is made in.
 */
export const make = Effect.fn("OpencodeAgent.make")(function* (options: Required<Options>) {
  const services = yield* Effect.context<
    ChildProcessSpawner.ChildProcessSpawner | HttpClient.HttpClient | Crypto.Crypto
  >();
  const agentScope = yield* Effect.scope;
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
      const serverScope = yield* Scope.fork(agentScope);
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

  const agent: Agent = {
    id: "opencode",
    serverExited: Deferred.await(serverExited),
    start: (startOptions) =>
      Effect.flatMap(startedServer, (server) => startSession(server, options.model, startOptions)),
  };
  return agent;
});

const startSession = Effect.fn("OpencodeAgent.start")(function* (
  server: Server.Server,
  defaultModel: string,
  startOptions: Bridge.StartOptions,
) {
  // opencode may have lost the session, as when the sandbox lost its data, and then starts one
  // from the conversation.
  const saved = yield* readState(startOptions.agentState);
  const state =
    saved !== undefined && (yield* server.hasSession(saved.sessionID))
      ? saved
      : yield* createSession(server, startOptions.directory, defaultModel, startOptions.history);
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
    const model = turnOptions.model ?? defaultModel;
    const modelRef = yield* modelRefFor(model);
    yield* awaitProvider(modelRef);
    if (model !== (yield* Ref.get(sessionModel))) {
      yield* server.switchModel(sessionID, modelRef);
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

  const session: Bridge.AgentSession = {
    prompt: runTurn,

    // TODO: Relay the host's tools to opencode, as a server in the bridge that opencode calls.
    submitToolResult: () =>
      Effect.fail(
        harnessError(
          new HarnessError.UnsupportedError({ description: "opencode runs no host tools yet" }),
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
const createSession = Effect.fnUntraced(function* (
  server: Server.Server,
  directory: string,
  model: string,
  history: Prompt.Prompt,
) {
  const modelRef = yield* modelRefFor(model);
  const sessionID = yield* server.createSession({ directory, model: modelRef });
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
 * The events of the turn whose prompt opencode admitted at `admittedSeq`, as they happen. A turn
 * can stop without an event that says so, so they end once opencode stops running the session after
 * taking the prompt, with the events it recorded after the last one streamed.
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
      );
    }),
  );

// TODO: Give opencode a turn's instructions, once its session API takes them.
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
  if (turnOptions.tools.length > 0) return "opencode runs no host tools yet";
  if (turnOptions.prompt.content.some((part) => part.type === "file")) {
    return "The opencode agent does not send files with a prompt yet";
  }
  return undefined;
};

/** The model `model` names as opencode names it, `provider/model`, failing for another name. */
const modelRefFor = (model: string) => {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    const description = `opencode names models provider/model, which ${model} is not`;
    return Effect.fail(harnessError(new HarnessError.UnsupportedError({ description })));
  }
  const modelRef: ModelRef = { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
  return Effect.succeed(modelRef);
};

const textOf = (message: Prompt.UserMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

/** The state `start` was given, if any, as the state `state` returned. */
const readState = (json: Schema.Json | undefined) =>
  Schema.decodeEffect(Schema.UndefinedOr(StateJson))(json).pipe(
    Effect.mapError((cause) =>
      harnessError(
        new HarnessError.InvalidOutputError({
          description: `opencode cannot read the state it was given: ${cause.message}`,
        }),
        cause,
      ),
    ),
  );

const harnessError = (reason: HarnessError.HarnessErrorReason, cause?: unknown) =>
  new HarnessError.HarnessError({ agent: "opencode", reason, cause });
