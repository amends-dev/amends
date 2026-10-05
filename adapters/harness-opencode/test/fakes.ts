import { Network } from "@amends/sandbox-v2";
import { BunHttpServer } from "@effect/platform-bun";
import { Deferred, Effect, Fiber, Schema, Sink, Stream, SubscriptionRef } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { type ChildProcess, ChildProcessSpawner } from "effect/process";
import { ModelRef } from "../src/bridge/SessionEvent.ts";

/** An event as opencode's server sends it, of any type. */
interface RecordedEvent {
  readonly id: string;
  readonly type: string;
  readonly durable: {
    readonly aggregateID: string;
    readonly seq: number;
    readonly version: number;
  };
  readonly data: Readonly<Record<string, unknown>>;
}

/** A turn the fake server runs for a prompt it admitted. */
export interface FakeTurn {
  /** The prompt's text. */
  readonly prompt: string;

  /** The model the session runs on. */
  readonly model: ModelRef | undefined;

  /** Records the session's next event, with the fields every event in a session has. */
  readonly record: (type: string, data: Readonly<Record<string, unknown>>) => Effect.Effect<void>;
}

export interface FakeOpencodeOptions {
  /** Runs before the server says whether it has a provider, as while opencode loads its models. */
  readonly loadingProvider?: Effect.Effect<void>;

  /** Runs before the server admits a prompt. */
  readonly admitting?: Effect.Effect<void>;

  /**
   * Records what opencode records after it admits a prompt and before it takes it, such as the
   * failure of a call it was running when it stopped.
   */
  readonly takingPrompt?: (record: FakeTurn["record"]) => Effect.Effect<void>;
}

export interface FakeSession {
  readonly directory: string;
  readonly model: ModelRef | undefined;
  readonly events: ReadonlyArray<RecordedEvent>;
}

export interface FakeOpencode {
  /** The port the server listens on, on this machine. */
  readonly port: Network.Port;

  /** The requests the server took, in order, as `METHOD /path`. */
  readonly requests: ReadonlyArray<string>;

  /** The sessions the server has now, by id. */
  readonly sessions: Effect.Effect<ReadonlyMap<string, FakeSession>>;

  /** Deletes a session, as when the sandbox loses opencode's data. */
  readonly forget: (sessionID: string) => void;
}

interface Session {
  readonly directory: string;
  model: ModelRef | undefined;
  readonly events: SubscriptionRef.SubscriptionRef<ReadonlyArray<RecordedEvent>>;
}

/**
 * A fake of opencode's server, with the requests of its session API that the agent makes, which
 * runs each turn with `runTurn` after recording the turn's prompt. A session runs while its turn
 * does, and an interrupt interrupts the turn. An event of the type `fake.unreadable` reaches the
 * agent as something that is not an event, as from a broken connection. The server stops when the
 * scope closes.
 */
export const makeFakeOpencode = (
  runTurn: (turn: FakeTurn) => Effect.Effect<void>,
  options: FakeOpencodeOptions = {},
) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const sessions = new Map<string, Session>();
    const running = new Map<string, Fiber.Fiber<void>>();
    let created = 0;
    const requests: Array<string> = [];

    const recorderOf =
      (sessionID: string, session: Session) =>
      (type: string, data: Readonly<Record<string, unknown>>) =>
        SubscriptionRef.update(session.events, (events) => [
          ...events,
          {
            id: `evt_${events.length}`,
            type,
            durable: {
              aggregateID: sessionID,
              seq: events.length,
              version: type === "session.next.step.ended" ? 2 : 1,
            },
            data: { timestamp: 1_791_073_617_000 + events.length, sessionID, ...data },
          },
        ]);

    /** Answers a request about the session the path names, or 404 when the server has none. */
    const withSession = <E, R>(
      handle: (
        sessionID: string,
        session: Session,
      ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
    ) =>
      Effect.flatMap(HttpRouter.params, ({ sessionID = "" }) => {
        const session = sessions.get(sessionID);
        return session === undefined
          ? Effect.succeed(
              HttpServerResponse.jsonUnsafe({ message: "Session not found" }, { status: 404 }),
            )
          : handle(sessionID, session);
      });

    const eventsAfter = (session: Session, after: number) =>
      Effect.map(SubscriptionRef.get(session.events), (events) => events.slice(after + 1));

    const routes = HttpRouter.use((router) =>
      router.addAll([
        HttpRouter.route("GET", "/api/health", HttpServerResponse.jsonUnsafe({ healthy: true })),

        // The fake has opencode's own provider alone.
        HttpRouter.route(
          "GET",
          "/api/provider/:providerID",
          Effect.andThen(
            options.loadingProvider ?? Effect.void,
            Effect.map(HttpRouter.params, ({ providerID }) =>
              providerID === "opencode"
                ? HttpServerResponse.jsonUnsafe({ data: { id: providerID } })
                : HttpServerResponse.jsonUnsafe({ message: "Provider not found" }, { status: 404 }),
            ),
          ),
        ),

        HttpRouter.route(
          "POST",
          "/api/session",
          Effect.gen(function* () {
            const { location, model } = yield* HttpServerRequest.schemaBodyJson(CreateBody);
            created += 1;
            const sessionID = `ses_fake${created}`;
            const session: Session = {
              directory: location.directory,
              model,
              events: yield* SubscriptionRef.make<ReadonlyArray<RecordedEvent>>([]),
            };
            sessions.set(sessionID, session);
            yield* recorderOf(sessionID, session)("session.created", {});
            return HttpServerResponse.jsonUnsafe({ data: { id: sessionID } });
          }),
        ),

        HttpRouter.route(
          "GET",
          "/api/session/active",
          Effect.sync(() =>
            HttpServerResponse.jsonUnsafe({
              data: Object.fromEntries([...running.keys()].map((id) => [id, { type: "running" }])),
            }),
          ),
        ),

        HttpRouter.route(
          "GET",
          "/api/session/:sessionID",
          withSession((sessionID) =>
            Effect.succeed(HttpServerResponse.jsonUnsafe({ data: { id: sessionID } })),
          ),
        ),

        HttpRouter.route(
          "POST",
          "/api/session/:sessionID/prompt",
          withSession((sessionID, session) =>
            Effect.gen(function* () {
              const { prompt } = yield* HttpServerRequest.schemaBodyJson(PromptBody);
              yield* options.admitting ?? Effect.void;
              const record = recorderOf(sessionID, session);
              const input = { messageID: `msg_${sessionID}`, prompt, delivery: "steer" };
              yield* record("session.next.prompt.admitted", input);
              const admittedSeq = (yield* SubscriptionRef.get(session.events)).length - 1;
              const turn = (options.takingPrompt?.(record) ?? Effect.void).pipe(
                Effect.andThen(record("session.next.prompted", input)),
                Effect.andThen(runTurn({ prompt: prompt.text, model: session.model, record })),
                Effect.ensuring(Effect.sync(() => running.delete(sessionID))),
              );
              running.set(sessionID, yield* Effect.forkIn(turn, scope));
              return HttpServerResponse.jsonUnsafe({ data: { admittedSeq } });
            }),
          ),
        ),

        HttpRouter.route(
          "POST",
          "/api/session/:sessionID/model",
          withSession((sessionID, session) =>
            Effect.gen(function* () {
              const { model } = yield* HttpServerRequest.schemaBodyJson(ModelBody);
              session.model = model;
              yield* recorderOf(sessionID, session)("session.next.model.switched", { model });
              return HttpServerResponse.empty({ status: 204 });
            }),
          ),
        ),

        HttpRouter.route(
          "POST",
          "/api/session/:sessionID/interrupt",
          withSession((sessionID) => {
            const turn = running.get(sessionID);
            return Effect.as(
              turn === undefined ? Effect.void : Fiber.interrupt(turn),
              HttpServerResponse.empty({ status: 204 }),
            );
          }),
        ),

        HttpRouter.route(
          "GET",
          "/api/session/:sessionID/event",
          withSession((_sessionID, session) =>
            Effect.map(HttpServerRequest.schemaSearchParams(AfterParams), ({ after }) =>
              HttpServerResponse.stream(
                SubscriptionRef.changes(session.events).pipe(
                  // Each change holds every event so far; stream the ones after those streamed.
                  Stream.mapAccum(
                    () => Number(after ?? -1),
                    (last, events) => [Math.max(last, events.length - 1), events.slice(last + 1)],
                  ),
                  Stream.map((event) =>
                    event.type === "fake.unreadable"
                      ? "data: not an event\n\n"
                      : `data: ${JSON.stringify(event)}\n\n`,
                  ),
                  Stream.encodeText,
                ),
                { contentType: "text/event-stream" },
              ),
            ),
          ),
        ),

        HttpRouter.route(
          "GET",
          "/api/session/:sessionID/history",
          withSession((_sessionID, session) =>
            Effect.gen(function* () {
              const { after } = yield* HttpServerRequest.schemaSearchParams(AfterParams);
              const data = yield* eventsAfter(session, Number(after ?? -1));
              return HttpServerResponse.jsonUnsafe({ data, hasMore: false });
            }),
          ),
        ),

        HttpRouter.route(
          "POST",
          "/sync/replay",
          Effect.gen(function* () {
            const { events } = yield* HttpServerRequest.schemaBodyJson(ReplayBody);
            const sessionID = events[0]?.aggregateID ?? "";
            const session = sessions.get(sessionID);
            const recorded =
              session === undefined ? [] : yield* SubscriptionRef.get(session.events);
            if (
              session === undefined ||
              events.some((event, index) => event.seq !== recorded.length + index)
            ) {
              return HttpServerResponse.jsonUnsafe(
                { message: "Sequence mismatch" },
                { status: 500 },
              );
            }
            yield* SubscriptionRef.set(session.events, [
              ...recorded,
              ...events.map(({ id, aggregateID, seq, type, data }) => {
                const dot = type.lastIndexOf(".");
                return {
                  id,
                  type: type.slice(0, dot),
                  durable: { aggregateID, seq, version: Number(type.slice(dot + 1)) },
                  data,
                };
              }),
            ]);
            return HttpServerResponse.jsonUnsafe({ sessionID });
          }),
        ),

        HttpRouter.route(
          "DELETE",
          "/session/:sessionID",
          withSession((sessionID) =>
            Effect.sync(() => {
              sessions.delete(sessionID);
              return HttpServerResponse.jsonUnsafe(true);
            }),
          ),
        ),
      ]),
    );
    const app = yield* HttpRouter.toHttpEffect(routes);

    const server = yield* BunHttpServer.make({ hostname: "127.0.0.1", port: 0 });
    yield* server.serve(
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
        Effect.andThen(
          Effect.sync(() =>
            requests.push(`${request.method} ${new URL(request.url, "http://fake").pathname}`),
          ),
          app,
        ),
      ),
    );
    if (server.address._tag === "UnixPathAddress") {
      return yield* Effect.die("The fake server listens on no port");
    }

    const fake: FakeOpencode = {
      port: Network.Port.make(server.address.port),
      requests,
      sessions: Effect.map(
        Effect.forEach(sessions, ([sessionID, session]) =>
          Effect.map(SubscriptionRef.get(session.events), (events) => {
            const snapshot: FakeSession = {
              directory: session.directory,
              model: session.model,
              events,
            };
            return [sessionID, snapshot] as const;
          }),
        ),
        (entries) => new Map(entries),
      ),
      forget: (sessionID) => sessions.delete(sessionID),
    };
    return fake;
  });

export interface FakeServerProcesses {
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];

  /** The commands spawned, in order. */
  readonly spawned: ReadonlyArray<ChildProcess.Command>;

  /** Ends every server spawned so far, as when opencode's server crashes. */
  readonly exit: Effect.Effect<void>;
}

/**
 * A process spawner whose every process is opencode's server, announcing that it listens at `url`,
 * where a fake opencode serves, and running until `exit` or until the scope that spawned it closes.
 * The first `failing` servers exit before they listen, as a server that fails to start does.
 */
export const makeFakeServerProcesses = (url: string, options: { readonly failing?: number } = {}) =>
  Effect.gen(function* () {
    const spawned: Array<ChildProcess.Command> = [];
    const exited = yield* Deferred.make<void>();
    const exitCode = ChildProcessSpawner.ExitCode(1);
    const spawner = ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        spawned.push(command);
        const fails = spawned.length <= (options.failing ?? 0);
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(spawned.length),
          exitCode: fails ? Effect.succeed(exitCode) : Effect.as(Deferred.await(exited), exitCode),
          isRunning: Effect.map(Deferred.isDone(exited), (done) => !fails && !done),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: fails
            ? Stream.empty
            : Stream.encodeText(Stream.make(`opencode server listening on ${url}\n`)),
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    );
    const processes: FakeServerProcesses = {
      spawner,
      spawned,
      exit: Effect.asVoid(Deferred.succeed(exited, undefined)),
    };
    return processes;
  });

export interface ScriptedCommands {
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];

  /** Each command run, with its arguments, in order. */
  readonly ran: ReadonlyArray<ReadonlyArray<string>>;
}

/**
 * A process spawner that runs nothing, but answers each command with the output and exit code
 * `answer` gives it: none and 0 unless it says otherwise.
 */
export const makeScriptedCommands = (
  answer: (
    command: string,
    args: ReadonlyArray<string>,
  ) => { readonly output?: string; readonly code?: number },
): ScriptedCommands => {
  const ran: Array<ReadonlyArray<string>> = [];
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.suspend(() => {
      if (command._tag !== "StandardCommand") return Effect.die("Scripted commands are not piped");
      ran.push([command.command, ...command.args]);
      const { output = "", code = 0 } = answer(command.command, command.args);
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(ran.length),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(code)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.encodeText(Stream.make(output)),
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );
  return { spawner, ran };
};

const CreateBody = Schema.Struct({
  location: Schema.Struct({ directory: Schema.String }),
  model: Schema.optional(ModelRef),
});

const PromptBody = Schema.Struct({ prompt: Schema.Struct({ text: Schema.String }) });

const ModelBody = Schema.Struct({ model: ModelRef });

const AfterParams = Schema.Struct({ after: Schema.optional(Schema.String) });

const ReplayBody = Schema.Struct({
  directory: Schema.String,
  events: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      aggregateID: Schema.String,
      seq: Schema.Int,
      type: Schema.String,
      data: Schema.Record(Schema.String, Schema.Unknown),
    }),
  ),
});
