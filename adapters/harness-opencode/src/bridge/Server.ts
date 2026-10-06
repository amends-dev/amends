/**
 * opencode's server, which the bridge starts in its sandbox, and the requests the driver makes of it.
 * One server serves every session in the sandbox, each in its own directory. `start` runs the server
 * until the scope closes, listening only on 127.0.0.1, at a port the server picks, behind a password
 * that `start` makes and gives the server in its environment. The bridge is the server's only client
 * and lives exactly as long as it, so the password is kept nowhere else.
 *
 * opencode reads the configuration `start` is given from a directory that `start` makes for it and
 * removes when the scope closes, in place of the global configuration of the sandbox's user, which
 * opencode would read from under the home directory. A project's own configuration, in the
 * directory a session works in, applies over it.
 *
 * opencode's tools run with the server's environment, so the agent can read the password; it keeps
 * out everything else on the machine. A failed request fails with the `HarnessError` the driver
 * reports.
 */
import { HarnessError } from "@amends/harness-v2";
import {
  Crypto,
  Deferred,
  Effect,
  FileSystem,
  flow,
  Option,
  Path,
  type PlatformError,
  Record,
  Redacted,
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
  /** The command that runs opencode, such as `opencode`. */
  readonly command: string;

  /** opencode's configuration, as its `opencode.json` takes it. */
  readonly config: { readonly [key: string]: Schema.Json };

  /** Environment variables opencode runs with. */
  readonly env: Record.ReadonlyRecord<string, string>;
}

// TODO: Give `prompt` the files a user message carries, once a turn's prompt has files.
export interface Server {
  /** Completes when the server exits, which it does before the scope closes only when it fails. */
  readonly exited: Effect.Effect<void>;

  /** Starts a session working in `directory`, returning its id. */
  readonly createSession: (options: {
    readonly directory: string;
    readonly model?: ModelRef;
  }) => Effect.Effect<string, HarnessError.HarnessError>;

  /**
   * Whether opencode has loaded the model provider `providerID`, which a server loads a moment after
   * it starts answering, and only when it can use the provider.
   */
  readonly hasProvider: (providerID: string) => Effect.Effect<boolean, HarnessError.HarnessError>;

  /** Whether the server has the session, as it does unless the sandbox lost opencode's data. */
  readonly hasSession: (sessionID: string) => Effect.Effect<boolean, HarnessError.HarnessError>;

  /**
   * Gives the session a prompt, which starts a turn, or steers the turn running, returning the
   * number of the event that admitted it. The turn's events follow it.
   */
  readonly prompt: (
    sessionID: string,
    text: string,
  ) => Effect.Effect<number, HarnessError.HarnessError>;

  /** Runs the session's next turns on `model`. */
  readonly switchModel: (
    sessionID: string,
    model: ModelRef,
  ) => Effect.Effect<void, HarnessError.HarnessError>;

  /** Ends the session's running turn. Interrupting a session that runs none does nothing. */
  readonly interrupt: (sessionID: string) => Effect.Effect<void, HarnessError.HarnessError>;

  /** Whether opencode is running the session: working on a turn, from taking its prompt. */
  readonly isRunning: (sessionID: string) => Effect.Effect<boolean, HarnessError.HarnessError>;

  /** Deletes the session and everything it recorded. Deleting a deleted session succeeds. */
  readonly deleteSession: (sessionID: string) => Effect.Effect<void, HarnessError.HarnessError>;

  /**
   * The session's events numbered after `after`, or all of them, and then each new one as it
   * happens. The stream does not end by itself. Events of types the adapter does not read are left
   * out.
   */
  readonly events: (
    sessionID: string,
    after: number | undefined,
  ) => Stream.Stream<SessionEvent, HarnessError.HarnessError>;

  /**
   * The session's events numbered after `after` that it has recorded so far, ending with the last.
   * Events of types the adapter does not read are left out.
   */
  readonly history: (
    sessionID: string,
    after: number,
  ) => Stream.Stream<SessionEvent, HarnessError.HarnessError>;

  /**
   * Appends `events` to the session in `directory` they name, as if it had recorded them. They are
   * numbered on from the session's last event, without gaps.
   */
  readonly replay: (
    directory: string,
    events: ReadonlyArray<SessionEvent>,
  ) => Effect.Effect<void, HarnessError.HarnessError>;
}

// TODO: Stop a server left running by a bridge that died, as one killed does. In a process group of
// its own, the server outlives the bridge and goes on with the turn the bridge ran, while the next
// bridge's server continues the same session. AI SDK's harness leaves its server running so too.
// Its configuration, with the models' keys, stays in its directory with it.
/** Starts the server, which runs until the scope closes, and waits until it listens. */
export const start = Effect.fn("Server.start")(
  function* (options: ServerOptions) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const httpClient = yield* HttpClient.HttpClient;
    const crypto = yield* Crypto.Crypto;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const password = Redacted.make(Hex.encode(yield* crypto.randomBytes(32)));
    // opencode's session API reads its configuration from files alone, as here from the directory
    // `OPENCODE_CONFIG_DIR` names. The configuration holds the models' keys, so only the sandbox's
    // user can read it, as only they can read the directory.
    const configDirectory = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-config-" });
    yield* fs.writeFileString(
      path.join(configDirectory, "opencode.json"),
      JSON.stringify(options.config),
      { mode: 0o600 },
    );
    const process = yield* spawner.spawn(
      ChildProcess.make(options.command, ["serve", "--hostname=127.0.0.1", "--port=0"], {
        extendEnv: true,
        env: {
          ...options.env,
          OPENCODE_CONFIG_DIR: configDirectory,
          OPENCODE_SERVER_PASSWORD: Redacted.value(password),
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "inherit",
        // opencode's server does not always stop when it is asked to, so one that has not stopped
        // soon after is killed.
        forceKillAfter: "3 seconds",
      }),
    );
    const url = yield* awaitListening(process);
    const client = httpClient.pipe(
      HttpClient.mapRequest(
        flow(HttpClientRequest.prependUrl(url), HttpClientRequest.basicAuth("opencode", password)),
      ),
    );
    const clientOk = HttpClient.filterStatusOk(client);

    const send = (request: HttpClientRequest.HttpClientRequest) =>
      clientOk.execute(request).pipe(Effect.asVoid, Effect.mapError(fromRequestError));

    const server: Server = {
      exited: Effect.ignore(process.exitCode),

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

      // The session API has no route that deletes a session yet, so this is the server's older one.
      // It answers 404 for a session it does not have.
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
              harnessError(
                new HarnessError.InvalidOutputError({ description: cause.message }),
                cause,
              ),
            ),
          ),
        ),
    };
    return server;
  },
  Effect.catchTag("PlatformError", (error) => Effect.fail(fromPlatformError(error))),
);

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
 * The URL the server announces on its output once it listens. Fails when the server exits first,
 * or does not listen within 30 seconds. The output is read to its end, so that it never fills.
 */
const awaitListening = Effect.fnUntraced(function* (
  process: ChildProcessSpawner.ChildProcessHandle,
) {
  const listening = yield* Deferred.make<string>();
  yield* process.stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach((line) => {
      const url = /^opencode server listening on (\S+)/.exec(line)?.[1];
      return url === undefined ? Effect.void : Deferred.succeed(listening, url);
    }),
    Effect.ignore,
    Effect.forkScoped,
  );
  const unavailable = (description: string) =>
    harnessError(new HarnessError.UnavailableError({ description }));
  const exited = Effect.flatMap(process.exitCode, (code) =>
    Effect.fail(unavailable(`opencode's server exited with code ${code} before it listened`)),
  );
  return yield* Deferred.await(listening).pipe(
    Effect.raceFirst(exited),
    Effect.timeoutOrElse({
      duration: "30 seconds",
      orElse: () => Effect.fail(unavailable("opencode's server did not listen within 30 seconds")),
    }),
  );
});

/** The error a request that failed with `error` reports. */
const fromRequestError = (
  error: HttpClientError.HttpClientError | Schema.SchemaError | Sse.SseError | Sse.Retry,
) => {
  switch (error._tag) {
    case "HttpClientError": {
      const { reason } = error;
      const description = error.message;
      if (reason._tag === "TransportError") {
        return harnessError(new HarnessError.UnavailableError({ description }), error);
      }
      const status = reason._tag === "StatusCodeError" ? reason.response.status : undefined;
      return harnessError(
        status === 404
          ? new HarnessError.NotFoundError({ description })
          : status === 429 || (status !== undefined && status >= 500)
            ? new HarnessError.UnavailableError({ description })
            : new HarnessError.UnknownError({ description }),
        error,
      );
    }
    case "SchemaError":
    case "SseError":
      return harnessError(
        new HarnessError.InvalidOutputError({ description: error.message }),
        error,
      );
    case "Retry":
      return harnessError(
        new HarnessError.UnavailableError({ description: "opencode's server asked to be retried" }),
      );
  }
};

const fromPlatformError = (error: PlatformError.PlatformError) =>
  harnessError(new HarnessError.UnknownError({ description: error.message }), error);

const harnessError = (reason: HarnessError.HarnessErrorReason, cause?: unknown) =>
  new HarnessError.HarnessError({ agent: "opencode", reason, cause });
