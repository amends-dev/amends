/**
 * A session of opencode 2's session API, as the driver runs it: an opencode session in the
 * session's directory. A turn is a prompt to it, whose parts `Turn` translates from the events
 * opencode records for the turn, as they happen. A session that starts with a conversation from
 * another agent has it written into opencode's record by `History`, tool calls included, before
 * its first turn.
 *
 * opencode 2's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 */
import { type Bridge, HarnessError } from "@amends/harness";
import { Clock, Deferred, Effect, Ref, Schedule, Schema, Stream } from "effect";
import type { Prompt } from "effect/ai";
import * as Driver from "../Driver.ts";
import * as Server from "../Server.ts";
import * as Api from "./Api.ts";
import type { SessionEvent } from "./Event.ts";
import * as History from "./History.ts";
import * as Turn from "./Turn.ts";

/** What `state` returns, for `createSession` to take back. */
const State = Schema.Struct({
  sessionID: Schema.String,

  /** The model the session runs its turns on. */
  model: Driver.ModelRef,
});

const StateJson = Schema.toCodecJson(State);

/**
 * Creates the session on `server`, as `Driver.CreateSession` does: a new opencode session, or the
 * one its `agentState` names, when opencode still has it.
 */
export const createSession: Driver.CreateSession = Effect.fn("Session.createSession")(
  function* (server, options, sessionOptions) {
    const api = Api.make(server);
    const harnessError = (reason: HarnessError.HarnessErrorReason, cause?: unknown) =>
      Server.harnessError(server.agent, reason, cause);
    // opencode may have lost the session, as when the sandbox lost its data, and then starts one
    // from the conversation.
    const saved = yield* readState(harnessError, sessionOptions.agentState);
    const kept =
      saved !== undefined && (yield* api.hasSession(saved.sessionID)) ? saved : undefined;
    const state =
      kept ??
      (yield* createOpencodeSession(
        api,
        harnessError,
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
    const awaitProvider = (model: Driver.ModelRef) => {
      const missing = harnessError(
        new HarnessError.UnsupportedError({
          description: `opencode has no model provider ${model.providerID}`,
        }),
      );
      return api.hasProvider(model.providerID).pipe(
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
      const model = yield* modelNamed(harnessError, options, turnOptions.model);
      yield* awaitProvider(model);
      if (!isSameModel(model, yield* Ref.get(sessionModel))) {
        yield* api.switchModel(sessionID, model);
        yield* Ref.set(sessionModel, model);
      }
      return yield* api.prompt(sessionID, textOf(turnOptions.prompt));
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
              done ? Effect.void : Effect.ignore(api.interrupt(sessionID)),
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
            Effect.map(Ref.get(translated), (turn) =>
              Stream.fromIterable(Turn.finishStopped(turn)),
            ),
          );
          return eventsOfTurn(api, sessionID, admittedSeq).pipe(
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

      submitToolResult: () =>
        Effect.fail(
          harnessError(
            new HarnessError.UnsupportedError({
              description:
                "opencode 2's session API does not offer the host's tools to its model yet",
            }),
          ),
        ),

      approve: () =>
        Effect.fail(
          harnessError(
            new HarnessError.UnsupportedError({
              description: "The opencode 2 agent answers no permission requests yet",
            }),
          ),
        ),

      compact: () =>
        Effect.fail(
          harnessError(
            new HarnessError.UnsupportedError({
              description: "opencode 2's session API does not compact on request yet",
            }),
          ),
        ),

      state: Effect.flatMap(Ref.get(sessionModel), (model) =>
        Effect.orDie(Schema.encodeEffect(StateJson)({ sessionID, model })),
      ),

      destroy: api.deleteSession(sessionID),
    };
    return session;
  },
);

/** The error the agent reports for `reason`, as `Server.harnessError` makes it for the agent. */
type HarnessErrorOf = (
  reason: HarnessError.HarnessErrorReason,
  cause?: unknown,
) => HarnessError.HarnessError;

/**
 * A new opencode session in `directory` on `model`, holding `history`. A session the history could
 * not be written into is deleted.
 */
const createOpencodeSession = Effect.fnUntraced(function* (
  api: Api.Api,
  harnessError: HarnessErrorOf,
  directory: string,
  model: Driver.ModelRef,
  history: Prompt.Prompt,
) {
  const sessionID = yield* api.createSession({ directory, model });
  if (history.content.length > 0) {
    const now = yield* Clock.currentTimeMillis;
    yield* Effect.fromResult(History.eventsOf(history, { sessionID, now })).pipe(
      Effect.mapError((reason) => harnessError(reason)),
      Effect.flatMap((events) => api.replay(directory, events)),
      Effect.onError(() => Effect.ignore(api.deleteSession(sessionID))),
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
const eventsOfTurn = (api: Api.Api, sessionID: string, admittedSeq: number) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const lastSeq = yield* Ref.make(admittedSeq);
      const prompted = yield* Deferred.make<void>();
      const stopped = Effect.andThen(
        Deferred.await(prompted),
        Effect.repeat(api.isRunning(sessionID), {
          while: (isRunning) => isRunning,
          schedule: Schedule.spaced("1 second"),
        }),
      );
      const recordedAfterLast = Stream.unwrap(
        Effect.map(Ref.get(lastSeq), (seq) => api.history(sessionID, seq)),
      );
      return api.events(sessionID, admittedSeq).pipe(
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

/** Why opencode cannot run a turn with `turnOptions`, or nothing when it can. */
const unsupportedIn = (turnOptions: Bridge.TurnOptions): string | undefined => {
  if (turnOptions.instructions !== undefined) {
    return "opencode 2's session API takes no instructions for a turn";
  }
  if (turnOptions.responseFormat.type === "json") {
    return "opencode 2's session API does not answer in JSON";
  }
  if (turnOptions.tools.length > 0) {
    return "opencode 2's session API does not offer the host's tools to its model yet";
  }
  if (turnOptions.prompt.content.some((part) => part.type === "file")) {
    return "The opencode 2 agent does not send files with a prompt yet";
  }
  return undefined;
};

/** The model a turn that names `name` runs on, failing for a name the options do not give. */
const modelNamed = (
  harnessError: HarnessErrorOf,
  options: Pick<Driver.Options, "model" | "models">,
  name: string | undefined,
) => {
  if (name === undefined) return Effect.succeed(options.model);
  const model = Object.hasOwn(options.models, name) ? options.models[name] : undefined;
  if (model !== undefined) return Effect.succeed(model);
  const description = `The opencode 2 agent has no model named ${name}`;
  return Effect.fail(harnessError(new HarnessError.UnsupportedError({ description })));
};

const isSameModel = (one: Driver.ModelRef, other: Driver.ModelRef) =>
  one.providerID === other.providerID && one.id === other.id && one.variant === other.variant;

const textOf = (message: Prompt.UserMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

/** The state `createSession` was given, if any, as the state `state` returned. */
const readState = (harnessError: HarnessErrorOf, json: Schema.Json | undefined) =>
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
