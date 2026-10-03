import type { ConnectionImplementation } from "@amends/connection";
import { Schema } from "effect";
import type { Effect, Scope, Stream } from "effect";
import type { SandboxErrors } from "./errors.ts";
import type { SandboxImplementation } from "./implementation.ts";

/** A sandbox's identity at its provider, by which it can be acquired again. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("SandboxId"));
export type Id = typeof Id.Type;

/**
 * A provider's reference to filesystem state it captured. Only that provider can restore it,
 * and it may expire; amends stores the reference, never the state.
 */
export const SnapshotReference = Schema.Struct({
  provider: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
});
export interface SnapshotReference extends Schema.Schema.Type<typeof SnapshotReference> {}

/** What a provider can do beyond the operations every provider supports. */
export interface Capabilities {
  /** A running process's standard input can be written to. */
  readonly stdin: boolean;
  /** What a snapshot captures, if the provider takes them. */
  readonly snapshots: "none" | "filesystem" | "filesystem-and-memory";
  /** Work inside cannot reach the host's files, processes, or network beyond what is exposed. */
  readonly isolated: boolean;
}

export interface AcquireOptions {
  /** A sandbox to acquire again. If it no longer exists, the outcome says what was provided. */
  readonly id?: Id | undefined;
  /** Captured state for a new sandbox to start from, when `id` is absent or gone. */
  readonly snapshot?: SnapshotReference | undefined;
  /** A provider-specific starting point for a new sandbox: an image, template, or snapshot name. */
  readonly template?: string | undefined;
  /** Environment variables every command in a new sandbox receives. */
  readonly env?: Readonly<Record<string, string>> | undefined;
  /** Labels a provider shows beside the sandbox, such as which workspace it serves. */
  readonly labels?: Readonly<Record<string, string>> | undefined;
}

/**
 * Where an acquired sandbox's files came from: kept from the sandbox asked for, restored from a
 * snapshot, or new. Acquisition is best effort; a caller that needs earlier files checks this
 * rather than assuming them.
 */
export type Filesystem = "retained" | "restored" | "fresh";

export interface Acquired {
  readonly sandbox: Running;
  readonly filesystem: Filesystem;
}

/**
 * A command run inside the sandbox, as its arguments rather than a shell string. `cwd` is
 * relative to the sandbox's working directory unless absolute, and `env` adds to the sandbox's.
 */
export interface Command {
  readonly argv: readonly [string, ...Array<string>];
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
}

export interface ExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A piece of a process's output, in the order the provider delivered it. */
export interface Output {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
}

/** A process running in the background until it exits, is killed, or its sandbox stops. */
export interface Process {
  /** Everything the process writes, from its start, for one consumer; it ends when the process does. */
  readonly output: Stream.Stream<Output, SandboxErrors.ProviderFailure>;
  /** The exit code, once the process exits. */
  readonly exit: Effect.Effect<number, SandboxErrors.ProviderFailure>;
  readonly kill: Effect.Effect<void, SandboxErrors.ProviderFailure>;
  /** Writes to standard input, where the provider supports it. */
  readonly write: (
    text: string,
  ) => Effect.Effect<void, SandboxErrors.Unsupported | SandboxErrors.ProviderFailure>;
}

/**
 * How to reach a port inside the sandbox from outside it. Requests carry `headers`, which may
 * authenticate with the provider; the URL alone may be public, so what listens must check its own
 * credentials.
 */
export interface Exposure {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** An acquired sandbox. Paths are relative to `workdir` unless absolute. */
export interface Running {
  readonly id: Id;
  /** The absolute directory commands start in and relative paths resolve against. */
  readonly workdir: string;
  /** Runs a command to completion. A nonzero exit is a result, not an error. */
  readonly exec: (command: Command) => Effect.Effect<ExecResult, SandboxErrors.ProviderFailure>;
  /** Starts a command in the background. */
  readonly spawn: (command: Command) => Effect.Effect<Process, SandboxErrors.ProviderFailure>;
  readonly expose: (port: number) => Effect.Effect<Exposure, SandboxErrors.ProviderFailure>;
  readonly readFile: (
    path: string,
  ) => Effect.Effect<Uint8Array, SandboxErrors.FileNotFound | SandboxErrors.ProviderFailure>;
  /** Writes a file, creating its directories. */
  readonly writeFile: (
    path: string,
    data: Uint8Array,
  ) => Effect.Effect<void, SandboxErrors.ProviderFailure>;
  /** Captures the filesystem, if the provider takes snapshots. */
  readonly snapshot: Effect.Effect<
    SnapshotReference,
    SandboxErrors.Unsupported | SandboxErrors.ProviderFailure
  >;
  /** Stops its processes and keeps its files, so the sandbox can be acquired again. */
  readonly stop: Effect.Effect<void, SandboxErrors.ProviderFailure>;
  /** Deletes the sandbox and its files. Its snapshots remain. */
  readonly destroy: Effect.Effect<void, SandboxErrors.ProviderFailure>;
}

/**
 * A sandbox provider, such as a local directory or a hosted service. It declares what it can do,
 * and acquires sandboxes that outlive the caller's process: whoever acquires one stops or
 * destroys it.
 */
export interface Provider {
  readonly name: string;
  readonly capabilities: Capabilities;
  readonly acquire: (
    options?: AcquireOptions,
  ) => Effect.Effect<Acquired, SandboxErrors.SnapshotUnavailable | SandboxErrors.ProviderFailure>;
  /** Deletes a snapshot this provider took. Deleting one already gone succeeds. */
  readonly deleteSnapshot: (
    snapshot: SnapshotReference,
  ) => Effect.Effect<void, SandboxErrors.SnapshotUnavailable | SandboxErrors.ProviderFailure>;
}

/**
 * The code behind a sandbox implementation, as a host installs it: its declaration, and its
 * provider, made with the access of the connection its sandboxes run under when the declaration
 * says they run under an account. The provider lasts for the scope it is made in.
 */
export interface Implementation {
  readonly declaration: SandboxImplementation.Declaration;
  readonly provider: (
    connection: ConnectionImplementation.Access | undefined,
  ) => Effect.Effect<Provider, SandboxErrors.ProviderFailure, Scope.Scope>;
}

export * as Sandbox from "./sandbox.ts";
