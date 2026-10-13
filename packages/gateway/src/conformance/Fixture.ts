/**
 * What a storage adapter gives the conformance suites: fresh storage for each test, further hosts
 * over it, and what the suites need that no storage contract performs, such as discarding
 * projections and counting stored records. An adapter implements it in its `test/fixture.ts` and
 * passes it to `run`.
 *
 * @since 0.1.0
 */
import type * as Accounts from "../Accounts.ts";
import type * as SignInStorage from "../SignInStorage.ts";
import type * as WorkspaceDirectory from "../WorkspaceDirectory.ts";
import type * as WorkspaceStorage from "../WorkspaceStorage.ts";
import type * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

/**
 * The gateway contracts a storage adapter implements, with the cryptography it was built over;
 * one host holds them all. Hosts over the same storage share each workspace's signals, as
 * processes over one system do.
 *
 * @category testing
 * @since 0.1.0
 */
export type Host =
  | WorkspaceStorage.WorkspaceStorage
  | WorkspaceDirectory.WorkspaceDirectory
  | Accounts.Accounts
  | SignInStorage.SignInStorage
  | Crypto.Crypto;

/**
 * How `Storage.connect` opens a host.
 *
 * @category testing
 * @since 0.1.0
 */
export interface HostOptions {
  /**
   * Report a workspace that another writer holds as contention promptly, where the adapter
   * would otherwise wait for it. For tests of contention; hosts wait by default.
   */
  readonly failFast?: boolean | undefined;
}

/**
 * One test's storage: empty when the test begins, released when it ends.
 *
 * @category testing
 * @since 0.1.0
 */
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

/**
 * What an adapter's tests give `run`: how to open fresh storage, and what the suites cannot
 * assume.
 *
 * @category testing
 * @since 0.1.0
 */
export interface Fixture {
  /** Names the adapter in suite titles. */
  readonly name: string;
  /** False skips every suite, for an adapter whose backing system is absent here. */
  readonly available: boolean;
  /** Run one test over fresh, empty storage. */
  readonly withStorage: <A, E>(
    use: (storage: Storage) => Effect.Effect<A, E, Scope.Scope>,
  ) => Effect.Effect<A, E>;
}
