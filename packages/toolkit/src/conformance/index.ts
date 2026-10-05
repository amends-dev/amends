/**
 * The test suites every kind of tool source runs against itself, so that code written against
 * `ToolSource` works the same on each: what a source lists, how its calls run, what it reports of a
 * system that cannot be used, and what a model reads of it through the toolkit and an assembly. A
 * source's tests call `run` with a `Fixture`, which makes the source over a system that serves the
 * tools the suites call. They need `@effect/vitest`, an optional peer dependency of this package,
 * which only a source's tests install.
 *
 * The suites run on the live clock, as a source over a network takes real time. Each test makes a
 * source of its own, so that no test depends on another.
 */
import { calls } from "./calls.ts";
import { conditions } from "./conditions.ts";
import { discovery } from "./discovery.ts";
import type { Fixture } from "./Fixture.ts";
import { toolkit } from "./toolkit.ts";

export type { Condition, Fixture, Subject, ToolCase } from "./Fixture.ts";

/** Runs every suite against the source `fixture` makes. */
export const run = (fixture: Fixture) => {
  discovery(fixture);
  calls(fixture);
  conditions(fixture);
  toolkit(fixture);
};
