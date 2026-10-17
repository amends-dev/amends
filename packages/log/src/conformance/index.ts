/**
 * The test suites every storage adapter runs against itself, so that `Log` works the same over
 * each: what the storage contract promises of positions, commits, idempotency keys, entry reads,
 * waiting, and standalone appends, across hosts over the same storage. An adapter's tests call
 * `run` with a `Fixture`, which opens fresh storage for each test and stores over it. The suites
 * need `@effect/vitest`, an optional peer dependency of this package, which only an adapter's
 * tests install.
 *
 * **Example** (The memory store's conformance test)
 *
 * ```ts
 * import { MemoryStore } from "@amends-dev/log"
 * import * as Conformance from "@amends-dev/log/conformance"
 * import { Effect } from "effect"
 *
 * Conformance.run({
 *   name: "memory",
 *   available: true,
 *   withStorage: (use) =>
 *     Effect.scoped(
 *       Effect.flatMap(MemoryStore.makeDatabase, (database) =>
 *         use({
 *           connect: () => Effect.provideServiceEffect(MemoryStore.make, MemoryStore.Binding, MemoryStore.bind(database))
 *         })
 *       )
 *     )
 * })
 * ```
 *
 * @since 0.2.0
 */

import type * as Fixture from "./Fixture.ts"
import { logs } from "./internal/logs.ts"
import { standaloneAppends } from "./internal/standaloneAppends.ts"

export type {
  /**
   * How `Storage.connect` opens a store, re-exported so a fixture needs only this module.
   *
   * @category testing
   * @since 0.2.0
   */
  ConnectOptions,
  /**
   * What an adapter's tests give `run`.
   *
   * @category testing
   * @since 0.2.0
   */
  Fixture,
  /**
   * One test's storage, which `Fixture.withStorage` gives the test.
   *
   * @category testing
   * @since 0.2.0
   */
  Storage
} from "./Fixture.ts"

/**
 * Runs every suite against the storage `fixture` opens, in the test file that calls it.
 *
 * @category testing
 * @since 0.2.0
 */
export const run = (fixture: Fixture.Fixture) => {
  logs(fixture)
  standaloneAppends(fixture)
}
