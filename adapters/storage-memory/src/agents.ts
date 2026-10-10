import { Agent, AgentStore } from "@amends-dev/core/agent";
import { Store } from "@amends-dev/core/journal";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import type { MemoryDatabase } from "./database.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Agent.Record));
const rows = Rows.make(Schema.fromJsonString(Agent.Record));

/** Agent records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Agents.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Agent.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(AgentStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new AgentStore.Conflict({
          operation,
          message: "Expected an agent in this workspace",
        });
      return record;
    });
  /** Fails when another agent than `record` has its membership, as PostgreSQL's unique index does. */
  const requireOwnMembership = (
    operation: string,
    record: Agent.Record,
    space: MemoryDatabase.Space,
  ) =>
    Effect.gen(function* () {
      const agents = yield* rows
        .all(space.records.agents)
        .pipe(Effect.mapError(storeFailure(AgentStore, operation)));
      if (agents.some((agent) => agent.memberId === record.memberId && agent.id !== record.id))
        return yield* new AgentStore.Conflict({
          operation,
          message: "Another agent has this membership",
        });
    });
  return AgentStore.Service.of({
    get: Effect.fn("Agents.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Agent.Id)(input);
        return yield* rows.get((yield* read).records.agents, id);
      },
      Effect.mapError(storeFailure(AgentStore, "get")),
    ),
    list: Effect.gen(function* () {
      return yield* rows.all((yield* read).records.agents);
    }).pipe(Effect.mapError(storeFailure(AgentStore, "list"))),
    insert: Effect.fn("Agents.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(AgentStore, "insert")));
      if (space.records.agents.has(record.id))
        return yield* new AgentStore.Conflict({
          operation: "insert",
          message: "Agent ID already exists",
        });
      yield* requireOwnMembership("insert", record, space);
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(AgentStore, "insert")));
      space.records.agents.set(record.id, row);
    }),
    update: Effect.fn("Agents.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(AgentStore, "update")));
      const found = yield* rows
        .get(space.records.agents, record.id)
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
      space.records.agents.set(record.id, row);
    }),
  });
});

/** Provide agent storage over the caller's binding. @category layers */
export const layer = Layer.effect(AgentStore.Service, make());

export * as Agents from "./agents.ts";
