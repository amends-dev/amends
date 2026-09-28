import { Context, Effect, Schema } from "effect";
import type { Reaction } from "../journal/reaction.ts";
import type { Store } from "../journal/store.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { TurnFacts } from "./facts.ts";
import type { Turn } from "./turn.ts";

/**
 * Requests for a workspace's turns to run. Hosts supply it, bound to the workspace, and deliver
 * each request to whatever runs turns; a host that runs none accepts requests and runs nothing,
 * so accepted work waits queued.
 */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Ask for a turn to run, as part of the caller's commit: the request is stored with the commit
   * and discarded if it rolls back. Asking again for the same turn asks once.
   */
  readonly request: (turnId: Turn.Id) => Effect.Effect<void, Store.Failure, Store.Transaction>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/dispatch/Service",
) {}

const decodeCreated = Schema.decodeUnknownSync(
  Schema.Struct({ id: TurnFacts.Created.payload.fields.id }),
);

/** A commit that creates a turn asks for it to run, in that same commit. */
export const reactions: ReadonlyArray<Reaction.Definition<Service>> = [
  {
    fact: TurnFacts.Created.name,
    react: Effect.fnUntraced(function* (event) {
      const { id } = decodeCreated(event.payload);
      yield* (yield* Service).request(id);
    }),
  },
];

export * as TurnDispatch from "./dispatch.ts";
