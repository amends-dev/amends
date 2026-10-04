/**
 * opencode as an agent. opencode's server runs in the sandbox and serves every session there; the
 * agent drives it over the server's session API, which opencode 1.18 added and which this adapter is
 * written against. Each harness session is an opencode session in the session's directory, and a
 * turn is a prompt to it, whose parts `Turn` translates from the events opencode records for the
 * turn, as they happen.
 *
 * opencode keeps working when the host lets go. A turn `suspend` cut short goes on in opencode, and
 * `continue` streams its parts from opencode's record of the turn, after the ones it delivered. A
 * session that starts with a conversation from another agent has it written into opencode's record
 * by `History`, tool calls included, before its first turn.
 *
 * opencode's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 */
import { type Agent, HarnessError } from "@amends/harness-v2";
import { Network } from "@amends/sandbox-v2";
import { Clock, type Crypto, Deferred, Effect, Ref, Schedule, Schema, Stream } from "effect";
import type { Prompt } from "effect/ai";
import type { HttpClient } from "effect/http";
import * as History from "./History.ts";
import * as Server from "./Server.ts";
import type { ModelRef } from "./SessionEvent.ts";
import * as Turn from "./Turn.ts";

export interface Options {
  /**
   * The model a turn runs on when it names none, as opencode names models: `provider/model`, such
   * as `anthropic/claude-sonnet-4-5`. A turn names another the same way.
   */
  readonly model: string;

  /** The command that runs opencode in the sandbox, `opencode` by default. */
  readonly command?: string;

  /** The port opencode's server listens on, `defaultPort` by default. The sandbox must expose it. */
  readonly port?: Network.Port;

  /**
   * opencode's configuration, as its `opencode.json` takes it. It takes effect when the agent starts
   * opencode's server; a server already running in the sandbox keeps the one it started with.
   */
  readonly config?: { readonly [key: string]: Schema.Json };

  /** Environment variables opencode's server runs with, such as a model provider's API key. */
  readonly env?: Readonly<Record<string, string>>;
}

/** The port opencode's server listens on unless the options name another. */
export const defaultPort = Network.Port.make(4096);

/** Where a turn is: the event that admitted its prompt, and how many of its parts it delivered. */
const Progress = Schema.Struct({ admittedSeq: Schema.Int, delivered: Schema.Int });

type Progress = typeof Progress.Type;

/** What `suspend`, `detach`, and `stop` return, for `start` to take back. */
const State = Schema.Struct({
  sessionID: Schema.String,

  /** The model the session runs its turns on, as the options name models. */
  model: Schema.String,

  /** The turn `suspend` cut short. */
  unfinishedTurn: Schema.optionalKey(Progress),
});

const StateJson = Schema.toCodecJson(State);

/** What `start` takes back, if anything: a state the agent returned. */
const SavedState = Schema.UndefinedOr(StateJson);

// TODO: Add a template that installs a pinned opencode, once a sandbox lacks it. opencode's
// installer writes only to `~/.opencode`, so the local provider, which prepares sandboxes on this
// machine, must not run it.
// TODO: Tell the harness which ports the sandbox must expose, once the harness creates sandboxes.
/** The agent, which reaches opencode's server with the `HttpClient` it is made with. */
export const make = Effect.fn("OpencodeAgent.make")(function* (options: Options) {
  const services = yield* Effect.context<HttpClient.HttpClient | Crypto.Crypto>();
  const agent: Agent.Agent = {
    id: "opencode",
    requiresSandbox: true,
    start: (startOptions) => Effect.provide(startSession(options, startOptions), services),
  };
  return agent;
});

const startSession = Effect.fn("OpencodeAgent.start")(function* (
  options: Options,
  startOptions: Agent.StartOptions,
) {
  const { workspace } = startOptions;
  if (workspace === undefined) {
    const description = "opencode works in a sandbox";
    return yield* harnessError("start", new HarnessError.UnsupportedError({ description }));
  }
  const server = yield* Server.connect(workspace.sandbox, {
    command: options.command ?? "opencode",
    port: options.port ?? defaultPort,
    config: options.config ?? {},
    env: options.env ?? {},
  }).pipe(Effect.mapError(fromServerError("start")));

  // opencode in another sandbox than the one the session last ran in has no record of it, and
  // starts a session from the conversation instead, which runs an unfinished turn again.
  const saved = yield* readState(startOptions.unfinishedTurn ?? startOptions.resume);
  const state =
    saved !== undefined &&
    (yield* server.hasSession(saved.sessionID).pipe(Effect.mapError(fromServerError("start"))))
      ? saved
      : yield* createSession(server, workspace.directory, options.model, startOptions.history);
  const { sessionID } = state;

  /** The model the session runs its turns on, switched when a turn names another. */
  const sessionModel = yield* Ref.make(state.model);
  /** The turn `suspend` cut short, until `continue` takes it. */
  const unfinishedTurn = yield* Ref.make(state.unfinishedTurn);
  /** The turn running: how many of its parts it delivered, and when its stream ended. */
  const running = yield* Ref.make<RunningTurn | undefined>(undefined);
  /** Done once the session is suspended, stopped, or destroyed, ending the running turn's stream. */
  const closed = yield* Deferred.make<void>();

  /**
   * Waits until opencode has loaded `model`'s provider, failing when it has not within 10 seconds:
   * opencode drops a turn on a model it does not have, recording nothing.
   */
  const awaitProvider = Effect.fnUntraced(function* (method: string, model: ModelRef) {
    for (let check = 0; check < 50; check++) {
      const loaded = yield* server
        .hasProvider(model.providerID)
        .pipe(Effect.mapError(fromServerError(method)));
      if (loaded) return;
      yield* Effect.sleep("200 millis");
    }
    const description = `opencode has no model provider ${model.providerID}`;
    return yield* harnessError(method, new HarnessError.UnsupportedError({ description }));
  });

  /** Gives opencode the turn's prompt on the turn's model, returning where the turn starts. */
  const admitPrompt = Effect.fnUntraced(function* (method: string, turnOptions: Agent.TurnOptions) {
    const unsupported = unsupportedIn(turnOptions);
    if (unsupported !== undefined) {
      return yield* harnessError(
        method,
        new HarnessError.UnsupportedError({ description: unsupported }),
      );
    }
    const model = turnOptions.model ?? options.model;
    const modelRef = yield* modelRefFor(method, model);
    yield* awaitProvider(method, modelRef);
    if (model !== (yield* Ref.get(sessionModel))) {
      yield* server.switchModel(sessionID, modelRef).pipe(Effect.mapError(fromServerError(method)));
      yield* Ref.set(sessionModel, model);
    }
    const admittedSeq = yield* server
      .prompt(sessionID, textOf(turnOptions.prompt))
      .pipe(Effect.mapError(fromServerError(method)));
    return { admittedSeq, delivered: 0 } satisfies Progress;
  });

  /**
   * Streams the turn at `progress` until its `finish`, after the parts it delivered. A stream that
   * ends before the turn finishes, unless the session closed, interrupts the turn in opencode.
   */
  const streamTurn = (method: string, progress: Progress) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const delivered = yield* Ref.make(progress.delivered);
        const finished = yield* Ref.make(false);
        const ended = yield* Deferred.make<void>();
        yield* Ref.set(running, { admittedSeq: progress.admittedSeq, delivered, ended });

        const interruptUnfinished = Effect.gen(function* () {
          if ((yield* Ref.get(finished)) || (yield* Deferred.isDone(closed))) return;
          yield* Effect.ignore(server.interrupt(sessionID));
        });
        return eventsOfTurn(server, sessionID, progress.admittedSeq).pipe(
          Stream.mapError(fromServerError(method)),
          Stream.mapAccumEffect(
            () => Turn.initial,
            (turn, event) =>
              Effect.mapError(Effect.fromResult(Turn.translate(turn, event)), (reason) =>
                harnessError(method, reason),
              ),
            { onHalt: Turn.finishStopped },
          ),
          Stream.takeUntil((part) => part.type === "finish"),
          Stream.drop(progress.delivered),
          Stream.interruptWhen(Deferred.await(closed)),
          Stream.tap((part) =>
            Effect.andThen(
              Ref.update(delivered, (count) => count + 1),
              part.type === "finish" ? Ref.set(finished, true) : Effect.void,
            ),
          ),
          Stream.ensuring(
            Effect.andThen(
              interruptUnfinished,
              Effect.andThen(Ref.set(running, undefined), Deferred.succeed(ended, undefined)),
            ),
          ),
        );
      }),
    );

  const runTurn = (method: string, turnOptions: Agent.TurnOptions) =>
    Stream.unwrap(
      Effect.map(admitPrompt(method, turnOptions), (progress) => streamTurn(method, progress)),
    );

  /** What the agent returns for `start` to take back, with the turn `suspend` cut short. */
  const saveState = (unfinished: Progress | undefined) =>
    Effect.flatMap(Ref.get(sessionModel), (model) =>
      Schema.encodeEffect(StateJson)({
        sessionID,
        model,
        ...(unfinished === undefined ? {} : { unfinishedTurn: unfinished }),
      }),
    ).pipe(Effect.orDie);

  const close = Deferred.succeed(closed, undefined);

  const interrupt = (method: string) =>
    server.interrupt(sessionID).pipe(Effect.mapError(fromServerError(method)));

  const session: Agent.AgentSession = {
    prompt: (turnOptions) => runTurn("prompt", turnOptions),

    // A turn whose session opencode no longer had runs again from its prompt.
    continue: (turnOptions) =>
      Stream.unwrap(
        Effect.map(Ref.getAndSet(unfinishedTurn, undefined), (progress) =>
          progress === undefined
            ? runTurn("continue", turnOptions)
            : streamTurn("continue", progress),
        ),
      ),

    // TODO: Relay the host's tools to opencode, as a server in the sandbox that opencode calls.
    submitToolResult: () =>
      Effect.fail(
        harnessError(
          "submitToolResult",
          new HarnessError.UnsupportedError({ description: "opencode runs no host tools yet" }),
        ),
      ),

    // TODO: Answer opencode's permission requests, once a permission mode says when it asks.
    approve: () =>
      Effect.fail(
        harnessError(
          "approve",
          new HarnessError.UnsupportedError({
            description: "The opencode agent answers no permission requests yet",
          }),
        ),
      ),

    // TODO: Compact through opencode's session API, once opencode implements it there.
    compact: () =>
      Effect.fail(
        harnessError(
          "compact",
          new HarnessError.UnsupportedError({
            description: "opencode's session API does not compact on request yet",
          }),
        ),
      ),

    suspend: Effect.gen(function* () {
      const turn = yield* Ref.get(running);
      yield* close;
      if (turn === undefined) return yield* saveState(undefined);
      yield* Deferred.await(turn.ended);
      return yield* saveState({
        admittedSeq: turn.admittedSeq,
        delivered: yield* Ref.get(turn.delivered),
      });
    }),

    detach: saveState(undefined),

    stop: Effect.andThen(Effect.andThen(close, interrupt("stop")), saveState(undefined)),

    destroy: Effect.andThen(
      Effect.andThen(close, interrupt("destroy")),
      server.deleteSession(sessionID).pipe(Effect.mapError(fromServerError("destroy"))),
    ),
  };
  return session;
});

/** A turn the session is streaming. */
interface RunningTurn {
  readonly admittedSeq: number;
  readonly delivered: Ref.Ref<number>;
  readonly ended: Deferred.Deferred<void>;
}

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
  const modelRef = yield* modelRefFor("start", model);
  const sessionID = yield* server
    .createSession({ directory, model: modelRef })
    .pipe(Effect.mapError(fromServerError("start")));
  if (history.content.length > 0) {
    const now = yield* Clock.currentTimeMillis;
    yield* Effect.fromResult(History.eventsOf(history, { sessionID, now })).pipe(
      Effect.mapError((reason) => harnessError("start", reason)),
      Effect.flatMap((events) =>
        server.replay(directory, events).pipe(Effect.mapError(fromServerError("start"))),
      ),
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
        Stream.tap((event) =>
          Effect.andThen(
            Ref.set(lastSeq, event.durable.seq),
            event.type === "session.next.prompted"
              ? Deferred.succeed(prompted, undefined)
              : Effect.void,
          ),
        ),
        Stream.interruptWhen(stopped),
        Stream.concat(recordedAfterLast),
      );
    }),
  );

// TODO: Give opencode a turn's instructions, once its session API takes them.
// TODO: Answer in JSON, once opencode's session API takes a response format.
// TODO: Send the files a prompt carries, once `Server.prompt` sends files.
/** Why opencode cannot run a turn with `turnOptions`, or nothing when it can. */
const unsupportedIn = (turnOptions: Agent.TurnOptions): string | undefined => {
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
const modelRefFor = (method: string, model: string) => {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    const description = `opencode names models provider/model, which ${model} is not`;
    return Effect.fail(harnessError(method, new HarnessError.UnsupportedError({ description })));
  }
  const modelRef: ModelRef = { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
  return Effect.succeed(modelRef);
};

const textOf = (message: Prompt.UserMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

const readState = (json: Schema.Json | undefined) =>
  Schema.decodeEffect(SavedState)(json).pipe(
    Effect.mapError((cause) =>
      harnessError(
        "start",
        new HarnessError.InvalidOutputError({
          description: `opencode cannot read the state it was given: ${cause.message}`,
        }),
        cause,
      ),
    ),
  );

const fromServerError = (method: string) => (error: Server.ServerError) =>
  harnessError(method, error.reason, error.cause);

const harnessError = (method: string, reason: HarnessError.HarnessErrorReason, cause?: unknown) =>
  new HarnessError.HarnessError({ harness: "opencode", method, reason, cause });
