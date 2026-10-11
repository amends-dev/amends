/**
 * The memory implementation of `AgentStore` from `../agent/AgentStore.ts`, over the workspace's
 * `Binding`. It keeps what the contract leaves to storage: a reused ID or an update of a missing
 * agent conflicts, and so does a second agent for one membership, which PostgreSQL refuses with a
 * unique index. `AgentStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { Agent, AgentStore } from "../agent/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import type * as MemoryDatabase from "./MemoryDatabase.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Agent.Agent));

/**
 * Agent records over the current workspace transaction.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Agents.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  /** Fails when another agent than `record` has its membership, as PostgreSQL's unique index does. */
  const requireOwnMembership = (
    operation: string,
    record: Agent.Agent,
    space: MemoryDatabase.Space,
  ) =>
    Effect.gen(function* () {
      const agents = yield* rows
        .all(space.records.of("agents"))
        .pipe(Effect.mapError(storeFailure(AgentStore, operation)));
      if (agents.some((agent) => agent.memberId === record.memberId && agent.id !== record.id))
        return yield* new AgentStore.Conflict({
          operation,
          message: "Another agent has this membership",
        });
    });
  const driver: AgentStore.AgentStore["Service"] = {
    get: Effect.fn("Agents.get")(
      function* (id) {
        return yield* rows.get((yield* read).records.of("agents"), id);
      },
      Effect.mapError(storeFailure(AgentStore, "get")),
    ),
    list: Effect.gen(function* () {
      return yield* rows.all((yield* read).records.of("agents"));
    }).pipe(Effect.mapError(storeFailure(AgentStore, "list"))),
    insert: Effect.fn("Agents.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(AgentStore, "insert")));
      if (space.records.of("agents").has(record.id))
        return yield* new AgentStore.Conflict({
          operation: "insert",
          message: "Agent ID already exists",
        });
      yield* requireOwnMembership("insert", record, space);
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(AgentStore, "insert")));
      space.records.of("agents").set(record.id, row);
    }),
    update: Effect.fn("Agents.update")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(AgentStore, "update")));
      const found = yield* rows
        .get(space.records.of("agents"), record.id)
        .pipe(Effect.mapError(storeFailure(AgentStore, "update")));
      if (Option.isNone(found))
        return yield* new AgentStore.Conflict({
          operation: "update",
          message: "Expected a stored agent",
        });
      yield* requireOwnMembership("update", record, space);
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(AgentStore, "update")));
      space.records.of("agents").set(record.id, row);
    }),
  };
  return AgentStore.make(workspaceId, driver);
});

/**
 * Provide agent storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(AgentStore.AgentStore, make());
