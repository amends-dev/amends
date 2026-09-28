/**
 * The conformance suites. Each registers its tests for one harness; a provider adapter's test
 * files call the suites it runs.
 */
export { commands } from "./commands.ts";
export { files } from "./files.ts";
export { lifecycle } from "./lifecycle.ts";
export { ports } from "./ports.ts";
export { processes } from "./processes.ts";
export { snapshots } from "./snapshots.ts";

export * as Suites from "./suites.ts";
