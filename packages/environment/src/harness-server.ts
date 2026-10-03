/**
 * The harness server: the program a host uploads into a sandbox to run harnesses there, and the
 * protocol it serves. It runs in the background, apart from the host that started it, and carries
 * the harness contract over Effect RPC on HTTP. It keeps what its session reported, so a host that
 * comes back, or another one, attaches to the session still at work and collects what it missed.
 */
import { ConnectionImplementation } from "@amends/connection";
import { ModelInference } from "@amends/connection/model-inference";
import { Harness, HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import type { Sandbox } from "@amends/sandbox";
import { Crypto, Effect, Exit, Layer, PubSub, Schedule, Schema, Scope, Stream } from "effect";
import type { FileSystem, Path } from "effect";
import type { ChildProcessSpawner } from "effect/process";
import {
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import { Rpc, RpcClient, RpcClientError, RpcGroup, RpcSerialization, RpcServer } from "effect/rpc";
import { EnvironmentErrors } from "./errors.ts";

/**
 * The session a harness server starts: its ID, which the turn recorded, the harness, the session's
 * options, and the turn's model access, naming the connection's implementation for the server to
 * find its model code.
 */
export const StartOptions = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  harnessId: Harness.Name,
  instructions: Schema.optional(Schema.String),
  contextLimit: Schema.optional(Schema.Int),
  measured: Schema.optional(
    Schema.Struct({ responseId: Transcript.ResponseId, tokens: Schema.Int }),
  ),
  model: Schema.Struct({
    implementationId: ConnectionImplementation.Id,
    access: Schema.Struct({
      settings: Schema.Record(Schema.String, Schema.String),
      credential: Schema.optional(Schema.Redacted(Schema.String)),
    }),
    selection: Schema.Struct({ model: Schema.String }),
  }),
});
export interface StartOptions extends Schema.Schema.Type<typeof StartOptions> {}

/** The server does not hold the session: another replaced it, it ended, or the server restarted. */
export class SessionGone extends Schema.TaggedError<SessionGone>()("HarnessServer.SessionGone", {
  sessionId: Schema.String,
}) {}

/**
 * Where a session stands: working on what it was given, idle with nothing owed, or stopped, since
 * it failed, so it cannot go on.
 */
export const SessionState = Schema.Literals(["working", "idle", "stopped"]);
export type SessionState = typeof SessionState.Type;

/** What attaching to a session finds: what it reported after the events given, and where it stands. */
export const Attachment = Schema.Struct({
  missed: Schema.Array(HarnessEvent.Event),
  state: SessionState,
});
export interface Attachment extends Schema.Schema.Type<typeof Attachment> {}

const OfSession = { sessionId: Schema.NonEmptyString };
/** How many of the events a log keeps came before: those a request skips. */
const After = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** The harness contract's session as requests to the harness server, each naming its session. */
export const Rpcs = RpcGroup.make(
  Rpc.make("Ping"),
  Rpc.make("Start", { payload: StartOptions, error: HarnessErrors.ExecutionFailed }),
  Rpc.make("Attach", {
    payload: { ...OfSession, after: After },
    success: Attachment,
    error: SessionGone,
  }),
  Rpc.make("Prepare", {
    payload: { ...OfSession, transcript: Schema.Array(Transcript.Item) },
    error: Schema.Union([
      HarnessErrors.AlreadyPrepared,
      HarnessErrors.InvalidTranscript,
      HarnessErrors.Unsupported,
      HarnessErrors.ExecutionFailed,
      SessionGone,
    ]),
  }),
  Rpc.make("Submit", {
    payload: { ...OfSession, batch: HarnessEvent.InputBatch },
    error: Schema.Union([HarnessErrors.NotPrepared, HarnessErrors.ExecutionFailed, SessionGone]),
  }),
  Rpc.make("Resolve", {
    payload: { ...OfSession, callId: Transcript.ToolCallId, outcome: Transcript.ToolOutcome },
    error: Schema.Union([
      HarnessErrors.NotPrepared,
      HarnessErrors.NotPending,
      HarnessErrors.ExecutionFailed,
      SessionGone,
    ]),
  }),
  Rpc.make("Resume", {
    payload: OfSession,
    error: Schema.Union([HarnessErrors.NotPrepared, HarnessErrors.ExecutionFailed, SessionGone]),
  }),
  Rpc.make("Events", {
    payload: { ...OfSession, after: After },
    success: HarnessEvent.Event,
    error: Schema.Union([HarnessErrors.ExecutionFailed, SessionGone]),
    stream: true,
  }),
  Rpc.make("End", { payload: OfSession }),
  Rpc.make("Stop"),
);

/**
 * What a session in a harness server gets: the model both ways, as Effect AI model access and as
 * the endpoint a harness that speaks the provider's interface calls, and the sandbox's processes
 * and files, for a harness that runs a program of its own.
 */
export type SessionServices =
  | ModelInference.Services
  | ModelInference.Endpoint
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path;

/** The harnesses and model code a harness server runs. */
export interface Served {
  readonly harnesses: ReadonlyArray<Harness.Interface<SessionServices>>;
  readonly models: ReadonlyArray<ModelInference.Implementation>;
}

/** What a session's listeners receive: an event, with its place among those a log keeps, or its stop. */
type Delivery =
  | {
      readonly _tag: "Event";
      readonly event: HarnessEvent.Event;
      readonly index: number | undefined;
    }
  | { readonly _tag: "Stopped"; readonly failure: HarnessErrors.ExecutionFailed };

/** The session a harness server holds, and everything it reported that a log keeps. */
interface Hosted {
  readonly id: string;
  readonly session: Harness.Session;
  readonly scope: Scope.Closeable;
  readonly kept: Array<HarnessEvent.Event>;
  readonly deliveries: PubSub.PubSub<Delivery>;
  /** The batches it was given, so one given again, as by a host that came back, is given once. */
  readonly submitted: Set<string>;
  prepared: boolean;
  working: boolean;
  stopped: HarnessErrors.ExecutionFailed | undefined;
}

/** A failure starting the session: the host asked for code this server was not built with. */
const notServed = (what: string) =>
  new HarnessErrors.ExecutionFailed({
    reason: `The harness server doesn't run ${what}.`,
    retryable: false,
    problem: "unexpected",
  });

const sessionEnded = new HarnessErrors.ExecutionFailed({
  reason: "The harness session ended.",
  retryable: true,
  problem: "ended",
});

/** Where a session stands, as attaching reports it. */
const stateOf = (hosted: Hosted): SessionState =>
  hosted.stopped !== undefined ? "stopped" : hosted.working ? "working" : "idle";

/**
 * The handlers of a harness server that holds one session at a time: starting one ends the one
 * before, and the server ends it when it shuts down. The session keeps every event a log keeps
 * until another replaces it, so a host can attach and read what it missed.
 */
const makeHandlers = Effect.fnUntraced(function* (served: Served, stopServer: Effect.Effect<void>) {
  let current: Hosted | undefined;

  const find = (sessionId: string) =>
    current?.id === sessionId
      ? Effect.succeed(current)
      : Effect.fail(new SessionGone({ sessionId }));

  const endCurrent = Effect.suspend(() => {
    const hosted = current;
    current = undefined;
    return hosted === undefined ? Effect.void : Scope.close(hosted.scope, Exit.void);
  });
  // The server ends its session as it shuts down, so nothing the harness started outlives it.
  yield* Effect.addFinalizer(() => endCurrent);

  /** Keep an event a log keeps, note when the session has nothing left to do, and deliver it. */
  const keep = (hosted: Hosted, event: HarnessEvent.Event) =>
    Effect.suspend(() => {
      const index = HarnessEvent.isDelta(event) ? undefined : hosted.kept.push(event) - 1;
      if (HarnessEvent.Event.isAnyOf(["Idle", "ContextFull"])(event)) hosted.working = false;
      return PubSub.publish(hosted.deliveries, { _tag: "Event", event, index });
    });

  /** Note that the session stopped, and tell its listeners. */
  const stop = (hosted: Hosted, failure: HarnessErrors.ExecutionFailed) =>
    Effect.suspend(() => {
      hosted.stopped = failure;
      hosted.working = false;
      return PubSub.publish(hosted.deliveries, { _tag: "Stopped", failure });
    });

  const start = Effect.fnUntraced(function* (options: StartOptions) {
    yield* endCurrent;
    const harness = served.harnesses.find(
      (candidate) => candidate.declaration.id === options.harnessId,
    );
    if (harness === undefined) return yield* notServed(`the ${options.harnessId} harness`);
    const inference = served.models.find(
      (candidate) => candidate.declaration.id === options.model.implementationId,
    );
    if (inference === undefined)
      return yield* notServed(`${options.model.implementationId} models`);
    const scope = yield* Scope.make();
    const session = yield* Effect.gen(function* () {
      const { settings, credential } = options.model.access;
      const access = { settings, credential };
      const selection = options.model.selection;
      const model = yield* Layer.build(
        Layer.merge(
          inference.languageModel(access, selection),
          Layer.succeed(ModelInference.Endpoint, inference.endpoint(access, selection)),
        ),
      );
      return yield* harness
        .start({
          sessionId: options.sessionId,
          instructions: options.instructions,
          contextLimit: options.contextLimit,
          measured: options.measured,
        })
        .pipe(Effect.provideContext(model));
    }).pipe(Scope.provide(scope));
    const hosted: Hosted = {
      id: options.sessionId,
      session,
      scope,
      kept: [],
      deliveries: yield* PubSub.unbounded<Delivery>(),
      submitted: new Set(),
      prepared: false,
      working: false,
      stopped: undefined,
    };
    current = hosted;
    // However it ends, its listeners learn that it did.
    yield* Scope.addFinalizer(
      scope,
      Effect.suspend(() =>
        hosted.stopped === undefined ? stop(hosted, sessionEnded) : Effect.void,
      ),
    );
    yield* session.events.pipe(
      Stream.runForEach((event) => keep(hosted, event)),
      Effect.andThen(stop(hosted, sessionEnded)),
      Effect.catch((failure) => stop(hosted, failure)),
      Effect.forkIn(scope),
    );
  });

  /** The session's events after the first `after` it kept: those it kept, then as they come. */
  const eventsAfter = (sessionId: string, after: number) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const hosted = yield* find(sessionId);
        const deliveries = yield* PubSub.subscribe(hosted.deliveries);
        const missed = hosted.kept.slice(after);
        const next = after + missed.length;
        const live = Stream.fromSubscription(deliveries).pipe(
          Stream.filter(
            (delivery) =>
              delivery._tag === "Stopped" || delivery.index === undefined || delivery.index >= next,
          ),
          Stream.mapEffect((delivery) =>
            delivery._tag === "Stopped"
              ? Effect.fail(delivery.failure)
              : Effect.succeed(delivery.event),
          ),
        );
        return Stream.concat(
          Stream.fromIterable(missed),
          hosted.stopped === undefined ? live : Stream.fail(hosted.stopped),
        );
      }),
    );

  return Rpcs.of({
    Ping: () => Effect.void,
    Start: start,
    Attach: ({ sessionId, after }) =>
      Effect.flatMap(find(sessionId), (hosted) =>
        hosted.prepared
          ? Effect.succeed({ missed: hosted.kept.slice(after), state: stateOf(hosted) })
          : Effect.fail(new SessionGone({ sessionId })),
      ),
    Prepare: ({ sessionId, transcript }) =>
      Effect.flatMap(find(sessionId), (hosted) =>
        hosted.session.prepare(transcript).pipe(
          Effect.andThen(
            Effect.sync(() => {
              hosted.prepared = true;
            }),
          ),
        ),
      ),
    Submit: ({ sessionId, batch }) =>
      Effect.flatMap(find(sessionId), (hosted) => {
        if (hosted.submitted.has(batch.id)) return Effect.void;
        hosted.submitted.add(batch.id);
        hosted.working = true;
        return hosted.session.submit(batch);
      }),
    Resolve: ({ sessionId, callId, outcome }) =>
      Effect.flatMap(find(sessionId), (hosted) => {
        hosted.working = true;
        return hosted.session.resolve(callId, outcome);
      }),
    Resume: ({ sessionId }) =>
      Effect.flatMap(find(sessionId), (hosted) => {
        hosted.working = true;
        return hosted.session.resume;
      }),
    Events: ({ sessionId, after }) => eventsAfter(sessionId, after),
    End: ({ sessionId }) => (current?.id === sessionId ? endCurrent : Effect.void),
    Stop: () => endCurrent.pipe(Effect.andThen(stopServer)),
  });
});

/** Answers only requests that carry the server's token, since its address may be public. */
const requireToken = (token: string) =>
  HttpRouter.middleware(
    (httpEffect) =>
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
        request.headers.authorization === `Bearer ${token}`
          ? httpEffect
          : Effect.succeed(HttpServerResponse.empty({ status: 401 })),
      ),
    { global: true },
  );

/**
 * The harness server's routes: its protocol at `/rpc` as newline-delimited JSON over HTTP, for
 * requests that carry `token`. A host serves them with an HTTP server; `stop` is how the server
 * stops when asked to, after ending its session.
 */
export const layerRoutes = (
  served: Served,
  options: { readonly token: string; readonly stop: Effect.Effect<void> },
) =>
  Layer.mergeAll(
    RpcServer.layerHttp({ group: Rpcs, path: "/rpc", protocol: "http" }),
    requireToken(options.token),
  ).pipe(
    Layer.provide(Rpcs.toLayer(makeHandlers(served, options.stop))),
    Layer.provide(RpcSerialization.layerNdjson),
  );

/**
 * Where a host reaches a harness server: its address from outside the sandbox, and the headers
 * every request carries, the token among them.
 */
export interface Endpoint {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** A client of the harness server at `endpoint`, for the scope's lifetime. */
const connect = Effect.fnUntraced(function* (endpoint: Endpoint) {
  const httpClient = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest((request) =>
      request.pipe(
        HttpClientRequest.prependUrl(`${endpoint.url}/rpc`),
        HttpClientRequest.setHeaders(endpoint.headers),
      ),
    ),
  );
  const protocol = yield* RpcClient.makeProtocolHttp(httpClient).pipe(
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.ndjson),
  );
  return yield* RpcClient.make(Rpcs).pipe(Effect.provideService(RpcClient.Protocol, protocol));
});
type Client = Effect.Success<ReturnType<typeof connect>>;

/** The session failing because the harness server could not be reached or no longer holds it. */
const ended = (error: RpcClientError.RpcClientError | SessionGone) =>
  new HarnessErrors.ExecutionFailed({
    reason:
      error._tag === "HarnessServer.SessionGone"
        ? "The harness server no longer holds the session."
        : `The harness server stopped answering: ${error.message}`,
    retryable: true,
    problem: "ended",
  });

/** A request the harness server could not answer, or whose session it lost, fails as `ended`. */
const failEnded = <A, E>(
  request: Effect.Effect<A, E | RpcClientError.RpcClientError | SessionGone>,
): Effect.Effect<
  A,
  Exclude<E, RpcClientError.RpcClientError | SessionGone> | HarnessErrors.ExecutionFailed
> =>
  Effect.mapError(request, (error) =>
    error instanceof RpcClientError.RpcClientError || error instanceof SessionGone
      ? ended(error)
      : (error as Exclude<E, RpcClientError.RpcClientError | SessionGone>),
  );

/**
 * How often reading events again follows losing the connection, as when a proxy closes a quiet
 * one: soon, then less often, for about eight seconds.
 */
const reconnect = Schedule.while(
  Schedule.exponential("250 millis"),
  ({ input, attempt }) => input instanceof RpcClientError.RpcClientError && attempt <= 5,
);

/**
 * The session as the harness contract's session. Its events continue after the first `kept` a log
 * keeps; reading them again after the connection drops continues after those it delivered.
 */
const remoteSession = (client: Client, sessionId: string, kept: number): Harness.Session => {
  let delivered = kept;
  return {
    prepare: (transcript) => failEnded(client.Prepare({ sessionId, transcript })),
    submit: (batch) => failEnded(client.Submit({ sessionId, batch })),
    resolve: (callId, outcome) => failEnded(client.Resolve({ sessionId, callId, outcome })),
    resume: failEnded(client.Resume({ sessionId })),
    events: Stream.suspend(() => client.Events({ sessionId, after: delivered })).pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          if (!HarnessEvent.isDelta(event)) delivered += 1;
        }),
      ),
      Stream.retry(reconnect),
      Stream.mapError((error) =>
        error instanceof RpcClientError.RpcClientError || error instanceof SessionGone
          ? ended(error)
          : error,
      ),
    ),
  };
};

/**
 * Ends the session when the scope closes, unless it closes because the run was cut short: then the
 * session goes on, for the next run to attach to.
 */
const endWithScope = (client: Client, sessionId: string) =>
  Effect.addFinalizer((exit) =>
    Exit.hasInterrupts(exit) ? Effect.void : Effect.ignore(client.End({ sessionId })),
  );

/**
 * Starts a session in the harness server at `endpoint`, replacing any it held, and returns it as
 * the harness contract's session. It ends when the scope closes, unless the run is cut short.
 */
export const startSession = Effect.fnUntraced(function* (
  endpoint: Endpoint,
  options: StartOptions,
) {
  const client = yield* connect(endpoint);
  yield* endWithScope(client, options.sessionId);
  yield* failEnded(client.Start(options));
  return remoteSession(client, options.sessionId, 0);
});

/** A session found still held, with what it reported after the events the turn recorded. */
export interface Attached extends Attachment {
  readonly session: Harness.Session;
}

/**
 * Attaches to the session `sessionId` if the harness server at `endpoint` still holds it, prepared:
 * what it reported after the first `recorded` events a log keeps, where it stands, and the session,
 * whose events continue after those. Like a started one, it ends when the scope closes.
 */
export const attachSession = Effect.fnUntraced(function* (
  endpoint: Endpoint,
  session: { readonly sessionId: string; readonly recorded: number },
) {
  const client = yield* connect(endpoint);
  const attachment = yield* client
    .Attach({ sessionId: session.sessionId, after: session.recorded })
    .pipe(
      Effect.catchTag("HarnessServer.SessionGone", () => Effect.undefined),
      Effect.mapError(ended),
    );
  if (attachment === undefined) return undefined;
  yield* endWithScope(client, session.sessionId);
  const attached: Attached = {
    ...attachment,
    session: remoteSession(client, session.sessionId, session.recorded + attachment.missed.length),
  };
  return attached;
});

/** A sandbox's operating system and processor, as Bun names its build targets: `linux-x64`. */
export type Platform = `${"linux" | "darwin"}-${"x64" | "arm64"}`;

/** The harness server built for one platform. `version` changes whenever its contents do. */
export interface Binary {
  readonly version: string;
  readonly data: Uint8Array;
}

/** The harness server a host uploads into sandboxes: the harnesses it runs, and its builds. */
export interface Program {
  readonly harnesses: ReadonlyArray<Harness.Name>;
  readonly binary: (
    platform: Platform,
  ) => Effect.Effect<Binary, EnvironmentErrors.UnsupportedPlatform>;
}

const systems: Record<string, "linux" | "darwin"> = { Linux: "linux", Darwin: "darwin" };
const processors: Record<string, "x64" | "arm64"> = {
  x86_64: "x64",
  amd64: "x64",
  aarch64: "arm64",
  arm64: "arm64",
};

/** The platform `uname -s` and `uname -m` describe, if the harness server builds for it. */
export const platformOf = (system: string, processor: string): Platform | undefined => {
  const os = systems[system];
  const cpu = processors[processor];
  return os === undefined || cpu === undefined ? undefined : `${os}-${cpu}`;
};

/**
 * The version of the protocol this package's server and client speak. Raise it whenever `Rpcs`
 * change in a way a server or client built before could not follow, so a host that finds a server
 * speaking another version replaces it rather than talking past it.
 */
export const protocolVersion = 1;

/** Where the harness server lives in a sandbox: its platform, and its directory and state file. */
interface Location {
  readonly platform: Platform;
  readonly home: string;
  readonly statePath: string;
}

/**
 * Where the harness server lives in the sandbox: a directory in its temporary directory, holding
 * the builds and a state file for each sandbox, by the sandbox's ID, since sandboxes on one
 * machine can share a temporary directory.
 */
const locate = Effect.fnUntraced(function* (sandbox: Sandbox.Running) {
  const probe = yield* sandbox.exec({
    argv: ["sh", "-c", 'uname -s; uname -m; printf "%s" "${TMPDIR:-/tmp}"'],
  });
  const [system = "", processor = "", temporary = ""] = probe.stdout.split("\n");
  const platform = platformOf(system.trim(), processor.trim());
  if (probe.exitCode !== 0 || platform === undefined || temporary === "")
    return yield* new EnvironmentErrors.UnsupportedPlatform({
      platform: `${system.trim()} ${processor.trim()}`.trim(),
    });
  const home = `${temporary.replace(/\/+$/u, "")}/amends-harness-server`;
  return { platform, home, statePath: `${home}/${sandbox.id}.json` } satisfies Location;
});

/**
 * Puts the harness server built for the sandbox's platform in its temporary directory, unless that
 * version is already there, and returns its path. A new version is written beside it and renamed
 * into place, so a sandbox never runs a partly written one.
 */
const upload = Effect.fnUntraced(function* (
  sandbox: Sandbox.Running,
  program: Program,
  location: Location,
) {
  const crypto = yield* Crypto.Crypto;
  const binary = yield* program.binary(location.platform);
  const executable = `${location.home}/${binary.version}/harness-server`;
  const present = yield* sandbox.exec({ argv: ["test", "-x", executable] });
  if (present.exitCode === 0) return executable;
  const partial = `${executable}.${yield* Effect.orDie(crypto.randomUUIDv4)}`;
  yield* sandbox.writeFile(partial, binary.data);
  const installed = yield* sandbox.exec({
    argv: ["sh", "-c", 'chmod +x "$0" && mv -f "$0" "$1"', partial, executable],
  });
  if (installed.exitCode !== 0)
    return yield* new EnvironmentErrors.SetupFailed({
      command: "install the harness server",
      ...installed,
    });
  return executable;
});

/**
 * Where a running harness server listens, its token, and the protocol version it speaks, as it
 * writes them once it listens.
 */
export const State = Schema.Struct({
  port: Schema.Int,
  token: Schema.NonEmptyString,
  protocolVersion: Schema.Int,
});
export interface State extends Schema.Schema.Type<typeof State> {}
export const StateJson = Schema.fromJsonString(State);

/** The state the harness server wrote in the sandbox, if it did. */
const readState = (sandbox: Sandbox.Running, path: string) =>
  Effect.flatMap(sandbox.exec({ argv: ["cat", path] }), (result) =>
    result.exitCode === 0
      ? Effect.map(Effect.option(Schema.decodeEffect(StateJson)(result.stdout)), (state) =>
          state._tag === "Some" ? state.value : undefined,
        )
      : Effect.undefined,
  );

/** How to reach the server that wrote `state`, through the sandbox's exposure of its port. */
const endpointOf = (sandbox: Sandbox.Running, state: State) =>
  Effect.map(sandbox.expose(state.port), (exposure): Endpoint => ({
    url: exposure.url.replace(/\/+$/u, ""),
    headers: { ...exposure.headers, authorization: `Bearer ${state.token}` },
  }));

/** Whether the server at `endpoint` answers, with that token, within a few seconds. */
const answers = (endpoint: Endpoint) =>
  Effect.scoped(Effect.flatMap(connect(endpoint), (client) => client.Ping())).pipe(
    Effect.timeout("5 seconds"),
    Effect.match({ onFailure: () => false, onSuccess: () => true }),
  );

/** Ask the server that wrote `state` to stop; one that does not answer is gone already. */
const askToStop = (sandbox: Sandbox.Running, state: State) =>
  endpointOf(sandbox, state).pipe(
    Effect.flatMap((endpoint) =>
      Effect.scoped(Effect.flatMap(connect(endpoint), (client) => client.Stop())),
    ),
    Effect.timeout("5 seconds"),
    Effect.ignore,
  );

/**
 * Makes sure a harness server is running in the sandbox, and returns how to reach it. One already
 * running is kept while it speaks this protocol version and answers, whichever host started it, so
 * a session it holds carries on, as in a sandbox acquired again; one speaking another version is
 * stopped. Otherwise the program is uploaded and started in the background, so it outlives this
 * host, and reached once it says where it listens.
 */
export const ensureRunning = Effect.fnUntraced(function* (
  sandbox: Sandbox.Running,
  program: Program,
) {
  const location = yield* locate(sandbox);
  const existing = yield* readState(sandbox, location.statePath);
  if (existing !== undefined && existing.protocolVersion === protocolVersion) {
    const endpoint = yield* endpointOf(sandbox, existing);
    if (yield* answers(endpoint)) return endpoint;
  } else if (existing !== undefined) yield* askToStop(sandbox, existing);
  const executable = yield* upload(sandbox, program, location);
  yield* sandbox.exec({ argv: ["rm", "-f", location.statePath] });
  yield* sandbox.spawn({ argv: [executable, location.statePath] });
  const silent = new EnvironmentErrors.HarnessServerFailed({
    reason: "The harness server didn't say where it listens within 15 seconds.",
  });
  const started = yield* readState(sandbox, location.statePath).pipe(
    Effect.filterOrFail(
      (state): state is State => state !== undefined,
      () => silent,
    ),
    Effect.retry(
      Schedule.while(
        Schedule.spaced("100 millis"),
        ({ input, elapsed }) => input === silent && elapsed < 15_000,
      ),
    ),
  );
  const endpoint = yield* endpointOf(sandbox, started);
  if (!(yield* answers(endpoint)))
    return yield* new EnvironmentErrors.HarnessServerFailed({
      reason: "The harness server started but doesn't answer.",
    });
  return endpoint;
});

/**
 * Stops the harness server serving the sandbox, if one runs, ending its session, so releasing the
 * sandbox leaves nothing at work, even with a provider whose stopping would leave it running, as
 * when a host that started it is gone.
 */
export const stopRunning = Effect.fnUntraced(function* (sandbox: Sandbox.Running) {
  const location = yield* locate(sandbox).pipe(
    Effect.catchTag("Environment.UnsupportedPlatform", () => Effect.undefined),
  );
  if (location === undefined) return;
  const state = yield* readState(sandbox, location.statePath);
  if (state === undefined) return;
  yield* askToStop(sandbox, state);
  yield* sandbox.exec({ argv: ["rm", "-f", location.statePath] });
});

export * as HarnessServer from "./harness-server.ts";
