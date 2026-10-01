/**
 * How an attempt ended: the turn finished; its state changed under it, so the run prepares it
 * again; it stopped short in a way worth retrying, so the run rests before preparing again; or it
 * can't run, for this reason, which fails it.
 */
export type Ending =
  | { readonly _tag: "Finished" }
  | { readonly _tag: "Again" }
  | { readonly _tag: "Interrupted" }
  | { readonly _tag: "Unrunnable"; readonly reason: string };

export const finished: Ending = { _tag: "Finished" };
export const again: Ending = { _tag: "Again" };
export const interrupted: Ending = { _tag: "Interrupted" };
export const unrunnable = (reason: string): Ending => ({ _tag: "Unrunnable", reason });

export * as Ending from "./ending.ts";
