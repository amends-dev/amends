import { posix } from "node:path";
import { Sandbox, SandboxErrors, SandboxImplementation } from "@amends/sandbox";
import {
  Daytona,
  DaytonaBadRequestError,
  DaytonaConnectionError,
  DaytonaError,
  DaytonaFileNotFoundError,
  DaytonaNotFoundError,
  DaytonaRateLimitError,
  DaytonaTimeoutError,
} from "@daytona/sdk";
import type { DaytonaConfig, Sandbox as Remote } from "@daytona/sdk";
import { Crypto, Data, Effect, Option, Queue, Stream } from "effect";

export const name = "daytona";

/**
 * Daytona runs each sandbox in its own container. Background commands take input through their
 * session, and a snapshot captures the filesystem as a Daytona snapshot new sandboxes start from.
 */
export const capabilities: Sandbox.Capabilities = {
  stdin: true,
  snapshots: "filesystem",
  isolated: true,
};

/** What a host registers: sandboxes run under the workspace's Daytona account, a connection. */
export const declaration: SandboxImplementation.Declaration = {
  id: SandboxImplementation.Id.make(name),
  name: "Daytona",
  description: "Isolated containers on Daytona, under your Daytona account.",
  capabilities,
  account: true,
  template: {
    label: "Snapshot",
    description:
      "The Daytona snapshot new sandboxes start from. Leave empty for Daytona's default.",
    placeholder: "daytonaio/sandbox",
  },
};

export interface Options {
  /** How to reach Daytona; the API key defaults to `DAYTONA_API_KEY`. */
  readonly client?: DaytonaConfig | undefined;
  /** Minutes without activity before Daytona stops a sandbox; 0 never does. */
  readonly autoStopInterval?: number | undefined;
  /** Minutes after stopping before Daytona deletes a sandbox; -1 never does. */
  readonly autoDeleteInterval?: number | undefined;
  /** Seconds to wait for Daytona to create, start, stop, or delete a sandbox; 120 by default. */
  readonly timeout?: number | undefined;
  /** Seconds to wait for Daytona to finish a snapshot, which can take minutes; 600 by default. */
  readonly snapshotTimeout?: number | undefined;
}

/** States of a sandbox that will not run again. */
const gone = new Set<string>(["destroyed", "destroying"]);

const retryable = (error: unknown) =>
  error instanceof DaytonaConnectionError ||
  error instanceof DaytonaTimeoutError ||
  error instanceof DaytonaRateLimitError ||
  (error instanceof DaytonaError && error.statusCode !== undefined && error.statusCode >= 500);

const failure = (error: unknown) =>
  new SandboxErrors.ProviderFailure({
    reason: error instanceof Error ? error.message : String(error),
    retryable: retryable(error),
  });

/** A Daytona request, failing as the provider's failure. */
const call = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: failure });

class Missing extends Data.TaggedError("Missing") {}

/** A Daytona request whose target may not exist. */
const find = <A>(
  run: () => Promise<A>,
  missing: (error: unknown) => boolean,
): Effect.Effect<Option.Option<A>, SandboxErrors.ProviderFailure> =>
  Effect.tryPromise({
    try: run,
    catch: (error) => (missing(error) ? new Missing() : failure(error)),
  }).pipe(
    Effect.asSome,
    Effect.catchTag("Missing", () => Effect.succeedNone),
  );

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * Shell steps that run a command in its directory with its added environment; with `replace`, the
 * command replaces the shell.
 */
const invocation = (command: Sandbox.Command, workdir: string, replace: boolean) => {
  const env = Object.entries(command.env ?? {}).map(([key, value]) => quote(`${key}=${value}`));
  return [
    `cd ${quote(posix.resolve(workdir, command.cwd ?? "."))}`,
    `${replace ? "exec " : ""}env ${[...env, ...command.argv.map(quote)].join(" ")}`,
  ].join(" && ");
};

/**
 * A session command that runs `command` to completion in its own shell. Daytona returns output
 * by lines and ends an unterminated last line with a newline, so the shell ends each stream with
 * one of its own, which `exact` removes: output comes back as the command wrote it.
 */
const completed = (command: Sandbox.Command, workdir: string) =>
  `sh -c ${quote(`${invocation(command, workdir, false)}; code=$?; printf '\\n'; printf '\\n' >&2; exit $code`)}`;

/** Output without the newline `completed` ended it with. */
const exact = (output: string | undefined) =>
  output === undefined ? "" : output.endsWith("\n") ? output.slice(0, -1) : output;

/**
 * A session command that runs `command` in the background: its shell records its process ID in
 * `pidFile`, then replaces itself with the command, which receives the session's input and signals.
 */
const background = (command: Sandbox.Command, workdir: string, pidFile: string) =>
  `sh -c ${quote(`echo $$ > ${quote(pidFile)} && ${invocation(command, workdir, true)}`)}`;

/**
 * Sandboxes in Daytona. Each command runs in a Daytona session of its own, so no shell state
 * carries between commands; `exec` deletes its session when done, and a background process's
 * session lasts until its sandbox stops.
 */
export const make = Effect.fnUntraced(function* (options: Options = {}) {
  const crypto = yield* Crypto.Crypto;
  const daytona = yield* Effect.try({ try: () => new Daytona(options.client), catch: failure });
  yield* Effect.addFinalizer(() => Effect.promise(() => daytona[Symbol.asyncDispose]()));
  const timeout = options.timeout ?? 120;
  const snapshotTimeout = options.snapshotTimeout ?? 600;
  const sessionId = crypto.randomUUIDv4.pipe(
    Effect.map((id) => `amends-${id}`),
    Effect.mapError(failure),
  );

  const open = Effect.fnUntraced(function* (remote: Remote) {
    const workdir =
      (yield* call(() => remote.getWorkDir())) ??
      (yield* call(() => remote.getUserHomeDir())) ??
      "/";
    const resolve = (target: string) => posix.resolve(workdir, target);

    const exec = (command: Sandbox.Command) =>
      Effect.gen(function* () {
        const session = yield* sessionId;
        yield* call(() => remote.process.createSession(session));
        const response = yield* call(() =>
          remote.process.executeSessionCommand(session, { command: completed(command, workdir) }),
        ).pipe(Effect.ensuring(Effect.ignore(call(() => remote.process.deleteSession(session)))));
        if (response.exitCode === undefined)
          return yield* new SandboxErrors.ProviderFailure({
            reason: "Daytona reported no exit code for a finished command.",
            retryable: false,
          });
        return {
          exitCode: response.exitCode,
          stdout: exact(response.stdout),
          stderr: exact(response.stderr),
        };
      });

    const sandbox: Sandbox.Running = {
      id: Sandbox.Id.make(remote.id),
      workdir,
      exec,
      spawn: (command) =>
        Effect.gen(function* () {
          const session = yield* sessionId;
          const pidFile = `/tmp/${session}.pid`;
          yield* call(() => remote.process.createSession(session));
          const { cmdId } = yield* call(() =>
            remote.process.executeSessionCommand(session, {
              command: background(command, workdir, pidFile),
              runAsync: true,
              suppressInputEcho: true,
            }),
          );
          const exit = Effect.gen(function* () {
            for (;;) {
              const { exitCode } = yield* call(() =>
                remote.process.getSessionCommand(session, cmdId),
              );
              if (exitCode !== undefined && exitCode !== null) return exitCode;
              yield* Effect.sleep("500 millis");
            }
          });
          return {
            output: Stream.callback<Sandbox.Output, SandboxErrors.ProviderFailure>((queue) =>
              call(() =>
                remote.process.getSessionCommandLogs(
                  session,
                  cmdId,
                  (text) => Queue.offerUnsafe(queue, { stream: "stdout", text }),
                  (text) => Queue.offerUnsafe(queue, { stream: "stderr", text }),
                ),
              ).pipe(
                Effect.matchEffect({
                  onFailure: (error) => Queue.fail(queue, error),
                  onSuccess: () => Queue.end(queue),
                }),
              ),
            ),
            exit,
            kill: exec({ argv: ["sh", "-c", `kill -TERM "$(cat ${quote(pidFile)})"`] }).pipe(
              Effect.asVoid,
            ),
            write: (text) =>
              call(() => remote.process.sendSessionCommandInput(session, cmdId, text)),
          } satisfies Sandbox.Process;
        }),
      expose: (port) =>
        call(() => remote.getPreviewLink(port)).pipe(
          Effect.map((link) => ({
            url: link.url,
            headers: { "x-daytona-preview-token": link.token },
          })),
        ),
      readFile: (target) =>
        find(
          () => remote.fs.downloadFile(resolve(target)),
          (error) =>
            error instanceof DaytonaFileNotFoundError || error instanceof DaytonaNotFoundError,
        ).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new SandboxErrors.FileNotFound({ path: target })),
              onSome: (data) =>
                Effect.succeed(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
            }),
          ),
        ),
      writeFile: (target, data) =>
        exec({ argv: ["mkdir", "-p", posix.dirname(resolve(target))] }).pipe(
          Effect.andThen(call(() => remote.fs.uploadFile(Buffer.from(data), resolve(target)))),
        ),
      snapshot: Effect.gen(function* () {
        const snapshot = yield* sessionId;
        yield* call(() => remote.createSnapshot(snapshot, snapshotTimeout)).pipe(
          Effect.tapError(() => Effect.ignore(call(() => daytona.snapshot.delete(snapshot)))),
        );
        return { provider: name, id: snapshot };
      }),
      stop: call(() => remote.stop(timeout)),
      destroy: call(() => remote.delete(timeout)),
    };
    return sandbox;
  });

  const create = (
    acquireOptions: Sandbox.AcquireOptions,
    snapshot: string | undefined,
    onMissing: (error: unknown) => boolean,
  ) =>
    find(
      () =>
        daytona.create(
          {
            envVars: { ...acquireOptions.env },
            labels: { ...acquireOptions.labels },
            ...(snapshot !== undefined && { snapshot }),
            ...(options.autoStopInterval !== undefined && {
              autoStopInterval: options.autoStopInterval,
            }),
            ...(options.autoDeleteInterval !== undefined && {
              autoDeleteInterval: options.autoDeleteInterval,
            }),
          },
          { timeout },
        ),
      onMissing,
    );

  const unavailable = (reason: string) => new SandboxErrors.SnapshotUnavailable({ reason });

  const acquire = Effect.fnUntraced(function* (acquireOptions: Sandbox.AcquireOptions = {}) {
    const id = acquireOptions.id;
    if (id !== undefined) {
      const existing = yield* find(
        () => daytona.get(id),
        (error) => error instanceof DaytonaNotFoundError,
      );
      if (Option.isSome(existing) && !gone.has(existing.value.state ?? "")) {
        const remote = existing.value;
        if (remote.state !== "started") yield* call(() => remote.start(timeout));
        return { sandbox: yield* open(remote), filesystem: "retained" as const };
      }
    }
    const snapshot = acquireOptions.snapshot;
    if (snapshot !== undefined) {
      if (snapshot.provider !== name)
        return yield* unavailable(`The ${snapshot.provider} provider took this snapshot.`);
      const restored = yield* create(
        acquireOptions,
        snapshot.id,
        (error) => error instanceof DaytonaNotFoundError || error instanceof DaytonaBadRequestError,
      );
      if (Option.isNone(restored))
        return yield* unavailable(`Daytona has no snapshot ${snapshot.id}.`);
      return { sandbox: yield* open(restored.value), filesystem: "restored" as const };
    }
    const created = yield* create(acquireOptions, acquireOptions.template, () => false);
    if (Option.isNone(created))
      return yield* new SandboxErrors.ProviderFailure({
        reason: "Daytona created no sandbox.",
        retryable: false,
      });
    return { sandbox: yield* open(created.value), filesystem: "fresh" as const };
  });

  return {
    name,
    capabilities,
    acquire,
    deleteSnapshot: (snapshot) =>
      snapshot.provider === name
        ? find(
            () => daytona.snapshot.delete(snapshot.id),
            (error) => error instanceof DaytonaNotFoundError,
          ).pipe(Effect.asVoid)
        : Effect.fail(unavailable(`The ${snapshot.provider} provider took this snapshot.`)),
  } satisfies Sandbox.Provider;
});

export * as DaytonaSandbox from "./daytona-sandbox.ts";
