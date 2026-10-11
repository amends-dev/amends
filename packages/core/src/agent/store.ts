import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type { Store } from "../journal/store.ts";

import { Agent } from "./agent.ts";
import { StoreInput } from "../journal/StoreInput.ts";
import type { WorkspaceId } from "../workspace/id.ts";

export class Failure extends Schema.TaggedError<Failure>()("AgentStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("AgentStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Internal projection storage. Reads honor an existing transaction; writes require one.
 *
 * `make` builds the store over a driver that implements this interface. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 */
export interface Interface {
  /** The agent, whether or not its membership ended. */
  readonly get: (id: Agent.Id) => Effect.Effect<Option.Option<Agent.Record>, Failure>;
  /** The workspace's agents, those whose membership ended included, in no particular order. */
  readonly list: Effect.Effect<ReadonlyArray<Agent.Record>, Failure>;
  /** Reject a reused ID. Never upsert. */
  readonly insert: (
    record: Agent.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  /** Replace a stored agent; a missing record conflicts. */
  readonly update: (
    record: Agent.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/agent/store/Service",
) {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (workspaceId: WorkspaceId.Id, driver: Interface): Interface => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Agent.Id, id), driver.get),
    list: driver.list,
    insert: (record) => Effect.flatMap(write("insert", Agent.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Agent.Record, record), driver.update),
  };
};

export * as AgentStore from "./store.ts";
