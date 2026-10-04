/**
 * opencode as an agent. opencode's server runs in the sandbox and serves every session there; the
 * agent drives it over the server's session API, which opencode 1.18 added and which this adapter is
 * written against. Each harness session is an opencode session in the session's directory, and a
 * turn is a prompt to it, whose parts `Turn` translates from the events opencode records for the
 * turn, as they happen.
 *
 * opencode keeps working when the host lets go. A turn `suspend` cut short goes on in opencode, and
 * `continue` streams its parts from opencode's record of the turn, after the steps the session has. A
 * session that starts with a conversation from another agent has it written into opencode's record
 * by `History`, tool calls included, before its first turn.
 *
 * opencode's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 */
import { type Agent, HarnessError, type StreamPart } from "@amends/harness-v2";
import { Network } from "@amends/sandbox-v2";
import {
  Clock,
  type Crypto,
  Deferred,
  Effect,
  Ref,
  Schedule,
  Schema,
  Semaphore,
  Stream,
} from "effect";
import type { Prompt } from "effect/ai";
import type { HttpClient } from "effect/http";
import * as History from "./History.ts";
import * as Server from "./Server.ts";
import type { ModelRef, SessionEvent } from "./SessionEvent.ts";
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

/** Where a turn starts in opencode's record of the session: the event that admitted its prompt. */
const TurnStart = Schema.Struct({ admittedSeq: Schema.Int });

type TurnStart = typeof TurnStart.Type;

/** What `suspend`, `detach`, and `stop` return, for `start` to take back. */
const State = Schema.Struct({
  sessionID: Schema.String,

  /** The model the session runs its turns on, as the options name models. */
  model: Schema.String,

  /** The turn `suspend` cut short. */
  unfinishedTurn: Schema.optionalKey(TurnStart),
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
  /** The turn running, or the one `suspend` cut short, for `continue` to stream. */
  const running = yield* Ref.make(state.unfinishedTurn);
  /** Done once the session is suspended, stopped, or destroyed, ending the running turn's stream. */
  const closed = yield* Deferred.make<void>();
  /**
   * Held while opencode admits a prompt and while the session closes, so that a closed session
   * admits none, and the session closes knowing every turn opencode is running.
   */
  const admission = yield* Semaphore.make(1);

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

  /**
   * Gives opencode the turn's prompt on the turn's model, returning where the turn starts, or
   * nothing once the session has closed.
   */
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
    return yield* Semaphore.withPermit(
      admission,
      Effect.gen(function* () {
        if (yield* Deferred.isDone(closed)) return undefined;
        if (model !== (yield* Ref.get(sessionModel))) {
          yield* server
            .switchModel(sessionID, modelRef)
            .pipe(Effect.mapError(fromServerError(method)));
          yield* Ref.set(sessionModel, model);
        }
        const admittedSeq = yield* server
          .prompt(sessionID, textOf(turnOptions.prompt))
          .pipe(Effect.mapError(fromServerError(method)));
        const start: TurnStart = { admittedSeq };
        yield* Ref.set(running, start);
        return start;
      }),
    );
  });

  /**
   * Streams the turn that starts at `start`, from the step after its first `finishedSteps`, until
   * its `finish`. A stream that ends before the turn finishes, unless the session closed,
   * interrupts the turn in opencode.
   */
  const streamTurn = (method: string, start: TurnStart, finishedSteps: number) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const finished = yield* Ref.make(false);
        /** The turn as translated so far. */
        const translated = yield* Ref.make(Turn.initial);
        const translate = (event: SessionEvent) =>
          Effect.flatMap(Ref.get(translated), (turn) =>
            Effect.fromResult(Turn.translate(turn, event)),
          ).pipe(
            Effect.flatMap(([turn, parts]) => Effect.as(Ref.set(translated, turn), parts)),
            Effect.mapError((reason) => harnessError(method, reason)),
          );
        /** What ends the turn when its events end before its `finish`: opencode stopped it. */
        const finishStopped = Stream.unwrap(
          Effect.map(Ref.get(translated), (turn) => Stream.fromIterable(Turn.finishStopped(turn))),
        );
        const interruptUnfinished = Effect.gen(function* () {
          if ((yield* Ref.get(finished)) || (yield* Deferred.isDone(closed))) return;
          yield* Effect.ignore(server.interrupt(sessionID));
        });
        return eventsOfTurn(server, sessionID, start.admittedSeq).pipe(
          Stream.mapError(fromServerError(method)),
          Stream.mapEffect(translate),
          Stream.flattenIterable,
          // A failure reading the events fails the turn, rather than ending it as stopped.
          Stream.concat(finishStopped),
          Stream.takeUntil((part) => part.type === "finish"),
          afterSteps(finishedSteps),
          Stream.interruptWhen(Deferred.await(closed)),
          Stream.tap((part) => (part.type === "finish" ? Ref.set(finished, true) : Effect.void)),
          Stream.ensuring(Effect.andThen(interruptUnfinished, Ref.set(running, undefined))),
        );
      }),
    );

  const runTurn = (method: string, turnOptions: Agent.TurnOptions) =>
    Stream.unwrap(
      Effect.map(admitPrompt(method, turnOptions), (start) =>
        start === undefined ? Stream.empty : streamTurn(method, start, 0),
      ),
    );

  /** What the agent returns for `start` to take back, with the turn `suspend` cut short. */
  const saveState = (unfinished: TurnStart | undefined) =>
    Effect.flatMap(Ref.get(sessionModel), (model) =>
      Schema.encodeEffect(StateJson)({
        sessionID,
        model,
        ...(unfinished === undefined ? {} : { unfinishedTurn: unfinished }),
      }),
    ).pipe(Effect.orDie);

  /** Closes the session once no prompt is being admitted, returning the turn running then. */
  const close = Semaphore.withPermit(
    admission,
    Effect.flatMap(Ref.get(running), (turn) =>
      Effect.as(Deferred.succeed(closed, undefined), turn),
    ),
  );

  const interrupt = (method: string) =>
    server.interrupt(sessionID).pipe(Effect.mapError(fromServerError(method)));

  const session: Agent.AgentSession = {
    hasUnfinishedTurn: state.unfinishedTurn !== undefined,

    prompt: (turnOptions) => runTurn("prompt", turnOptions),

    continue: (_turnOptions, finishedSteps) =>
      Stream.unwrap(
        Effect.map(Ref.get(running), (start) =>
          start === undefined
            ? Stream.fail(
                harnessError(
                  "continue",
                  new HarnessError.NotFoundError({
                    description: "opencode has no unfinished turn",
                  }),
                ),
              )
            : streamTurn("continue", start, finishedSteps),
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

    suspend: Effect.flatMap(close, saveState),

    detach: saveState(undefined),

    stop: Effect.andThen(Effect.andThen(close, interrupt("stop")), saveState(undefined)),

    destroy: Effect.andThen(
      Effect.andThen(close, interrupt("destroy")),
      server.deleteSession(sessionID).pipe(Effect.mapError(fromServerError("destroy"))),
    ),
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

/** Drops the parts of a turn's first `steps` steps. */
const afterSteps = (steps: number) =>
  Stream.mapAccum(
    () => 0,
    (finished: number, part: StreamPart.StreamPart) =>
      [
        part.type === "finish-step" ? finished + 1 : finished,
        finished < steps ? [] : [part],
      ] as const,
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
