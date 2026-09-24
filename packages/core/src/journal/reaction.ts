import type { Effect } from "effect";
import type { Event } from "./event.ts";
import type { Store } from "./store.ts";

/**
 * What a commit does, in that same commit, when it publishes a fact, such as asking for background
 * work. Unlike a projection it leaves no record to rebuild, so replay never runs it, and a
 * retried publication that returns the original event does not run it again. It runs after the
 * fact's projections, and a failure fails the commit.
 */
export interface Definition<R = never> {
  /** The name of the fact it reacts to, at any version. */
  readonly fact: string;
  readonly react: (
    event: Event.Record,
  ) => Effect.Effect<void, Store.Failure, R | Store.Transaction>;
}

export * as Reaction from "./reaction.ts";
