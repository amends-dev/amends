/**
 * A local sandbox provider keeps each sandbox in a directory on this machine and runs its
 * processes as this machine's processes. Nothing is isolated: a sandbox's processes can read and
 * write the whole machine and see its environment variables, so it suits development, tests, and
 * agents you would trust on this machine anyway.
 *
 * Each sandbox is a directory under the provider's `directory`, named by its id, that holds the
 * settings `resume` needs in `sandbox.json` and the sandbox's files in `workspace`, its working
 * directory. Processes start in the working directory and resolve a relative `cwd` against it.
 * File paths are this machine's paths.
 */
import { Network, Sandbox, SandboxError, SandboxProvider } from "@amends/sandbox-v2";
import { Crypto, Effect, FileSystem, Layer, Path, type PlatformError, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export interface Options {
  /** The directory that holds one directory per sandbox, created if it is missing. */
  readonly directory: string;
}

/** The settings `create` stores in a sandbox's `sandbox.json` for `resume` to read. */
const Settings = Schema.fromJsonString(Schema.Struct({ ports: Schema.Array(Network.Port) }));

export const make = Effect.fn("LocalSandboxProvider.make")(function* (options: Options) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const directory = path.resolve(options.directory);
  yield* fs.makeDirectory(directory, { recursive: true });

  const pathsOf = (id: Sandbox.SandboxId) => {
    const root = path.join(directory, id);
    return {
      root,
      settings: path.join(root, "sandbox.json"),
      workspace: path.join(root, "workspace"),
    };
  };

  // The processes each sandbox started that are still in their callers' scopes, so that `stop`
  // can end them whichever `Sandbox` value started them.
  const processes = new Map<Sandbox.SandboxId, Set<ChildProcessSpawner.ChildProcessHandle>>();
  const processesOf = (id: Sandbox.SandboxId) => {
    const started = processes.get(id) ?? new Set();
    processes.set(id, started);
    return started;
  };

  const openSandbox = (
    id: Sandbox.SandboxId,
    ports: ReadonlyArray<Network.Port>,
  ): Sandbox.Sandbox["Service"] => {
    const paths = pathsOf(id);
    const started = processesOf(id);
    return Sandbox.Sandbox.of({
      id,
      description: describe(paths.workspace, ports),
      workingDirectory: paths.workspace,
      fileSystem: fs,
      childProcessSpawner: ChildProcessSpawner.make((command) =>
        Effect.acquireRelease(
          Effect.tap(spawner.spawn(resolveCwd(path, paths.workspace, command)), (handle) =>
            Effect.sync(() => started.add(handle)),
          ),
          (handle) => Effect.sync(() => started.delete(handle)),
        ),
      ),
      ports,
      endpoint: (port, protocol) =>
        ports.includes(port)
          ? Effect.succeed({ url: `${protocol}://127.0.0.1:${port}`, headers: {} })
          : Effect.fail(
              sandboxError(
                "endpoint",
                new SandboxError.NotFoundError({
                  description: `Port ${port} was not exposed when the sandbox was created`,
                }),
              ),
            ),
      stop: killProcesses(started).pipe(Effect.mapError(fromPlatformError("stop"))),
      destroy: killProcesses(started).pipe(
        Effect.andThen(fs.remove(paths.root, { recursive: true, force: true })),
        Effect.mapError(fromPlatformError("destroy")),
        Effect.andThen(Effect.sync(() => processes.delete(id))),
      ),
      setNetworkPolicy: (policy) =>
        policy._tag === "AllowAll"
          ? Effect.void
          : Effect.fail(
              sandboxError(
                "setNetworkPolicy",
                new SandboxError.UnsupportedError({
                  description: "A local sandbox shares this machine's network",
                }),
              ),
            ),
      addRequestTransformations: () =>
        Effect.fail(
          sandboxError(
            "addRequestTransformations",
            new SandboxError.UnsupportedError({
              description: "A local sandbox's requests leave this machine without a proxy",
            }),
          ),
        ),
    });
  };

  const create = Effect.fn("LocalSandboxProvider.create")(function* <E = never>(
    createOptions: SandboxProvider.CreateOptions<E> = {},
  ) {
    const id =
      createOptions.id ??
      Sandbox.SandboxId.make(
        yield* crypto.randomUUIDv4.pipe(Effect.mapError(fromPlatformError("create"))),
      );
    const ports = createOptions.ports ?? [];
    const paths = pathsOf(id);

    // Creating the sandbox's directory claims its id, failing when the id is taken.
    yield* fs.makeDirectory(paths.root).pipe(Effect.mapError(fromPlatformError("create")));
    return yield* Effect.gen(function* () {
      // Ports are already valid, so encoding them cannot fail.
      const settings = yield* Schema.encodeEffect(Settings)({ ports }).pipe(Effect.orDie);
      yield* fs.makeDirectory(paths.workspace);
      yield* fs.writeFileString(paths.settings, settings);
      return openSandbox(id, ports);
    }).pipe(
      Effect.mapError(fromPlatformError("create")),
      // TODO: Prepare each template identity once and copy its workspace into new sandboxes, as a
      // snapshot would, once preparing on every create is too slow.
      Effect.tap((sandbox) =>
        createOptions.template === undefined
          ? Effect.void
          : createOptions.template.prepare.pipe(Effect.provide(Sandbox.layerServices(sandbox))),
      ),
      // A failed create leaves no sandbox behind to resume.
      Effect.onError(() =>
        fs.remove(paths.root, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    );
  });

  const resume = Effect.fn("LocalSandboxProvider.resume")(function* (id: Sandbox.SandboxId) {
    const settings = yield* fs
      .readFileString(pathsOf(id).settings)
      .pipe(Effect.mapError(fromPlatformError("resume")));
    const { ports } = yield* Schema.decodeEffect(Settings)(settings).pipe(
      Effect.mapError((cause) =>
        sandboxError(
          "resume",
          new SandboxError.UnknownError({ description: "The sandbox's settings are unreadable" }),
          cause,
        ),
      ),
    );
    return openSandbox(id, ports);
  });

  return SandboxProvider.SandboxProvider.of({ create, resume });
});

export const layer = (options: Options) =>
  Layer.effect(SandboxProvider.SandboxProvider, make(options));

/** Resolves the `cwd` of each command in `command` against `workingDirectory`, where a command without one starts. */
const resolveCwd = (
  path: Path.Path,
  workingDirectory: string,
  command: ChildProcess.Command,
): ChildProcess.Command =>
  command._tag === "StandardCommand"
    ? ChildProcess.setCwd(command, path.resolve(workingDirectory, command.options.cwd ?? "."))
    : ChildProcess.pipeTo(
        resolveCwd(path, workingDirectory, command.left),
        resolveCwd(path, workingDirectory, command.right),
        command.options,
      );

/** Ends the processes still running, waiting for each to exit. */
const killProcesses = (started: ReadonlySet<ChildProcessSpawner.ChildProcessHandle>) =>
  Effect.forEach(
    started,
    (handle) =>
      Effect.flatMap(handle.isRunning, (isRunning) =>
        isRunning ? handle.kill({ forceKillAfter: "5 seconds" }) : Effect.void,
      ),
    { concurrency: "unbounded", discard: true },
  );

const describe = (workingDirectory: string, ports: ReadonlyArray<Network.Port>) =>
  [
    `Work in ${workingDirectory}, a directory on this machine, where commands start.`,
    ...(ports.length === 0 ? [] : [`Servers on ports ${ports.join(", ")} are reachable.`]),
  ].join(" ");

const sandboxError = (method: string, reason: SandboxError.SandboxErrorReason, cause?: unknown) =>
  new SandboxError.SandboxError({ provider: "local", method, reason, cause });

const fromPlatformError = (method: string) => (error: PlatformError.PlatformError) =>
  sandboxError(method, reasonOf(error), error);

/** The sandbox error reason a failure of this machine's file system or processes amounts to. */
const reasonOf = (error: PlatformError.PlatformError): SandboxError.SandboxErrorReason => {
  switch (error.reason._tag) {
    case "NotFound":
      return new SandboxError.NotFoundError({});
    case "AlreadyExists":
      return new SandboxError.AlreadyExistsError({});
    default:
      return new SandboxError.UnknownError({ description: error.message });
  }
};
