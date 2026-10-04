/**
 * The test suites every sandbox provider runs against itself, so that code written against
 * `SandboxProvider` and `Sandbox` works the same on each. A provider's tests call `run` with a
 * `Fixture`, which makes the provider and gives what the suites cannot assume of every provider,
 * such as how to serve files on a port.
 *
 * The suites run on the live clock, as a provider takes real time. Each test names the sandboxes
 * and templates it creates as no other test or run does, and destroys its sandboxes when it ends,
 * so that the suites can run against a provider other runs share, such as one account on a hosted
 * platform.
 */
import type { Fixture } from "./Fixture.ts";
import { lifecycle } from "./lifecycle.ts";
import { network } from "./network.ts";
import { processes } from "./processes.ts";

export type { Fixture } from "./Fixture.ts";

/** Runs every suite against the provider `fixture` makes. */
export const run = <R>(fixture: Fixture<R>) => {
  lifecycle(fixture);
  processes(fixture);
  network(fixture);
};
