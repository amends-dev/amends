import { Context, Effect, Layer, Schema } from "effect";
import type { Event } from "../journal/event.ts";
import type { Reaction } from "../journal/reaction.ts";
import type { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";

import { TurnFacts } from "./facts.ts";
import type { Turn } from "./turn.ts";

/** A request for a workspace's turn to run. */
export interface Request {
  readonly workspaceId: WorkspaceId.Id;
  readonly turnId: Turn.Id;
}

/**
 * Turn jobs: requests for workspaces' turns to run. Hosts supply it and deliver each request to
 * whatever runs turn jobs; a host that runs none accepts requests and runs nothing, so accepted
 * work waits queued.
 */
export interface Interface {
  /**
   * Request a turn's job as part of the caller's commit: the request is stored with the commit and
   * discarded if it rolls back. Asking again for the same turn asks once.
   */
  readonly request: (request: Request) => Effect.Effect<void, Store.Failure, Store.Transaction>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/jobs/Service",
) {}

/**
 * For a host that runs no turn jobs, or runs turns itself: requests are accepted and nothing runs,
 * so agents still accept their work, which waits queued until something runs it.
 */
export const noRunner: Interface = Service.of({ request: () => Effect.void });

/** @category layers */
export const layerNoRunner = Layer.succeed(Service, noRunner);

const decodeCreated = Schema.decodeUnknownSync(
  Schema.Struct({ id: TurnFacts.Created.payload.fields.id }),
);
const requestTurnJob = Effect.fnUntraced(function* (event: Event.Record) {
  const { id } = decodeCreated(event.payload);
  yield* (yield* Service).request({ workspaceId: event.provenance.workspaceId, turnId: id });
});

/** A commit that creates a turn, or retries one, requests its turn job, in that same commit. */
export const reactions: ReadonlyArray<Reaction.Definition<Service>> = [
  { fact: TurnFacts.Created.name, react: requestTurnJob },
  { fact: TurnFacts.Retried.name, react: requestTurnJob },
];

export * as TurnJobs from "./jobs.ts";
