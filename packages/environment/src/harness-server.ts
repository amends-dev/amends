/**
 * The harness server: the program a host uploads into a sandbox to run a harness there, and the
 * protocol it serves. It carries the harness contract over Effect RPC on the program's standard
 * input and output, one session per process, so a turn drives a harness in a sandbox exactly as
 * one in process.
 */
import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { Harness, HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import type { Sandbox } from "@amends/sandbox";
import { Crypto, Deferred, Effect, Layer, Schema, Scope, Stream } from "effect";
import {
  Rpc,
  RpcClient,
  RpcClientError,
  RpcGroup,
  type RpcMessage,
  RpcSerialization,
  RpcServer,
} from "effect/rpc";
import { EnvironmentErrors } from "./errors.ts";

/**
 * The session a harness server starts: the harness, the session's options, and the turn's model
 * access, naming the connection's implementation for the server to find its model code.
 */
export const StartOptions = Schema.Struct({
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

/** The harness contract's session, as requests to the harness server. */
export const Rpcs = RpcGroup.make(
  Rpc.make("Start", { payload: StartOptions, error: HarnessErrors.ExecutionFailed }),
  Rpc.make("Prepare", {
    payload: { transcript: Schema.Array(Transcript.Item) },
    error: Schema.Union([
      HarnessErrors.AlreadyPrepared,
      HarnessErrors.InvalidTranscript,
      HarnessErrors.Unsupported,
      HarnessErrors.ExecutionFailed,
    ]),
  }),
  Rpc.make("Submit", {
    payload: { batch: HarnessEvent.InputBatch },
    error: Schema.Union([HarnessErrors.NotPrepared, HarnessErrors.ExecutionFailed]),
  }),
  Rpc.make("Resolve", {
    payload: { callId: Transcript.ToolCallId, outcome: Transcript.ToolOutcome },
    error: Schema.Union([
      HarnessErrors.NotPrepared,
      HarnessErrors.NotPending,
      HarnessErrors.ExecutionFailed,
    ]),
  }),
  Rpc.make("Resume", {
    error: Schema.Union([HarnessErrors.NotPrepared, HarnessErrors.ExecutionFailed]),
  }),
  Rpc.make("Events", {
    success: HarnessEvent.Event,
    error: HarnessErrors.ExecutionFailed,
    stream: true,
  }),
);

/** The harnesses and model code a harness server runs. */
export interface Served {
  readonly harnesses: ReadonlyArray<Harness.Interface<ModelInference.Services>>;
  readonly models: ReadonlyArray<ModelInference.Implementation>;
}

/** A failure starting the session: the host asked for code this server was not built with. */
const notServed = (what: string) =>
  new HarnessErrors.ExecutionFailed({
    reason: `The harness server doesn't run ${what}.`,
    retryable: false,
    problem: "unexpected",
  });

/**
 * The handlers for one session. `Start` starts it for the server's lifetime, which ends when the
 * host closes its input; every other request waits for it.
 */
const handlers = (served: Served) =>
  Rpcs.toLayer(
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const crypto = yield* Crypto.Crypto;
      const started = yield* Deferred.make<Harness.Session>();
      const session = Deferred.await(started);

      const start = Effect.fnUntraced(function* (options: StartOptions) {
        if (yield* Deferred.isDone(started))
          return yield* Effect.die("The harness server's session already started.");
        const harness = served.harnesses.find(
          (candidate) => candidate.declaration.id === options.harnessId,
        );
        if (harness === undefined) return yield* notServed(`the ${options.harnessId} harness`);
        const inference = served.models.find(
          (candidate) => candidate.declaration.id === options.model.implementationId,
        );
        if (inference === undefined)
          return yield* notServed(`${options.model.implementationId} models`);
        const { settings, credential } = options.model.access;
        const model = yield* Layer.build(
          inference.languageModel({ settings, credential }, options.model.selection),
        );
        const harnessSession = yield* harness
          .start({
            sessionId: `session-${yield* Effect.orDie(crypto.randomUUIDv4)}`,
            instructions: options.instructions,
            contextLimit: options.contextLimit,
            measured: options.measured,
          })
          .pipe(Effect.provideContext(model));
        yield* Deferred.succeed(started, harnessSession);
      });

      return Rpcs.of({
        Start: (options) => start(options).pipe(Scope.provide(scope)),
        Prepare: ({ transcript }) =>
          Effect.flatMap(session, (harnessSession) => harnessSession.prepare(transcript)),
        Submit: ({ batch }) =>
          Effect.flatMap(session, (harnessSession) => harnessSession.submit(batch)),
        Resolve: ({ callId, outcome }) =>
          Effect.flatMap(session, (harnessSession) => harnessSession.resolve(callId, outcome)),
        Resume: () => Effect.flatMap(session, (harnessSession) => harnessSession.resume),
        Events: () => Stream.unwrap(Effect.map(session, (harnessSession) => harnessSession.events)),
      });
    }),
  );

/**
 * The harness server, serving one session over standard input and output as newline-delimited
 * JSON. It stops when its input ends.
 */
export const layer = (served: Served) =>
  RpcServer.layer(Rpcs).pipe(
    Layer.provide(handlers(served)),
    Layer.provide(RpcServer.layerProtocolStdio),
    Layer.provide(RpcSerialization.layerNdjson),
  );

/** The session failing because the harness server or the connection to it ended. */
const ended = (error: RpcClientError.RpcClientError) =>
  new HarnessErrors.ExecutionFailed({
    reason: `The harness server stopped answering: ${error.message}`,
    retryable: true,
    problem: "ended",
  });

/** A request the harness server could not answer fails as `ended`. */
const failEnded = <A, E>(
  request: Effect.Effect<A, E | RpcClientError.RpcClientError>,
): Effect.Effect<A, Exclude<E, RpcClientError.RpcClientError> | HarnessErrors.ExecutionFailed> =>
  Effect.mapError(request, (error) =>
    error instanceof RpcClientError.RpcClientError
      ? ended(error)
      : (error as Exclude<E, RpcClientError.RpcClientError>),
  );

/**
 * The client side of the protocol over a harness server's process: requests as lines on its
 * standard input, responses read from its standard output. Its standard error is the server's log.
 * Once the process ends, every request outstanding or made after fails.
 */
const makeProtocol = (process: Sandbox.Process) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse, clientIds) {
      const serialization = RpcSerialization.ndjson;
      const parser = serialization.makeUnsafe();
      let failure: RpcClientError.RpcClientError | undefined;
      const broadcast = (response: RpcMessage.FromServerEncoded) =>
        Effect.forEach(clientIds, (clientId) => writeResponse(clientId, response), {
          discard: true,
        });

      yield* process.output.pipe(
        Stream.runForEach((output) =>
          output.stream === "stderr"
            ? Effect.logDebug("Harness server", { log: output.text })
            : Effect.forEach(
                parser.decode(output.text) as ReadonlyArray<RpcMessage.FromServerEncoded>,
                broadcast,
                { discard: true },
              ),
        ),
        Effect.exit,
        Effect.flatMap((exit) => {
          failure = new RpcClientError.RpcClientError({
            reason: new RpcClientError.RpcClientDefect({
              message: "The harness server's process ended.",
              cause: exit,
            }),
          });
          return broadcast({ _tag: "ClientProtocolError", error: failure });
        }),
        Effect.forkScoped,
      );

      return {
        send: (_clientId, request) => {
          if (failure !== undefined) return Effect.fail(failure);
          const encoded = parser.encode(request);
          if (encoded === undefined) return Effect.void;
          return process.write(encoded as string).pipe(
            Effect.mapError(
              (cause) =>
                new RpcClientError.RpcClientError({
                  reason: new RpcClientError.RpcClientDefect({
                    message: "Writing to the harness server failed.",
                    cause,
                  }),
                }),
            ),
          );
        },
        supportsAck: true,
        supportsTransferables: false,
        codecFor: serialization.codecFor,
      };
    }),
  );

/**
 * Starts the session a harness server running as `process` serves, and returns it as the harness
 * contract's session. The process is killed when the scope closes. A request the server cannot
 * answer, because it or its process ended, fails the session as `ended`, worth retrying.
 */
export const startSession = Effect.fnUntraced(function* (
  process: Sandbox.Process,
  options: StartOptions,
) {
  yield* Effect.addFinalizer(() => Effect.ignore(process.kill));
  const client = yield* RpcClient.make(Rpcs).pipe(
    Effect.provideServiceEffect(RpcClient.Protocol, makeProtocol(process)),
  );
  yield* failEnded(client.Start(options));
  const session: Harness.Session = {
    prepare: (transcript) => failEnded(client.Prepare({ transcript })),
    submit: (batch) => failEnded(client.Submit({ batch })),
    resolve: (callId, outcome) => failEnded(client.Resolve({ callId, outcome })),
    resume: failEnded(client.Resume()),
    events: client
      .Events()
      .pipe(
        Stream.catchTag("RpcClientError", (error: RpcClientError.RpcClientError) =>
          Stream.fail(ended(error)),
        ),
      ),
  };
  return session;
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
 * Puts the harness server built for the sandbox's platform in its temporary directory, unless that
 * version is already there, and returns where. A new version is written beside it and renamed
 * into place, so a sandbox never runs a partly written one.
 */
export const upload = Effect.fnUntraced(function* (sandbox: Sandbox.Running, program: Program) {
  const crypto = yield* Crypto.Crypto;
  const probe = yield* sandbox.exec({
    argv: ["sh", "-c", 'uname -s; uname -m; printf "%s" "${TMPDIR:-/tmp}"'],
  });
  const [system = "", processor = "", temporary = ""] = probe.stdout.split("\n");
  const platform = platformOf(system.trim(), processor.trim());
  if (probe.exitCode !== 0 || platform === undefined || temporary === "")
    return yield* new EnvironmentErrors.UnsupportedPlatform({
      platform: `${system.trim()} ${processor.trim()}`.trim(),
    });
  const binary = yield* program.binary(platform);
  const directory = `${temporary.replace(/\/+$/u, "")}/amends-harness-server/${binary.version}`;
  const executable = `${directory}/harness-server`;
  const present = yield* sandbox.exec({ argv: ["test", "-x", executable] });
  if (present.exitCode === 0) return executable;
  const partial = `${directory}/harness-server.${yield* Effect.orDie(crypto.randomUUIDv4)}`;
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

export * as HarnessServer from "./harness-server.ts";
