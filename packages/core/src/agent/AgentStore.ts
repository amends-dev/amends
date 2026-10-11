/**
 * The storage contract for agents, which every storage adapter implements and `AgentProjection`
 * writes. Reads honor the caller's transaction when there is one; writes require it. The store
 * checks what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Schema } from "effect";
import type { Option } from "effect";
import type * as Store from "../journal/Store.ts";

import * as Agent from "./Agent.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * Storage failed while reading or writing agents.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("AgentStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, or a missing
 * agent.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("AgentStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The agent store, bound to one workspace by the host.
 *
 * What a storage adapter implements for agents: `AgentProjection` writes it, and `AgentService`
 * and `AgentQuery` read it.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class AgentStore extends Context.Service<
  AgentStore,
  {
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
>()("@amends-dev/core/agent/store/Service") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: AgentStore["Service"],
): AgentStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (id) => Effect.flatMap(read("get", Agent.Id, id), driver.get),
    list: driver.list,
    insert: (record) => Effect.flatMap(write("insert", Agent.Record, record), driver.insert),
    update: (record) => Effect.flatMap(write("update", Agent.Record, record), driver.update),
  };
};
