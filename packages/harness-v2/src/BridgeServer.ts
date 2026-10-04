/**
 * The bridge's side of `Bridge.Rpcs`, which runs in the sandbox and serves an agent's sessions to
 * hosts. `layer` serves them over a WebSocket at `/`, refusing a host that does not present the
 * bridge's token, and `layerHandlers` is the same bridge without a transport. `readLaunchOptions`
 * reads what the host that launched the bridge gave it.
 *
 * Each session the bridge starts runs in a scope of its own until a host stops or destroys it. The
 * bridge runs the session's turns itself, one at a time, in that scope, so that a turn does not end
 * with the connection of the host that started it. It numbers a turn's parts as the turn streams
 * them and keeps them in memory and in a file in its state directory, a line each, followed by how
 * the turn ended. A session keeps only its latest turn, which hosts read from any number while it
 * runs and after it ends. A bridge started again reads a turn from its file, if the turn ended
 * before the bridge last exited.
 */
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
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
import { HttpRouter, type HttpServer, HttpServerResponse } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import type { SessionId } from "./Agent.ts";
import * as Bridge from "./Bridge.ts";
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

/** Serves `agent`'s sessions over a WebSocket at `/`, on the `HttpServer` provided. */
export const layer = (
  agent: Bridge.Agent,
  options: Options,
): Layer.Layer<never, never, HttpServer.HttpServer | FileSystem.FileSystem | Path.Path> =>
  HttpRouter.serve(
    RpcServer.layer(Bridge.Rpcs).pipe(
      Layer.provide([layerHandlers(agent, options), layerProtocol(options.token)]),
      Layer.provide(RpcSerialization.layerJson),
    ),
    { disableLogger: true },
  );

/** Handles `Bridge.Rpcs` for `agent`'s sessions, over whichever transport serves them. */
export const layerHandlers = (agent: Bridge.Agent, options: Pick<Options, "stateDirectory">) =>
  Bridge.Rpcs.toLayer(makeHandlers(agent, options.stateDirectory));

/** What the host that launched the bridge gave it on standard input, which the host then closes. */
export const readLaunchOptions = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio;
  const text = yield* stdio.stdin.pipe(Stream.decodeText(), Stream.mkString);
  return yield* Schema.decodeEffect(Schema.fromJsonString(Bridge.LaunchOptions))(text);
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
  readonly agentSession: Bridge.AgentSession;

  /** Closes when the session ends, interrupting its turn. */
  readonly scope: Scope.Closeable;

  /** The session's latest turn. */
  turn: Turn | undefined;

  /** The fiber running `turn`; none for a turn read from its file. */
  fiber: Fiber.Fiber<void> | undefined;
}

const makeHandlers = Effect.fnUntraced(function* (agent: Bridge.Agent, stateDirectory: string) {
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
    new HarnessError({ agent: agent.id, reason, cause });

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

  /** Starts a session in a scope of its own, which closes again if the agent fails to start it. */
  const startSession = Effect.fnUntraced(function* (options: Bridge.StartOptions) {
    const scope = yield* Scope.fork(bridgeScope);
    const agentSession = yield* agent.start(options).pipe(
      Scope.provide(scope),
      Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause))),
    );
    const started: StartedSession = { agentSession, scope, turn: undefined, fiber: undefined };
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
    agentSession: Bridge.AgentSession,
    turn: Turn,
    options: Bridge.TurnOptions,
    file: string,
  ) =>
    agentSession.prompt(options).pipe(
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
   * The turn `id` kept in `file`, if the file has its end. A turn the bridge was running when it
   * died has none.
   */
  const readTurnFile = (id: Bridge.TurnId, file: string) =>
    Effect.gen(function* () {
      const text = yield* fs.readFileString(file);
      const lines = yield* Effect.forEach(
        text.split("\n").filter((line) => line.length > 0),
        (line) => Schema.decodeEffect(TurnLineJson)(line),
      );
      const last = lines.at(-1);
      if (last === undefined || !("end" in last)) return undefined;
      const parts = lines.filter((line) => "seq" in line);
      const progress = yield* SubscriptionRef.make<Progress>({
        count: parts.length,
        end: last.end,
      });
      const turn: Turn = { id, parts, progress };
      return turn;
    }).pipe(Effect.orElseSucceed(() => undefined));

  return Bridge.Rpcs.of({
    Hello: () => Effect.succeed({ agent: agent.id }),

    StartSession: ({ session, directory, history, agentState, unfinishedTurn }) =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const started =
            sessions.get(session) ??
            (yield* startSession({ id: session, directory, history, agentState }));
          if (unfinishedTurn === undefined) return { hasUnfinishedTurn: false };
          if (started.turn === undefined) {
            started.turn = yield* readTurnFile(unfinishedTurn, turnFile(session, unfinishedTurn));
          }
          const { turn } = started;
          // A turn aborted, as the bridge aborts its turns when it exits, is not one to continue.
          return {
            hasUnfinishedTurn:
              turn?.id === unfinishedTurn &&
              (yield* SubscriptionRef.get(turn.progress)).end?._tag !== "Aborted",
          };
        }),
      ),

    StartTurn: ({ session, turn: id, options }) =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const started = yield* startedSession(session);
          if (started.turn?.id === id) return;
          if (
            started.turn !== undefined &&
            (yield* SubscriptionRef.get(started.turn.progress)).end === undefined
          ) {
            return yield* harnessError(new TurnInProgressError({}));
          }
          // A session keeps only its latest turn.
          const directory = sessionDirectory(session);
          yield* fs.remove(directory, { recursive: true, force: true });
          yield* fs.makeDirectory(directory, { recursive: true });
          const turn: Turn = {
            id,
            parts: [],
            progress: yield* SubscriptionRef.make<Progress>({ count: 0 }),
          };
          const fiber = yield* Effect.forkIn(
            runTurn(started.agentSession, turn, options, turnFile(session, id)),
            started.scope,
          );
          started.turn = turn;
          started.fiber = fiber;
        }).pipe(Effect.catchTag("PlatformError", (error) => Effect.fail(bridgeFailure(error)))),
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
      Effect.flatMap(startedSession(session), ({ agentSession }) =>
        agentSession.submitToolResult(result),
      ),

    Approve: ({ session, response }) =>
      Effect.flatMap(startedSession(session), ({ agentSession }) => agentSession.approve(response)),

    Compact: ({ session, instructions }) =>
      Effect.flatMap(startedSession(session), ({ agentSession }) =>
        agentSession.compact(instructions),
      ),

    ReadState: ({ session }) =>
      Effect.flatMap(startedSession(session), ({ agentSession }) => agentSession.state),

    StopSession: ({ session }) =>
      Semaphore.withPermit(
        lock,
        Effect.gen(function* () {
          const started = yield* startedSession(session);
          yield* abortTurn(started);
          const state = yield* started.agentSession.state;
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
          yield* started.agentSession.destroy;
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

/**
 * Whether `presented` is `expected`, compared in a time that does not depend on where they
 * differ, so that a caller cannot guess the token a character at a time.
 */
const isPresented = (presented: string | undefined, expected: string) => {
  if (presented === undefined || presented.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
};
