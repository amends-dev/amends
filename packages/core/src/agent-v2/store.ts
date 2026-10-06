import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../journal/store.ts";

import type { AgentV2 } from "./agent.ts";

export class Failure extends Schema.TaggedError<Failure>()("AgentV2Store.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("AgentV2Store.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Internal projection storage. Reads honor an existing transaction; writes require one. */
export interface Interface {
  /** The agent, whether or not its membership ended. */
  readonly get: (id: AgentV2.Id) => Effect.Effect<Option.Option<AgentV2.Record>, Failure>;
  /** The workspace's agents, those whose membership ended included, in no particular order. */
  readonly list: Effect.Effect<ReadonlyArray<AgentV2.Record>, Failure>;
  /** Reject invalid or foreign records and reused IDs. Never upsert. */
  readonly insert: (
    record: AgentV2.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored agent; a missing, foreign, or invalid record conflicts. */
  readonly update: (
    record: AgentV2.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/agent-v2/store/Service",
) {}

export * as AgentV2Store from "./store.ts";
