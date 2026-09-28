import { constants } from "node:os";
import { Sandbox, SandboxErrors, SandboxImplementation } from "@amends/sandbox";
import { Crypto, Effect, Exit, FileSystem, Path, Queue, Schema, Scope, Stream } from "effect";
import type { Cause, PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export const name = "local";

/**
 * Commands run as this host's user in a directory of their own. Nothing isolates them: they can
 * reach the host's files, processes, and network, so this provider is for development and tests.
 */
export const capabilities: Sandbox.Capabilities = {
  stdin: true,
  snapshots: "filesystem",
  isolated: false,
};

export interface Options {
  /** The directory that holds every sandbox's files and snapshots. */
  readonly root: string;
}

/** What acquisition recorded about a sandbox, kept beside its directory. */
const Metadata = Schema.Struct({ env: Schema.Record(Schema.String, Schema.String) });
const MetadataJson = Schema.fromJsonString(Metadata);

const failure = (error: PlatformError.PlatformError) =>
  new SandboxErrors.ProviderFailure({ reason: error.message, retryable: false });

const encoder = new TextEncoder();

/**
 * A signal ends a process without an exit code; shells report 128 plus its number, and so does
 * this provider. Effect's spawner names the signal only in the message of its failure's cause.
 */
const signaled = (error: PlatformError.PlatformError) => {
  const cause = error.reason._tag === "BadArgument" ? undefined : error.reason.cause;
  const signal = cause instanceof Error ? /signal: '(\w+)'/.exec(cause.message)?.[1] : undefined;
  const number = signal === undefined ? undefined : constants.signals[signal as NodeJS.Signals];
  return number === undefined ? Effect.fail(failure(error)) : Effect.succeed(128 + number);
};

const text = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (collected, chunk) => collected + chunk,
    ),
  );

/** What a host registers. Sandboxes here isolate nothing, so the provider suits development. */
export const declaration: SandboxImplementation.Declaration = {
  id: SandboxImplementation.Id.make(name),
  name: "Local directory",
  description:
    "Directories on the host's own machine. They isolate nothing, so use them in development.",
  capabilities,
  account: false,
};

/**
 * Sandboxes as directories under `root`. A sandbox's processes belong to the provider that
 * started them and end when it stops the sandbox or its own scope closes.
 */
export const make = Effect.fnUntraced(function* (options: Options) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const crypto = yield* Crypto.Crypto;
  const sandboxes = path.join(path.resolve(options.root), "sandboxes");
  const snapshots = path.join(path.resolve(options.root), "snapshots");
  yield* fs.makeDirectory(sandboxes, { recursive: true });
  yield* fs.makeDirectory(snapshots, { recursive: true });
  /** The scope of each sandbox's running processes. */
  const running = new Map<string, Scope.Closeable>();
  yield* Effect.addFinalizer(() =>
    Effect.forEach(running.values(), (scope) => Scope.close(scope, Exit.void), { discard: true }),
  );

  const newId = crypto.randomUUIDv4.pipe(Effect.map((id) => Sandbox.Id.make(id)));
  const directoryOf = (id: Sandbox.Id) => path.join(sandboxes, id);
  const metadataOf = (id: Sandbox.Id) => path.join(sandboxes, `${id}.json`);

  const processScope = (id: Sandbox.Id) =>
    Effect.suspend(() => {
      const existing = running.get(id);
      if (existing !== undefined) return Effect.succeed(existing);
      return Scope.make().pipe(Effect.tap((scope) => Effect.sync(() => running.set(id, scope))));
    });

  const stopProcesses = (id: Sandbox.Id) =>
    Effect.suspend(() => {
      const scope = running.get(id);
      running.delete(id);
      return scope === undefined ? Effect.void : Scope.close(scope, Exit.void);
    });

  const open = Effect.fnUntraced(function* (id: Sandbox.Id) {
    const workdir = yield* fs.realPath(directoryOf(id));
    const { env } = yield* fs
      .readFileString(metadataOf(id))
      .pipe(Effect.flatMap(Schema.decodeEffect(MetadataJson)), Effect.orDie);
    const resolve = (target: string | undefined) =>
      target === undefined ? workdir : path.resolve(workdir, target);
    const commandOf = (command: Sandbox.Command, stdin: "pipe" | "ignore") =>
      ChildProcess.make(command.argv[0], command.argv.slice(1), {
        cwd: resolve(command.cwd),
        env: { ...env, ...command.env },
        extendEnv: true,
        stdin,
      });

    const sandbox: Sandbox.Running = {
      id,
      workdir,
      exec: (command) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(commandOf(command, "ignore"));
            const [stdout, stderr, exitCode] = yield* Effect.all(
              [text(handle.stdout), text(handle.stderr), handle.exitCode.pipe(Effect.map(Number))],
              { concurrency: "unbounded" },
            );
            return { exitCode, stdout, stderr };
          }),
        ).pipe(Effect.mapError(failure)),
      spawn: (command) =>
        Effect.gen(function* () {
          const scope = yield* processScope(id);
          const handle = yield* spawner
            .spawn(commandOf(command, "pipe"))
            .pipe(Scope.provide(scope), Effect.mapError(failure));
          const output = yield* Queue.unbounded<
            Sandbox.Output,
            SandboxErrors.ProviderFailure | Cause.Done
          >();
          const forward = (
            stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
            kind: Sandbox.Output["stream"],
          ) =>
            stream.pipe(
              Stream.decodeText(),
              Stream.runForEach((chunk) => Queue.offer(output, { stream: kind, text: chunk })),
            );
          yield* Effect.all([forward(handle.stdout, "stdout"), forward(handle.stderr, "stderr")], {
            concurrency: "unbounded",
          }).pipe(
            Effect.matchEffect({
              onFailure: (error) => Queue.fail(output, failure(error)),
              onSuccess: () => Queue.end(output),
            }),
            Effect.forkIn(scope),
          );
          const input = yield* Queue.unbounded<Uint8Array>();
          yield* Stream.fromQueue(input).pipe(
            Stream.run(handle.stdin),
            Effect.ignore,
            Effect.forkIn(scope),
          );
          return {
            output: Stream.fromQueue(output),
            exit: handle.exitCode.pipe(
              Effect.map(Number),
              Effect.catch((error) => signaled(error)),
            ),
            kill: handle.kill().pipe(Effect.mapError(failure)),
            write: (value) => Queue.offer(input, encoder.encode(value)).pipe(Effect.asVoid),
          } satisfies Sandbox.Process;
        }),
      expose: (port) => Effect.succeed({ url: `http://127.0.0.1:${port}`, headers: {} }),
      readFile: (target) =>
        fs.readFile(resolve(target)).pipe(
          Effect.map((data) => new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
          Effect.mapError((error) =>
            error.reason._tag === "NotFound"
              ? new SandboxErrors.FileNotFound({ path: target })
              : failure(error),
          ),
        ),
      writeFile: (target, data) =>
        fs
          .makeDirectory(path.dirname(resolve(target)), { recursive: true })
          .pipe(Effect.andThen(fs.writeFile(resolve(target), data)), Effect.mapError(failure)),
      snapshot: Effect.gen(function* () {
        const snapshot = yield* crypto.randomUUIDv4;
        yield* fs.copy(workdir, path.join(snapshots, snapshot));
        return { provider: name, id: snapshot };
      }).pipe(Effect.mapError(failure)),
      stop: stopProcesses(id),
      destroy: stopProcesses(id).pipe(
        Effect.andThen(fs.remove(directoryOf(id), { recursive: true, force: true })),
        Effect.andThen(fs.remove(metadataOf(id), { force: true })),
        Effect.mapError(failure),
      ),
    };
    return sandbox;
  });

  const create = Effect.fnUntraced(function* (
    populate: (directory: string) => Effect.Effect<void, PlatformError.PlatformError>,
    env: Readonly<Record<string, string>>,
  ) {
    const id = yield* newId;
    yield* populate(directoryOf(id));
    yield* fs.writeFileString(
      metadataOf(id),
      yield* Schema.encodeEffect(MetadataJson)({ env: { ...env } }).pipe(Effect.orDie),
    );
    return yield* open(id);
  });

  const acquire = Effect.fnUntraced(function* (acquireOptions: Sandbox.AcquireOptions = {}) {
    const env = acquireOptions.env ?? {};
    if (acquireOptions.id !== undefined && (yield* fs.exists(directoryOf(acquireOptions.id))))
      return { sandbox: yield* open(acquireOptions.id), filesystem: "retained" as const };
    const snapshot = acquireOptions.snapshot;
    if (snapshot !== undefined) {
      if (snapshot.provider !== name)
        return yield* new SandboxErrors.SnapshotUnavailable({
          reason: `The ${snapshot.provider} provider took this snapshot.`,
        });
      const source = path.join(snapshots, snapshot.id);
      if (!(yield* fs.exists(source)))
        return yield* new SandboxErrors.SnapshotUnavailable({
          reason: `Snapshot ${snapshot.id} no longer exists.`,
        });
      const sandbox = yield* create((directory) => fs.copy(source, directory), env);
      return { sandbox, filesystem: "restored" as const };
    }
    const sandbox = yield* create(
      (directory) => fs.makeDirectory(directory, { recursive: true }),
      env,
    );
    return { sandbox, filesystem: "fresh" as const };
  });

  return {
    name,
    capabilities,
    deleteSnapshot: (snapshot) =>
      snapshot.provider === name
        ? fs
            .remove(path.join(snapshots, snapshot.id), { recursive: true, force: true })
            .pipe(Effect.mapError(failure))
        : Effect.fail(
            new SandboxErrors.SnapshotUnavailable({
              reason: `The ${snapshot.provider} provider took this snapshot.`,
            }),
          ),
    acquire: (acquireOptions) =>
      acquire(acquireOptions).pipe(
        Effect.catchTag("PlatformError", (error) => Effect.fail(failure(error))),
      ),
  } satisfies Sandbox.Provider;
});

export * as LocalSandbox from "./local-sandbox.ts";
