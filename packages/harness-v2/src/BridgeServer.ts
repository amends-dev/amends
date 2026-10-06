/**
 * The bridge's side of `Bridge.Rpcs`, which runs in the sandbox and serves a driver's sessions to
 * hosts. `serve` serves them over a WebSocket at `/`, refusing a host that does not present the
 * bridge's token, until a host asks the bridge to exit, and `layerHandlers` is the same bridge
 * without a transport. `readLaunchOptions` reads what the host that launched the bridge gave it.
 *
 * Each session the bridge starts runs in a scope of its own until a host stops or destroys it. The
 * bridge runs the session's turns itself, one at a time, in that scope, so that a turn does not end
 * with the connection of the host that started it. It numbers a turn's parts as the turn streams
 * them and keeps them in memory and in a file in its state directory, a line each, followed by how
 * the turn ended. A session keeps only its latest turn, which hosts read from any number while it
 * runs and after it ends. A bridge started again reads a turn from its file. A turn whose file has
 * no end, which the bridge ran when it died, ended then, aborted. A turn the bridge aborted that a
 * host starts again continues, in the conversation the agent kept, from the steps it finished.
 */
import {
  Cause,
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Result,
  Schema,
  Scope,
  Semaphore,
  Stdio,
  Stream,
  SubscriptionRef,
} from "effect";
import { Prompt } from "effect/ai";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import type { SessionId } from "./Agent.ts";
import * as Bridge from "./Bridge.ts";
import { isPresented } from "./internal/bearer.ts";
import {
  HarnessError,
  type HarnessErrorReason,
  NoTurnError,
  NotFoundError,
  TurnInProgressError,
  UnknownError,
} from "./HarnessError.ts";

export interface Options {
  /** The token hosts present when they connect. */
  readonly token: Redacted.Redacted<string>;

  /** The absolute directory the bridge keeps its turns in, outside every session's directory. */
  readonly stateDirectory: string;
}

/**
 * Serves `driver`'s sessions over a WebSocket at `/`, on the `HttpServer` provided, until a host
 * asks the bridge to exit. The sessions end, aborting their turns, when the scope closes.
 */
export const serve = Effect.fnUntraced(function* (driver: Bridge.Driver, options: Options) {
  const exitAsked = yield* Deferred.make<void>();
  const handlers = layerHandlers(driver, {
    stateDirectory: options.stateDirectory,
    exit: Deferred.succeed(exitAsked, undefined),
  });
  yield* Layer.build(
    HttpRouter.serve(
      RpcServer.layer(Bridge.Rpcs).pipe(
        Layer.provide([handlers, layerProtocol(options.token)]),
        Layer.provide(RpcSerialization.layerJson),
      ),
      { disableLogger: true },
    ),
  );
  yield* Deferred.await(exitAsked);
});

/**
 * Handles `Bridge.Rpcs` for `driver`'s sessions, over whichever transport serves them. `exit` ends
 * the bridge when a host asks it to.
 */
export const layerHandlers = (
  driver: Bridge.Driver,
  options: { readonly stateDirectory: string; readonly exit: Effect.Effect<unknown> },
) => Bridge.Rpcs.toLayer(makeHandlers(driver, options));

/**
 * What the host that launched the bridge gave it on standard input, as one line of JSON. The bridge
 * reads no further, since a sandbox may never end a process's standard input, as Daytona does not.
 */
export const readLaunchOptions = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio;
  const line = yield* stdio.stdin.pipe(Stream.decodeText(), Stream.splitLines, Stream.runHead);
  return yield* Schema.decodeEffect(Schema.fromJsonString(Bridge.LaunchOptions))(
    Option.getOrElse(line, () => ""),
  );
});

/**
 * How a turn ended: by itself, failing, or aborted, by a host or by its session or the bridge
 * ending.
 */
const TurnEnd = Schema.TaggedUnion({
  Finished: {},
  Failed: { error: HarnessError },
  Aborted: {},
});

type TurnEnd = typeof TurnEnd.Type;

/** A line of a turn's file: one of its parts, or, last, how it ended. */
const TurnLine = Schema.Union([Bridge.NumberedPart, Schema.Struct({ end: TurnEnd })]);

const TurnLineJson = Schema.fromJsonString(Schema.toCodecJson(TurnLine));

/** How far a turn has got: how many parts it has, and how it ended once it has. */
interface Progress {
  readonly count: number;
  readonly end?: TurnEnd;
}

interface Turn {
  readonly id: Bridge.TurnId;

  /** The turn's parts so far, each at the place before its number. Only the turn appends to it. */
  readonly parts: Array<Bridge.NumberedPart>;

  /** Changes after each part and when the turn ends, for its readers to follow. */
  readonly progress: SubscriptionRef.SubscriptionRef<Progress>;
}

/** A session the bridge started. Its turn and fiber change only while the bridge's lock is held. */
interface StartedSession {
  readonly driverSession: Bridge.DriverSession;

  /** Closes when the session ends, interrupting its turn. */
  readonly scope: Scope.Closeable;

  /** The session's latest turn. */
  turn: Turn | undefined;

  /** The fiber running `turn`; none for a turn read from its file. */
  fiber: Fiber.Fiber<void> | undefined;
}

/** How the bridge starts a turn that a host asks it to start. */
type TurnStart = Data.TaggedEnum<{
  /** Not again: the bridge started the turn and did not abort it. */
  Started: { readonly turn: Turn };

  /** By prompting the agent to continue the turn, which keeps the parts of the steps it finished. */
  Continue: { readonly parts: ReadonlyArray<Bridge.NumberedPart> };

  /** From its prompt, as a turn the bridge does not have. */
  New: {};
}>;

const TurnStart = Data.taggedEnum<TurnStart>();

/** What the bridge prompts an agent with to continue a turn it aborted, as AI SDK's harness does. */
const continuePrompt = Prompt.makeMessage("user", {
  content: [Prompt.makePart("text", { text: "Continue." })],
});

const makeHandlers = Effect.fnUntraced(function* (
  driver: Bridge.Driver,
  {
    stateDirectory,
    exit,
  }: { readonly stateDirectory: string; readonly exit: Effect.Effect<unknown> },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  /** The handlers' scope, which every session's is forked from, so that sessions end with it. */
  const bridgeScope = yield* Effect.scope;
  const sessions = new Map<SessionId, StartedSession>();
  /**
   * Held while a session starts or ends, and while it starts or aborts a turn, so that none of
   * these sees another half done.
   */
  const lock = yield* Semaphore.make(1);

  const harnessError = (reason: HarnessErrorReason, cause?: unknown) =>
    new HarnessError({ agent: driver.id, reason, cause });

  /** The error for a failure of the bridge itself, such as one writing a turn's file. */
  const bridgeFailure = (cause: unknown) =>
    harnessError(
      new UnknownError({
        description: `The bridge failed: ${cause instanceof Error ? cause.message : "a defect"}`,
      }),
      cause,
    );

  const sessionDirectory = (id: SessionId) => path.join(stateDirectory, id);

  const turnFile = (id: SessionId, turn: Bridge.TurnId) =>
    path.join(sessionDirectory(id), `${turn}.jsonl`);

  const appendLine = (file: string, line: typeof TurnLine.Type) =>
    Effect.flatMap(Schema.encodeEffect(TurnLineJson)(line), (json) =>
      fs.writeFileString(file, `${json}\n`, { flag: "a" }),
    );

  /** The session `id`, which the bridge must have started. */
  const startedSession = (id: SessionId) =>
    Effect.suspend(() => {
      const started = sessions.get(id);
      return started === undefined
        ? Effect.fail(
            harnessError(
              new NotFoundError({ description: `The bridge has not started the session ${id}` }),
            ),
          )
        : Effect.succeed(started);
    });

  /** Starts a session in a scope of its own, which closes again if the driver fails to start it. */
  const startSession = Effect.fnUntraced(function* (options: Bridge.StartSessionOptions) {
    const scope = yield* Scope.fork(bridgeScope);
    const driverSession = yield* driver.startSession(options).pipe(
      Scope.provide(scope),
      Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause))),
    );
    const started: StartedSession = { driverSession, scope, turn: undefined, fiber: undefined };
    sessions.set(options.id, started);
    return started;
  });

  /** Ends a session the bridge started, interrupting its turn. */
  const endSession = (id: SessionId, started: StartedSession) =>
    Effect.andThen(
      Scope.close(started.scope, Exit.void),
      Effect.sync(() => sessions.delete(id)),
    );

  /** Aborts the session's running turn, returning once the turn has ended. */
  const abortTurn = (started: StartedSession) =>
    started.fiber === undefined ? Effect.void : Fiber.interrupt(started.fiber);

  /** Runs `turn` to its end, keeping each part as it streams, then how the turn ended. */
  const runTurn = (
    driverSession: Bridge.DriverSession,
    turn: Turn,
    options: Bridge.TurnOptions,
    file: string,
  ) =>
    driverSession.promptTurn(options).pipe(
      Stream.runForEach((part) => {
        const numbered: Bridge.NumberedPart = { seq: turn.parts.length + 1, part };
        return appendLine(file, numbered).pipe(
          Effect.andThen(Effect.sync(() => turn.parts.push(numbered))),
          Effect.andThen(SubscriptionRef.set(turn.progress, { count: numbered.seq })),
        );
      }),
      Effect.onExit((exit) => {
        const end = endOf(exit, bridgeFailure);
        // Should this fail, the file has no end, so a bridge started again treats the turn as lost.
        return Effect.andThen(
          Effect.ignore(appendLine(file, { end })),
          SubscriptionRef.set(turn.progress, { count: turn.parts.length, end }),
        );
      }),
      // How the turn ended, failure included, is kept for its readers.
      Effect.ignore,
    );

  /**
   * The turn `id` kept in `file`, if the bridge has its file. A turn the bridge was running when it
   * died has no end there, and ended then, aborted.
   */
  const readTurnFile = (id: Bridge.TurnId, file: string) =>
    Effect.gen(function* () {
      const text = yield* fs.readFileString(file);
      const lines = yield* Effect.forEach(
        text.split("\n").filter((line) => line.length > 0),
        (line) => Schema.decodeEffect(TurnLineJson)(line),
      );
      const last = lines.at(-1);
      const parts = lines.filter((line) => "seq" in line);
      const progress = yield* SubscriptionRef.make<Progress>({
        count: parts.length,
        end: last !== undefined && "end" in last ? last.end : TurnEnd.cases.Aborted.make({}),
      });
      const turn: Turn = { id, parts, progress };
      return turn;
    }).pipe(Effect.orElseSucceed(() => undefined));

  /**
   * How the bridge starts the session's turn `id` when a host asks it to, from the turn as the
   * bridge has it, in memory or else in the turn's file. A turn it aborted, as it aborts the turns
   * it runs when it exits or dies, continues in a conversation the agent kept, which holds it.
   */
  const turnStartOf = Effect.fnUntraced(function* (
    session: SessionId,
    started: StartedSession,
    id: Bridge.TurnId,
  ) {
    const previous =
      started.turn?.id === id ? started.turn : yield* readTurnFile(id, turnFile(session, id));
    if (previous === undefined) return TurnStart.New();
    const { end } = yield* SubscriptionRef.get(previous.progress);
    if (end?._tag !== "Aborted") return TurnStart.Started({ turn: previous });
    return started.driverSession.keptConversation
      ? TurnStart.Continue({ parts: finishedStepsOf(previous.parts) })
      : TurnStart.New();
  });

  return Bridge.Rpcs.of({
    Hello: () => Effect.succeed({ agent: driver.id, protocolVersion: Bridge.protocolVersion }),

    Exit: () => Effect.asVoid(exit),

    StartSession: ({ session, directory, history, agentState, unfinishedTurn }) =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const started =
            sessions.get(session) ??
            (yield* startSession({ id: session, directory, history, agentState }));
          const state = yield* started.driverSession.state;
          if (unfinishedTurn === undefined) return { hasUnfinishedTurn: false, agentState: state };
          const turnStart = yield* turnStartOf(session, started, unfinishedTurn);
          // A bridge started again has a turn that ended before it exited only in the turn's file.
          if (turnStart._tag === "Started") started.turn = turnStart.turn;
          return { hasUnfinishedTurn: turnStart._tag !== "New", agentState: state };
        }),
      ),

    StartTurn: ({ session, turn: id, options }) =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const started = yield* startedSession(session);
          const turnStart = yield* turnStartOf(session, started, id);
          if (turnStart._tag === "Started") {
            started.turn = turnStart.turn;
            return;
          }
          if (
            started.turn !== undefined &&
            (yield* SubscriptionRef.get(started.turn.progress)).end === undefined
          ) {
            return yield* harnessError(new TurnInProgressError({}));
          }
          // A session keeps only its latest turn; a turn it continues keeps the steps it finished.
          const kept = turnStart._tag === "Continue" ? turnStart.parts : [];
          const directory = sessionDirectory(session);
          const file = turnFile(session, id);
          yield* fs.remove(directory, { recursive: true, force: true });
          yield* fs.makeDirectory(directory, { recursive: true });
          yield* Effect.forEach(kept, (part) => appendLine(file, part), { discard: true });
          const turn: Turn = {
            id,
            parts: [...kept],
            progress: yield* SubscriptionRef.make<Progress>({ count: kept.length }),
          };
          const turnOptions =
            turnStart._tag === "Continue" ? { ...options, prompt: continuePrompt } : options;
          const fiber = yield* Effect.forkIn(
            runTurn(started.driverSession, turn, turnOptions, file),
            started.scope,
          );
          started.turn = turn;
          started.fiber = fiber;
        }).pipe(
          Effect.catchTag(["PlatformError", "SchemaError"], (error) =>
            Effect.fail(bridgeFailure(error)),
          ),
        ),
      ),

    ReadTurn: ({ session, turn: id, after }) =>
      Stream.unwrap(
        Effect.map(startedSession(session), ({ turn }) =>
          turn?.id === id
            ? readTurn(turn, after)
            : Stream.fail(
                harnessError(new NoTurnError({ description: `The session has no turn ${id}` })),
              ),
        ),
      ),

    AbortTurn: ({ session, turn }) =>
      Semaphore.withPermit(
        lock,
        Effect.flatMap(startedSession(session), (started) =>
          started.turn?.id === turn ? abortTurn(started) : Effect.void,
        ),
      ),

    SubmitToolResult: ({ session, result }) =>
      Effect.flatMap(startedSession(session), ({ driverSession }) =>
        driverSession.submitToolResult(result),
      ),

    Approve: ({ session, response }) =>
      Effect.flatMap(startedSession(session), ({ driverSession }) =>
        driverSession.approve(response),
      ),

    Compact: ({ session, instructions }) =>
      Effect.flatMap(startedSession(session), ({ driverSession }) =>
        driverSession.compact(instructions),
      ),

    ReadState: ({ session }) =>
      Effect.flatMap(startedSession(session), ({ driverSession }) => driverSession.state),

    StopSession: ({ session }) =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const started = yield* startedSession(session);
          yield* abortTurn(started);
          const state = yield* started.driverSession.state;
          yield* endSession(session, started);
          return state;
        }),
      ),

    DestroySession: ({ session }) =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const started = yield* startedSession(session);
          yield* abortTurn(started);
          yield* started.driverSession.destroy;
          yield* endSession(session, started);
          yield* fs
            .remove(sessionDirectory(session), { recursive: true, force: true })
            .pipe(Effect.mapError(bridgeFailure));
        }),
      ),
  });
});

/**
 * Streams `turn`'s parts numbered after `after`, then each new one, until its last. A turn that
 * failed fails the stream after its parts.
 */
const readTurn = (turn: Turn, after: number): Stream.Stream<Bridge.NumberedPart, HarnessError> =>
  SubscriptionRef.changes(turn.progress).pipe(
    Stream.takeUntil((progress) => progress.end !== undefined),
    Stream.mapAccum(
      () => after,
      (read, { count }) => [Math.max(read, count), turn.parts.slice(read, count)] as const,
    ),
    Stream.concat(
      Stream.unwrap(
        Effect.map(SubscriptionRef.get(turn.progress), ({ end }) =>
          end?._tag === "Failed" ? Stream.fail(end.error) : Stream.empty,
        ),
      ),
    ),
  );

/** The parts of the steps a turn finished: those up to its last `finish-step`. */
const finishedStepsOf = (parts: ReadonlyArray<Bridge.NumberedPart>) =>
  parts.slice(0, parts.findLastIndex(({ part }) => part.type === "finish-step") + 1);

/**
 * How a turn whose run exited with `exit` ended. `bridgeFailure` gives the error for any failure
 * that is not the agent's, such as the bridge failing to keep a part.
 */
const endOf = (
  exit: Exit.Exit<void, unknown>,
  bridgeFailure: (cause: unknown) => HarnessError,
): TurnEnd => {
  if (Exit.isSuccess(exit)) return TurnEnd.cases.Finished.make({});
  if (Cause.hasInterruptsOnly(exit.cause)) return TurnEnd.cases.Aborted.make({});
  const error = Cause.findError(exit.cause);
  const cause = Result.isSuccess(error) ? error.success : Cause.squash(exit.cause);
  return TurnEnd.cases.Failed.make({
    error: cause instanceof HarnessError ? cause : bridgeFailure(cause),
  });
};

/**
 * Serves the protocol over WebSockets at `/`, opened only by a host that presents `token` as
 * `Authorization: Bearer <token>`.
 */
const layerProtocol = (token: Redacted.Redacted<string>) =>
  Layer.effect(RpcServer.Protocol)(
    Effect.gen(function* () {
      const { protocol, httpEffect } = yield* RpcServer.makeProtocolWithHttpEffectWebsocket;
      const router = yield* HttpRouter.HttpRouter;
      const expected = `Bearer ${Redacted.value(token)}`;
      yield* router.add("GET", "/", (request) =>
        isPresented(request.headers.authorization, expected)
          ? httpEffect
          : Effect.succeed(HttpServerResponse.empty({ status: 401 })),
      );
      return protocol;
    }),
  );
