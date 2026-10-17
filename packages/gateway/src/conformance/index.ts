/**
 * The test suites every storage adapter runs against itself, so that core and the gateway work
 * the same over each: what the storage contracts promise, from the journal's transactions and
 * logs to the host's accounts, across hosts over the same storage. An adapter's tests call `run`
 * with a `Fixture`, which opens fresh storage for each test and hosts over it. The suites need
 * `@effect/vitest`, an optional peer dependency of this package, which only an adapter's tests
 * install.
 *
 * @since 0.1.0
 */

import * as LogConformance from "@amends-dev/log/conformance"
import * as Effect from "effect/Effect"
import type * as Fixture from "./Fixture.ts"
import { accounts } from "./internal/accounts.ts"
import { changeFeed } from "./internal/changeFeed.ts"
import { contracts } from "./internal/contracts.ts"
import { factMetadata } from "./internal/factMetadata.ts"
import { idempotency } from "./internal/idempotency.ts"
import { journal } from "./internal/journal.ts"
import { reads } from "./internal/reads.ts"
import { signals } from "./internal/signals.ts"
import { signInStorage } from "./internal/signInStorage.ts"
import { transactions } from "./internal/transactions.ts"
import * as Support from "./Support.ts"

export type {
  /**
   * What an adapter's tests give `run`, re-exported so they need only this module.
   *
   * @category testing
   * @since 0.1.0
   */
  Fixture,
  /**
   * The gateway contracts one host over the storage holds.
   *
   * @category testing
   * @since 0.1.0
   */
  Host,
  /**
   * How `Storage.connect` opens a host.
   *
   * @category testing
   * @since 0.1.0
   */
  HostOptions,
  /**
   * One test's storage, which `Fixture.withStorage` gives the test.
   *
   * @category testing
   * @since 0.1.0
   */
  Storage
} from "./Fixture.ts"

/**
 * What the suites share, for an adapter's own tests: identities, bound stores by name, and a core
 * or gateway over a host.
 *
 * @category testing
 * @since 0.1.0
 */
export * as Support from "./Support.ts"

/**
 * Runs every suite against the storage `fixture` opens, in the test file that calls it.
 *
 * @category testing
 * @since 0.1.0
 */
export const run = (fixture: Fixture.Fixture) => {
  // A workspace's logs keep what the log package promises of every store.
  LogConformance.run({
    name: fixture.name,
    available: fixture.available,
    withStorage: (use) =>
      fixture.withStorage((storage) =>
        use({
          connect: (options) =>
            Effect.flatMap(storage.connect(options), (host) =>
              Effect.map(Support.forWorkspace(host, Support.workspaceId), (bound) => bound.store)
            )
        })
      )
  })
  journal(fixture)
  transactions(fixture)
  changeFeed(fixture)
  signals(fixture)
  idempotency(fixture)
  factMetadata(fixture)
  reads(fixture)
  contracts(fixture)
  accounts(fixture)
  signInStorage(fixture)
}
