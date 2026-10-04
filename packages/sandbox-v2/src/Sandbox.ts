/**
 * A sandbox is an isolated machine that code runs in. Its files and processes are Effect's own
 * `FileSystem` and `ChildProcessSpawner`, so any Effect code that uses them runs inside the
 * sandbox once `layerServices` provides them. The `Sandbox` service adds what Effect has no
 * service for: the sandbox's identity, its ports, its network, and its lifecycle.
 *
 * A sandbox outlives the process that created it, so its lifetime is not tied to a `Scope`: it
 * runs until `stop` or `destroy`, and a provider can resume it later by its id. A process in it
 * ends with the scope that spawned it, unless its handle's `unref` lets it outlive that scope, as a
 * server that should keep running after the host lets go does; it then runs until the sandbox
 * stops.
 */
import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { ChildProcessSpawner } from "effect/process";
import type {
  Endpoint,
  EndpointProtocol,
  NetworkPolicy,
  Port,
  RequestTransformation,
} from "./Network.ts";
import type { SandboxError } from "./SandboxError.ts";

/**
 * Checks a name of letters, digits, `-`, and `_`, starting with a letter or digit and at most 63
 * characters long, which any provider can use as a directory name or in a URL.
 */
export const isName = Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/);

/** Names a sandbox, as `isName` checks. */
export const SandboxId = Schema.String.check(isName).pipe(Schema.brand("SandboxId"));

export type SandboxId = typeof SandboxId.Type;

/** The Effect services a sandbox provides to code that runs inside it. */
export type SandboxServices =
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner;

export class Sandbox extends Context.Service<
  Sandbox,
  {
    readonly id: SandboxId;

    /** Text for an agent's instructions: what the sandbox is and where to work. */
    readonly description: string;

    /** The absolute directory that commands start in when they set no `cwd`. */
    readonly workingDirectory: string;

    /**
     * The sandbox's files. Paths must be absolute, such as ones joined onto `workingDirectory`:
     * what a relative path refers to differs between providers.
     */
    readonly fileSystem: FileSystem.FileSystem;

    readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];

    // TODO: Add `setPorts` to expose ports after creation, once a caller needs ports it did not
    // ask for at creation.
    /** The ports the sandbox was created with; `endpoint` reaches any of them. */
    readonly ports: ReadonlyArray<Port>;

    /** How to reach `port` from outside the sandbox; fails with `NotFoundError` for a port not in `ports`. */
    readonly endpoint: (
      port: Port,
      protocol: EndpointProtocol,
    ) => Effect.Effect<Endpoint, SandboxError>;

    /**
     * Stops the sandbox, ending every process in it, so that it can be resumed later. Stopping a
     * stopped sandbox succeeds.
     */
    readonly stop: Effect.Effect<void, SandboxError>;

    /**
     * Stops the sandbox and deletes it; it cannot be resumed afterwards. Destroying a destroyed
     * sandbox succeeds.
     */
    readonly destroy: Effect.Effect<void, SandboxError>;

    /** Replaces the outbound network policy; fails with `UnsupportedError` when the provider cannot enforce one. */
    readonly setNetworkPolicy: (policy: NetworkPolicy) => Effect.Effect<void, SandboxError>;

    // TODO: Add `setRequestTransformations`, which replaces the whole set, so that an injected
    // credential can be revoked while the sandbox lives. Added transformations last until then.
    /**
     * Adds request transformations beside those already set, for the rest of the sandbox's life;
     * fails with `UnsupportedError` when the provider cannot transform requests outside the sandbox.
     */
    readonly addRequestTransformations: (
      transformations: ReadonlyArray<RequestTransformation>,
    ) => Effect.Effect<void, SandboxError>;
  }
>()("@amends/sandbox-v2/Sandbox") {}

/**
 * Provides the sandbox's files, processes, and paths to Effect code, without the `Sandbox` service
 * itself: code given only this layer can work in the sandbox but cannot stop it or change its network.
 */
export const layerServices = (sandbox: Sandbox["Service"]): Layer.Layer<SandboxServices> =>
  Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, sandbox.fileSystem),
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, sandbox.childProcessSpawner),
    Path.layer,
  );
