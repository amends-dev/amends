/**
 * What a storage adapter gives the conformance suites: fresh storage for each test, and stores
 * over it as separate hosts would open them. An adapter implements it in its tests and passes it
 * to `run`.
 *
 * @since 0.2.0
 */

import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import type * as Store from "../Store.ts"

/**
 * How `Storage.connect` opens a store.
 *
 * @category testing
 * @since 0.2.0
 */
export interface ConnectOptions {
  /**
   * Report a writer another connection holds as contention promptly, where the adapter would
   * otherwise wait for it. For tests of contention; stores wait by default.
   */
  readonly failFast?: boolean | undefined
}

/**
 * One test's storage: empty when the test begins, released when it ends.
 *
 * @category testing
 * @since 0.2.0
 */
export interface Storage {
  /**
   * Open a store over this storage as a separate process would, with its own connection or pool,
   * closed with the scope. Stores opened here share committed state and contend for its writers.
   */
  readonly connect: (options?: ConnectOptions) => Effect.Effect<Store.Store["Service"], never, Scope.Scope>
}

/**
 * What an adapter's tests give `run`: how to open fresh storage, and whether it is there to test.
 *
 * @category testing
 * @since 0.2.0
 */
export interface Fixture {
  /** Names the adapter in suite titles. */
  readonly name: string
  /** False skips every suite, for an adapter whose backing system is absent here. */
  readonly available: boolean
  /** Run one test over fresh, empty storage. */
  readonly withStorage: <A, E>(use: (storage: Storage) => Effect.Effect<A, E, Scope.Scope>) => Effect.Effect<A, E>
}
