import { Duration } from "effect";

/**
 * How long work on Effect Cluster waits before it runs again after `failures` failed runs:
 * doubling from two seconds, up to five minutes. Background processes and turns both ask for
 * their next run this way.
 */
export const delay = (failures: number) =>
  Duration.seconds(Math.min(300, 2 ** Math.min(failures, 9)));

export * as JobRetry from "./retry.ts";
