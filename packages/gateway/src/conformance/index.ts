/**
 * The test suites every storage adapter runs against itself, so that core and the gateway work
 * the same over each: what the storage contracts promise, from the journal's transactions and
 * logs to the host's accounts, across hosts over the same storage. An adapter's tests call `run`
 * with a `Fixture`, which opens fresh storage for each test and hosts over it. The suites need
 * `@effect/vitest`, an optional peer dependency of this package, which only an adapter's tests
 * install.
 */
import { accounts } from "./accounts.ts";
import { changeFeed } from "./change-feed.ts";
import { contracts } from "./contracts.ts";
import { factMetadata } from "./fact-metadata.ts";
import type { Fixture } from "./fixture.ts";
import { idempotency } from "./idempotency.ts";
import { journal } from "./journal.ts";
import { reads } from "./reads.ts";
import { sessionLogs } from "./session-logs.ts";
import { signInStorage } from "./sign-in-storage.ts";
import { signals } from "./signals.ts";
import { standaloneAppends } from "./standalone-appends.ts";
import { transactions } from "./transactions.ts";

export type { Fixture, Host, HostOptions, Storage } from "./fixture.ts";
export { Support } from "./support.ts";

/** Runs every suite against the storage `fixture` opens, in the test file that calls it. */
export const run = (fixture: Fixture) => {
  journal(fixture);
  transactions(fixture);
  changeFeed(fixture);
  signals(fixture);
  sessionLogs(fixture);
  standaloneAppends(fixture);
  idempotency(fixture);
  factMetadata(fixture);
  reads(fixture);
  contracts(fixture);
  accounts(fixture);
  signInStorage(fixture);
};
