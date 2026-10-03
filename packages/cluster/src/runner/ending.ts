/**
 * How an attempt ended: the turn finished; its state changed under it, so the run prepares it
 * again; it stopped short in a way worth retrying, for this problem, so the run rests before
 * preparing again; or it can't run, for this reason, which fails it.
 */
import type { HarnessErrors } from "@amends/harness";
import { Data } from "effect";

export type Ending = Data.TaggedEnum<{
  Finished: {};
  Again: {};
  Interrupted: { readonly problem: HarnessErrors.Problem };
  Unrunnable: { readonly reason: string };
}>;

export const { Finished, Again, Interrupted, Unrunnable, $is, $match } = Data.taggedEnum<Ending>();

export * as Ending from "./ending.ts";
