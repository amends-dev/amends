/**
 * A local sandbox provider keeps each sandbox in a directory on this machine and runs its
 * processes as this machine's processes. Nothing is isolated: a sandbox's processes can read and
 * write the whole machine and see its environment variables, so it suits development, tests, and
 * agents you would trust on this machine anyway.
 *
 * Each sandbox is a directory under the provider's `directory`, named by its id, that holds its
 * settings, the ports it exposes, in `sandbox.json` and the sandbox's files in `workspace`, its
 * working directory. Processes start in the working directory and resolve a relative `cwd` against it.
 * File paths are this machine's paths.
 *
 * `stop` and `destroy` end the processes the provider started for the sandbox, through any
 * `Sandbox` value for it, including those that outlived their scopes. A provider made again, as
 * when the host restarts, does not know of processes an earlier one left running.
 *
 * `integration` gives the sandboxes of this machine to connections, under a directory the host
 * gives it, for a workspace cannot say where on the host's disk its sandboxes go.
 */
import { Connection, Integration } from "@amends/connection";
import { Network, Sandbox, SandboxError, SandboxProvider } from "@amends/sandbox";
import {
  Crypto,
  Effect,
  FileSystem,
  Layer,
  Path,
  type PlatformError,
  Schema,
  Scope,
  Semaphore,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export interface Options {
  /** The directory that holds one directory per sandbox, created if it is missing. */
  readonly directory: string;
}

/** The settings a sandbox keeps in its `sandbox.json`: the ports it exposes. */
const Settings = Schema.fromJsonString(Schema.Struct({ ports: Schema.Array(Network.Port) }));

export const make = Effect.fn("LocalSandboxProvider.make")(function* (options: Options) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const directory = path.resolve(options.directory);
  yield* fs.makeDirectory(directory, { recursive: true });
  /** Held while a sandbox's settings change, so that ports exposed together are all kept. */
  const settingsLock = yield* Semaphore.make(1);

  const pathsOf = (id: Sandbox.SandboxId) => {
    const root = path.join(directory, id);
    return {
      root,
      settings: path.join(root, "sandbox.json"),
      workspace: path.join(root, "workspace"),
    };
  };

  // TODO: Keep the processes that outlive their scopes in the sandbox's directory, so that a
  // provider made after the host restarts ends them too, once a host restarts while one runs.
  /**
   * The processes running in each sandbox, so that `stop` and `destroy` end them whichever
   * `Sandbox` value started them.
   */
  const processes = new Map<Sandbox.SandboxId, Set<ChildProcessSpawner.ChildProcessHandle>>();
  const processesOf = (id: Sandbox.SandboxId) => {
    const running = processes.get(id) ?? new Set();
    processes.set(id, running);
    return running;
  };

  /**
   * Spawns `command`, keeping its process in `running` while it runs. When the caller's scope
   * closes, the spawner ends the process unless its handle was unreferenced; one still running
   * then stays in `running` until the sandbox stops.
   */
  const spawnInto = Effect.fnUntraced(function* (
    running: Set<ChildProcessSpawner.ChildProcessHandle>,
    command: ChildProcess.Command,
  ) {
    // The spawner ends the process in a scope of its own, which this one closes before it
    // looks at whether the process still runs.
    const spawnScope = yield* Scope.fork(yield* Effect.scope);
    const handle = yield* Scope.provide(spawner.spawn(command), spawnScope);
    running.add(handle);
    const forgetEnded = Effect.flatMap(handle.isRunning, (isRunning) =>
      isRunning ? Effect.void : Effect.sync(() => running.delete(handle)),
    );
    yield* Effect.addFinalizer((exit) =>
      Effect.andThen(Scope.close(spawnScope, exit), Effect.ignore(forgetEnded)),
    );
    return handle;
  });

  /** The ports the sandbox `id` exposes, as its settings keep them. */
  const readPorts = Effect.fnUntraced(function* (id: Sandbox.SandboxId) {
    const settings = yield* fs
      .readFileString(pathsOf(id).settings)
      .pipe(Effect.mapError(fromPlatformError));
    const { ports } = yield* Schema.decodeEffect(Settings)(settings).pipe(
      Effect.mapError((cause) =>
        sandboxError(
          new SandboxError.UnknownError({ description: "The sandbox's settings are unreadable" }),
          cause,
        ),
      ),
    );
    return ports;
  });

  /** Keeps `ports` as the ports the sandbox `id` exposes. */
  const writePorts = (id: Sandbox.SandboxId, ports: ReadonlyArray<Network.Port>) =>
    // Ports are already valid, so encoding them cannot fail.
    Effect.flatMap(Effect.orDie(Schema.encodeEffect(Settings)({ ports })), (settings) =>
      fs.writeFileString(pathsOf(id).settings, settings),
    );

  const openSandbox = (id: Sandbox.SandboxId): Sandbox.Sandbox["Service"] => {
    const paths = pathsOf(id);
    const running = processesOf(id);
    return Sandbox.Sandbox.of({
      id,
      description: describe(paths.workspace),
      workingDirectory: paths.workspace,
      fileSystem: fs,
      childProcessSpawner: ChildProcessSpawner.make((command) =>
        spawnInto(running, resolveCwd(path, paths.workspace, command)),
      ),
      // A port is this machine's, so exposing it only records it.
      exposePorts: (ports) =>
        Semaphore.withPermit(
          settingsLock,
          Effect.gen(function* () {
            const exposed = yield* readPorts(id);
            const added = ports.filter((port) => !exposed.includes(port));
            if (added.length === 0) return;
            yield* writePorts(id, [...exposed, ...added]).pipe(Effect.mapError(fromPlatformError));
          }),
        ),
      endpoint: (port, protocol) =>
        Effect.flatMap(readPorts(id), (exposed) =>
          exposed.includes(port)
            ? Effect.succeed({ url: `${protocol}://127.0.0.1:${port}`, headers: {} })
            : Effect.fail(
                sandboxError(
                  new SandboxError.NotFoundError({
                    description: `Port ${port} is not exposed`,
                  }),
                ),
              ),
        ),
      stop: endProcesses(running).pipe(Effect.mapError(fromPlatformError)),
      destroy: endProcesses(running).pipe(
        Effect.andThen(fs.remove(paths.root, { recursive: true, force: true })),
        Effect.mapError(fromPlatformError),
        Effect.andThen(Effect.sync(() => processes.delete(id))),
      ),
      setNetworkPolicy: allowAllOnly,
      setRequestTransformations: () =>
        Effect.fail(
          sandboxError(
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
      Sandbox.SandboxId.make(yield* crypto.randomUUIDv4.pipe(Effect.mapError(fromPlatformError)));
    const ports = createOptions.ports ?? [];
    const paths = pathsOf(id);
    if (createOptions.networkPolicy !== undefined) yield* allowAllOnly(createOptions.networkPolicy);

    // Creating the sandbox's directory claims its id, failing when the id is taken.
    yield* fs.makeDirectory(paths.root).pipe(Effect.mapError(fromPlatformError));
    return yield* Effect.gen(function* () {
      yield* fs.makeDirectory(paths.workspace);
      yield* writePorts(id, ports);
      return openSandbox(id);
    }).pipe(
      Effect.mapError(fromPlatformError),
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
    // A sandbox without readable settings is not one this provider created.
    yield* readPorts(id);
    return openSandbox(id);
  });

  return SandboxProvider.SandboxProvider.of({ create, resume });
});

export const layer = (options: Options) =>
  Layer.effect(SandboxProvider.SandboxProvider, make(options));

export interface IntegrationOptions {
  /** The directory that holds one directory per connection, which holds its sandboxes. */
  readonly directory: string;
}

/** Whether a connection's id can name the directory of the connection's sandboxes. */
const isDirectoryName = (id: string): boolean => Schema.is(Schema.String.check(Sandbox.isName))(id);

/**
 * The integration of this machine's sandboxes. A connection to it gives no settings and no
 * credential, and keeps its sandboxes in a directory of its own, named by its id, so that it never
 * resumes another's. Checking a connection makes that directory.
 */
export const integration = Effect.fn("LocalSandboxProvider.integration")(function* (
  options: IntegrationOptions,
) {
  const context = yield* Effect.context<
    FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
  >();
  const path = yield* Path.Path;

  /** The provider of the sandboxes of `connection`. */
  const providerOf = ({ connection }: Integration.Access<unknown, "none">) =>
    Effect.gen(function* () {
      if (!isDirectoryName(connection.id)) {
        return yield* new Connection.InvalidConnectionError({
          description: `The id of ${connection.name}, ${connection.id}, cannot name a directory`,
        });
      }
      return yield* make({ directory: path.join(options.directory, connection.id) }).pipe(
        Effect.provideContext(context),
        Effect.mapError(
          (error) =>
            new Connection.UnavailableError({
              description: `The sandboxes of ${connection.name} cannot be kept: ${error.message}`,
            }),
        ),
      );
    });

  return Integration.make({
    id: "local",
    name: "This machine",
    auth: ["none"],
    sandboxes: providerOf,
    check: (access) =>
      providerOf(access).pipe(
        Effect.as<Connection.Health>({ status: "healthy" }),
        Effect.catch((reason) =>
          Effect.succeed<Connection.Health>({
            status: reason._tag === "UnavailableError" ? "unavailable" : "misconfigured",
            description: reason.description,
          }),
        ),
      ),
  });
});

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

/** Ends the processes in `running`, waiting for each to exit, and forgets them. */
const endProcesses = (running: Set<ChildProcessSpawner.ChildProcessHandle>) =>
  Effect.forEach(
    running,
    (handle) =>
      Effect.flatMap(handle.isRunning, (isRunning) =>
        isRunning ? handle.kill({ forceKillAfter: "5 seconds" }) : Effect.void,
      ).pipe(Effect.andThen(Effect.sync(() => running.delete(handle)))),
    { concurrency: "unbounded", discard: true },
  );

const describe = (workingDirectory: string) =>
  `Work in ${workingDirectory}, a directory on this machine, where commands start.`;

/** Succeeds for `AllowAll` only, the network a local sandbox has, as it shares this machine's. */
const allowAllOnly = (policy: Network.NetworkPolicy) =>
  policy._tag === "AllowAll"
    ? Effect.void
    : Effect.fail(
        sandboxError(
          new SandboxError.UnsupportedError({
            description: "A local sandbox shares this machine's network",
          }),
        ),
      );

const sandboxError = (reason: SandboxError.SandboxErrorReason, cause?: unknown) =>
  new SandboxError.SandboxError({ provider: "local", reason, cause });

const fromPlatformError = (error: PlatformError.PlatformError) =>
  sandboxError(reasonOf(error), error);

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
