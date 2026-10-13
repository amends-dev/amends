/**
 * Reactions: what a commit does, in that same commit, when it publishes a fact, such as requesting
 * a job. `Journal.layer` takes them beside its projections; core's come from `TurnJobs` and
 * `DeliveryJobs`.
 *
 * @since 0.1.0
 */
import type { Effect } from "effect";
import type * as Event from "./Event.ts";
import type * as Store from "./Store.ts";
import type * as StoreError from "./StoreError.ts";

/**
 * What a commit does, in that same commit, when it publishes a fact, such as requesting a job.
 * Unlike a projection it leaves no record to rebuild, so replay never runs it, and a
 * retried publication that returns the original event does not run it again. It runs after the
 * fact's projections, and a failure fails the commit.
 *
 * @category models
 * @since 0.1.0
 */
export interface Definition<R = never> {
  /** The name of the fact it reacts to, at any version. */
  readonly fact: string;
  /** Does what the published event asks for, with the publishing commit's transaction. */
  readonly react: (
    event: Event.Event,
  ) => Effect.Effect<void, StoreError.StoreError, R | Store.Transaction>;
}
