/**
 * The opencode server in a sandbox, and the requests the adapter makes of it. One server serves
 * every session in its sandbox, each in its own directory. `connect` starts the server the first
 * time and leaves it running after the host lets go, so that a turn goes on without the host; any
 * host connects to it again with the password the server keeps in the sandbox.
 *
 * The server listens on every interface of the sandbox, at a port the sandbox exposes, behind HTTP
 * basic authentication. A failed request fails with `ServerError`, which carries the harness's
 * reason for it, for the agent to report with the method that made the request.
 */
import { HarnessError } from "@amends/harness-v2";
import { type Network, Sandbox, type SandboxError } from "@amends/sandbox-v2";
import {
  Crypto,
  Effect,
  FileSystem,
  flow,
  Option,
  Path,
  type PlatformError,
  Redacted,
  Schedule,
  Schema,
  Stream,
} from "effect";
import { Hex, Sse } from "effect/encoding";
import {
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { type ModelRef, SessionEvent } from "./SessionEvent.ts";

export interface ServerOptions {
  /** The command that runs opencode in the sandbox, such as `opencode`. */
  readonly command: string;

  /** The port the server listens on. The sandbox must have been created with it. */
  readonly port: Network.Port;

  /** opencode's configuration, as its `opencode.json` takes it. */
  readonly config: { readonly [key: string]: Schema.Json };

  /** Environment variables opencode runs with, such as a model provider's API key. */
  readonly env: Readonly<Record<string, string>>;
}

/** A request to the server failed, for the harness's `reason`. */
export class ServerError extends Schema.TaggedError<ServerError>(
  "@amends/harness-opencode/ServerError",
)("ServerError", {
  reason: HarnessError.HarnessErrorReason,
  cause: Schema.optional(Schema.Defect()),
}) {}

// TODO: Give `prompt` the files a user message carries, once a turn's prompt has files.
// TODO: Read a session's events again when the connection drops mid-turn, after the last one
// delivered, once a host sees connections drop.
export interface Server {
  /** Starts a session working in `directory`, returning its id. */
  readonly createSession: (options: {
    readonly directory: string;
    readonly model?: ModelRef;
  }) => Effect.Effect<string, ServerError>;

  /**
   * Whether opencode has loaded the model provider `providerID`, which a server loads a moment after
   * it starts answering, and only when it can use the provider.
   */
  readonly hasProvider: (providerID: string) => Effect.Effect<boolean, ServerError>;

  /** Whether the server has the session, as it does unless the sandbox lost opencode's data. */
  readonly hasSession: (sessionID: string) => Effect.Effect<boolean, ServerError>;

  /**
   * Gives the session a prompt, which starts a turn, or steers the turn running, returning the
   * number of the event that admitted it. The turn's events follow it.
   */
  readonly prompt: (sessionID: string, text: string) => Effect.Effect<number, ServerError>;

  /** Runs the session's next turns on `model`. */
  readonly switchModel: (sessionID: string, model: ModelRef) => Effect.Effect<void, ServerError>;

  /** Ends the session's running turn. Interrupting a session that runs none does nothing. */
  readonly interrupt: (sessionID: string) => Effect.Effect<void, ServerError>;

  /** Whether opencode is running the session: working on a turn, from taking its prompt. */
  readonly isRunning: (sessionID: string) => Effect.Effect<boolean, ServerError>;

  /** Deletes the session and everything it recorded. Deleting a deleted session succeeds. */
  readonly deleteSession: (sessionID: string) => Effect.Effect<void, ServerError>;

  /**
   * The session's events numbered after `after`, or all of them, and then each new one as it
   * happens. The stream does not end by itself. Events of types the adapter does not read are left
   * out.
   */
  readonly events: (
    sessionID: string,
    after: number | undefined,
  ) => Stream.Stream<SessionEvent, ServerError>;

  /**
   * The session's events numbered after `after` that it has recorded so far, ending with the last.
   * Events of types the adapter does not read are left out.
   */
  readonly history: (sessionID: string, after: number) => Stream.Stream<SessionEvent, ServerError>;

  /**
   * Appends `events` to the session in `directory` they name, as if it had recorded them. They are
   * numbered on from the session's last event, without gaps.
   */
  readonly replay: (
    directory: string,
    events: ReadonlyArray<SessionEvent>,
  ) => Effect.Effect<void, ServerError>;
}

/** Connects to the server in `sandbox`, starting it when it is not running. */
export const connect = Effect.fn("Server.connect")(function* (
  sandbox: Sandbox.Sandbox["Service"],
  options: ServerOptions,
) {
  const httpClient = yield* HttpClient.HttpClient;
  const endpoint = yield* sandbox
    .endpoint(options.port, "http")
    .pipe(Effect.mapError(fromSandboxError));
  const password = yield* passwordIn(sandbox);
  const client = httpClient.pipe(
    HttpClient.mapRequest(
      flow(
        HttpClientRequest.prependUrl(endpoint.url),
        HttpClientRequest.setHeaders(
          Object.fromEntries(
            Object.entries(endpoint.headers).map(([name, value]) => [name, Redacted.value(value)]),
          ),
        ),
        HttpClientRequest.basicAuth("opencode", password),
      ),
    ),
  );
  const clientOk = HttpClient.filterStatusOk(client);

  // A server still starting can leave a request unanswered, so each check gives up after a while.
  const isAnswering = clientOk.get("/api/health").pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Health)),
    Effect.map((health) => health.healthy),
    Effect.timeout("2 seconds"),
    Effect.orElseSucceed(() => false),
  );
  if (!(yield* isAnswering)) yield* start(sandbox, options, password, isAnswering);

  const send = (request: HttpClientRequest.HttpClientRequest) =>
    clientOk.execute(request).pipe(Effect.asVoid, Effect.mapError(fromRequestError));

  const server: Server = {
    createSession: ({ directory, model }) =>
      HttpClientRequest.post("/api/session").pipe(
        HttpClientRequest.bodyJsonUnsafe({ location: { directory }, model }),
        clientOk.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(CreatedSession)),
        Effect.map((created) => created.data.id),
        Effect.mapError(fromRequestError),
      ),

    hasProvider: (providerID) =>
      client.get(`/api/provider/${encodeURIComponent(providerID)}`).pipe(
        Effect.flatMap(
          HttpClientResponse.filterStatus((status) => status === 200 || status === 404),
        ),
        Effect.map((response) => response.status === 200),
        Effect.mapError(fromRequestError),
      ),

    hasSession: (sessionID) =>
      client.get(`/api/session/${encodeURIComponent(sessionID)}`).pipe(
        Effect.flatMap(
          HttpClientResponse.filterStatus((status) => status === 200 || status === 404),
        ),
        Effect.map((response) => response.status === 200),
        Effect.mapError(fromRequestError),
      ),

    prompt: (sessionID, text) =>
      HttpClientRequest.post(`/api/session/${encodeURIComponent(sessionID)}/prompt`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ prompt: { text } }),
        clientOk.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(AdmittedPrompt)),
        Effect.map((admitted) => admitted.data.admittedSeq),
        Effect.mapError(fromRequestError),
      ),

    switchModel: (sessionID, model) =>
      send(
        HttpClientRequest.post(`/api/session/${encodeURIComponent(sessionID)}/model`).pipe(
          HttpClientRequest.bodyJsonUnsafe({ model }),
        ),
      ),

    interrupt: (sessionID) =>
      send(HttpClientRequest.post(`/api/session/${encodeURIComponent(sessionID)}/interrupt`)),

    isRunning: (sessionID) =>
      clientOk.get("/api/session/active").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ActiveSessions)),
        Effect.map((active) => Object.hasOwn(active.data, sessionID)),
        Effect.mapError(fromRequestError),
      ),

    deleteSession: (sessionID) =>
      client
        .del(`/session/${encodeURIComponent(sessionID)}`)
        .pipe(
          Effect.flatMap(
            HttpClientResponse.filterStatus((status) => status === 200 || status === 404),
          ),
          Effect.asVoid,
          Effect.mapError(fromRequestError),
        ),

    events: (sessionID, after) =>
      clientOk
        .get(`/api/session/${encodeURIComponent(sessionID)}/event`, {
          urlParams: after === undefined ? {} : { after: String(after) },
        })
        .pipe(
          Effect.map((response) => response.stream),
          Stream.unwrap,
          Stream.decodeText(),
          Stream.pipeThroughChannel(Sse.decodeDataSchema(StreamedEvent)),
          Stream.map((event) => event.data),
          Stream.filter(Schema.is(SessionEvent)),
          Stream.mapError(fromRequestError),
        ),

    history: (sessionID, after) =>
      Stream.paginate(after, (afterSeq) =>
        clientOk
          .get(`/api/session/${encodeURIComponent(sessionID)}/history`, {
            urlParams: { after: String(afterSeq) },
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(HistoryPage)),
            Effect.map(({ data, hasMore }) => {
              const last = data.at(-1);
              return [
                data.filter(Schema.is(SessionEvent)),
                hasMore && last !== undefined ? Option.some(last.durable.seq) : Option.none(),
              ] as const;
            }),
          ),
      ).pipe(Stream.mapError(fromRequestError)),

    replay: (directory, events) =>
      Effect.forEach(events, (event) => Schema.encodeEffect(SessionEvent)(event)).pipe(
        Effect.map((encoded) =>
          encoded.map(({ id, type, durable, data }) => ({
            id,
            aggregateID: durable.aggregateID,
            seq: durable.seq,
            type: `${type}.${durable.version}`,
            data,
          })),
        ),
        Effect.flatMap((rows) =>
          send(
            HttpClientRequest.post("/sync/replay").pipe(
              HttpClientRequest.bodyJsonUnsafe({ directory, events: rows }),
            ),
          ),
        ),
        Effect.catchTag("SchemaError", (cause) =>
          Effect.fail(
            new ServerError({
              reason: new HarnessError.InvalidOutputError({ description: cause.message }),
              cause,
            }),
          ),
        ),
      ),
  };
  return server;
});

const Health = Schema.Struct({ healthy: Schema.Boolean });

const CreatedSession = Schema.Struct({ data: Schema.Struct({ id: Schema.String }) });

const AdmittedPrompt = Schema.Struct({ data: Schema.Struct({ admittedSeq: Schema.Int }) });

/** The sessions the server is running, by id. */
const ActiveSessions = Schema.Struct({ data: Schema.Record(Schema.String, Schema.Unknown) });

/** An event of a type the adapter does not read, which `events` and `history` leave out. */
const OtherEvent = Schema.Struct({
  type: Schema.String.check(
    Schema.makeFilter((type: string) => !Object.hasOwn(SessionEvent.cases, type)),
  ),
  durable: Schema.Struct({ seq: Schema.Int }),
});

/**
 * An event as the server streams it. A known type that does not decode fails, rather than being
 * left out as an event of another type.
 */
const StreamedEvent = Schema.Union([SessionEvent, OtherEvent]);

/** A page of the session's history, with whether more follow it. */
const HistoryPage = Schema.Struct({ data: Schema.Array(StreamedEvent), hasMore: Schema.Boolean });

/**
 * The server's password, kept in the sandbox's working directory so that every host connecting to
 * the server uses the one it started with. The first host to connect creates it.
 */
const passwordIn = (sandbox: Sandbox.Sandbox["Service"]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const file = path.join(sandbox.workingDirectory, ".amends", "opencode-password");
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    const created = Hex.encode(yield* crypto.randomBytes(32));
    // Another host may have created it first; its password is the one the server has.
    yield* fs
      .writeFileString(file, created, { flag: "wx", mode: 0o600 })
      .pipe(Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void));
    return Redacted.make(yield* fs.readFileString(file));
  }).pipe(Effect.provide(Sandbox.layerServices(sandbox)), Effect.mapError(fromPlatformError));

/**
 * Starts the server and waits until it answers. Unreferenced, the server outlives the scope that
 * started it and the host; it stops with the sandbox.
 */
// TODO: Stop the server with the sandbox on the local provider too, once the sandbox contract says
// what becomes of a process that outlives the scope that spawned it; the local provider leaves it
// running.
const start = (
  sandbox: Sandbox.Sandbox["Service"],
  options: ServerOptions,
  password: Redacted.Redacted<string>,
  isAnswering: Effect.Effect<boolean>,
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const server = yield* spawner.spawn(
      ChildProcess.make(
        options.command,
        ["serve", "--hostname=0.0.0.0", `--port=${options.port}`],
        {
          cwd: sandbox.workingDirectory,
          extendEnv: true,
          env: {
            ...options.env,
            OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config),
            OPENCODE_SERVER_PASSWORD: Redacted.value(password),
          },
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        },
      ),
    );
    // Never referenced again, so the effect that would do so is dropped.
    yield* Effect.asVoid(server.unref);

    const answered = isAnswering.pipe(
      Effect.filterOrFail((answering) => answering),
      Effect.retry(Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "30 seconds" }))),
      Effect.mapError(
        () =>
          new HarnessError.UnavailableError({
            description: "opencode's server did not answer within 30 seconds",
          }),
      ),
    );
    // Another host starting the server at the same time takes the port first; this one then exits
    // while the other answers.
    const exited = Effect.flatMap(server.exitCode, (code) =>
      Effect.flatMap(isAnswering, (answering) =>
        answering
          ? Effect.void
          : Effect.fail(
              new HarnessError.UnavailableError({
                description: `opencode's server exited with code ${code} before it answered`,
              }),
            ),
      ),
    );
    yield* Effect.raceFirst(answered, exited).pipe(
      Effect.mapError((reason) =>
        reason._tag === "PlatformError" ? fromPlatformError(reason) : new ServerError({ reason }),
      ),
    );
  }).pipe(
    Effect.scoped,
    Effect.provide(Sandbox.layerServices(sandbox)),
    Effect.catchTag("PlatformError", (error) => Effect.fail(fromPlatformError(error))),
  );

/** The harness's reason for a request that failed with `error`. */
const fromRequestError = (
  error: HttpClientError.HttpClientError | Schema.SchemaError | Sse.SseError | Sse.Retry,
): ServerError => {
  switch (error._tag) {
    case "HttpClientError": {
      const { reason } = error;
      if (reason._tag === "TransportError") {
        return new ServerError({
          reason: new HarnessError.UnavailableError({ description: error.message }),
          cause: error,
        });
      }
      const status = reason._tag === "StatusCodeError" ? reason.response.status : undefined;
      const description = error.message;
      return new ServerError({
        reason:
          status === 404
            ? new HarnessError.NotFoundError({ description })
            : status === 429 || (status !== undefined && status >= 500)
              ? new HarnessError.UnavailableError({ description })
              : new HarnessError.UnknownError({ description }),
        cause: error,
      });
    }
    case "SchemaError":
    case "SseError":
      return new ServerError({
        reason: new HarnessError.InvalidOutputError({ description: error.message }),
        cause: error,
      });
    case "Retry":
      return new ServerError({
        reason: new HarnessError.UnavailableError({
          description: "opencode's server asked to be retried",
        }),
      });
  }
};

const fromSandboxError = (error: SandboxError.SandboxError) =>
  new ServerError({
    reason:
      error.reason._tag === "UnavailableError"
        ? new HarnessError.UnavailableError({ description: error.message })
        : new HarnessError.UnknownError({ description: error.message }),
    cause: error,
  });

const fromPlatformError = (error: PlatformError.PlatformError) =>
  new ServerError({
    reason: new HarnessError.UnknownError({ description: error.message }),
    cause: error,
  });
