import { Duration } from "effect";

/**
 * How long a job waits before it runs again after `failures` failed runs: doubling from two
 * seconds, up to five minutes.
 */
export const delay = (failures: number) =>
  Duration.seconds(Math.min(300, 2 ** Math.min(failures, 9)));

export * as JobRetry from "./retry.ts";
