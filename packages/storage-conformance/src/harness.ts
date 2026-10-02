import type { WorkspaceDirectory, WorkspaceStorage } from "@amends/gateway";
import type { Context, Crypto, Effect, Layer, Scope } from "effect";

/**
 * The gateway contracts a storage adapter implements; one host holds both. Hosts over the same
 * storage share each workspace's signals, as processes over one system do.
 */
export type Host = WorkspaceStorage.Service | WorkspaceDirectory.Service;

export interface HostOptions {
  /**
   * Report a workspace that another writer holds as contention promptly, where the adapter
   * would otherwise wait for it. For tests of contention; hosts wait by default.
   */
  readonly failFast?: boolean | undefined;
}

/** One test's storage: empty when the test begins, released when it ends. */
export interface Storage {
  /**
   * Open a host over this storage as a separate process would, with its own connection or
   * pool, closed with the scope. Hosts share committed state and contend for its writers.
   */
  readonly connect: (
    options?: HostOptions,
  ) => Effect.Effect<Context.Context<Host>, never, Scope.Scope>;
  /**
   * Discard every projected record and checkpoint, keeping logs and read state, as rebuilding
   * projections does before replaying the journal. No storage contract performs this.
   */
  readonly discardProjections: Effect.Effect<void>;
  /** Count every stored record of any kind, so a test can show a rolled-back write left none. */
  readonly footprint: Effect.Effect<number>;
}

/** What an adapter supplies to run the conformance suites against itself. */
export interface Harness {
  /** Names the adapter in suite titles. */
  readonly name: string;
  /** False skips every suite, for an adapter whose backing system is absent here. */
  readonly available: boolean;
  /** Cryptography for the hosts under test. */
  readonly crypto: Layer.Layer<Crypto.Crypto>;
  /** Run one test over fresh, empty storage. */
  readonly withStorage: <A, E>(
    use: (storage: Storage) => Effect.Effect<A, E, Scope.Scope>,
  ) => Effect.Effect<A, E>;
}

export * as Harness from "./harness.ts";
