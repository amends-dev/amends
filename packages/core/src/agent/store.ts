import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { Agent } from "./agent.ts";

export class Failure extends Schema.TaggedError<Failure>()("AgentStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("AgentStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  /** The agent, whether or not its membership ended. */
  readonly get: (id: Agent.Id) => Effect.Effect<Option.Option<Agent.Record>, Failure>;
  /** The workspace's agents, those whose membership ended included, in no particular order. */
  readonly list: Effect.Effect<ReadonlyArray<Agent.Record>, Failure>;
  /** Reject invalid or foreign records and reused IDs. Never upsert. */
  readonly insert: (
    record: Agent.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored agent; a missing, foreign, or invalid record conflicts. */
  readonly update: (
    record: Agent.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/agent/store/Service",
) {}

export * as AgentStore from "./store.ts";
