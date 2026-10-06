import { AgentV2, AgentV2Store } from "@amends/core/agent-v2";
import { Store } from "@amends/core/journal";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import type { MemoryDatabase } from "./database.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(AgentV2.Record));
const rows = Rows.make(Schema.fromJsonString(AgentV2.Record));

/** Agent records over the current workspace transaction. @category constructors */
export const make = Effect.fn("AgentsV2.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: AgentV2.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(AgentV2Store, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new AgentV2Store.Conflict({
          operation,
          message: "Expected an agent in this workspace",
        });
      return record;
    });
  /** Fails when another agent than `record` has its membership, as PostgreSQL's unique index does. */
  const requireOwnMembership = (
    operation: string,
    record: AgentV2.Record,
    space: MemoryDatabase.Space,
  ) =>
    Effect.gen(function* () {
      const agents = yield* rows
        .all(space.records.agentsV2)
        .pipe(Effect.mapError(storeFailure(AgentV2Store, operation)));
      if (agents.some((agent) => agent.memberId === record.memberId && agent.id !== record.id))
        return yield* new AgentV2Store.Conflict({
          operation,
          message: "Another agent has this membership",
        });
    });
  return AgentV2Store.Service.of({
    get: Effect.fn("AgentsV2.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(AgentV2.Id)(input);
        return yield* rows.get((yield* read).records.agentsV2, id);
      },
      Effect.mapError(storeFailure(AgentV2Store, "get")),
    ),
    list: Effect.gen(function* () {
      return yield* rows.all((yield* read).records.agentsV2);
    }).pipe(Effect.mapError(storeFailure(AgentV2Store, "list"))),
    insert: Effect.fn("AgentsV2.insert")(function* (input) {
      const record = yield* valid("insert", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(AgentV2Store, "insert")));
      if (space.records.agentsV2.has(record.id))
        return yield* new AgentV2Store.Conflict({
          operation: "insert",
          message: "Agent ID already exists",
        });
      yield* requireOwnMembership("insert", record, space);
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(AgentV2Store, "insert")));
      space.records.agentsV2.set(record.id, row);
    }),
    update: Effect.fn("AgentsV2.update")(function* (input) {
      const record = yield* valid("update", input);
      const space = yield* write.pipe(Effect.mapError(storeFailure(AgentV2Store, "update")));
      const found = yield* rows
        .get(space.records.agentsV2, record.id)
        .pipe(Effect.mapError(storeFailure(AgentV2Store, "update")));
      if (Option.isNone(found))
        return yield* new AgentV2Store.Conflict({
          operation: "update",
          message: "Expected a stored agent",
        });
      yield* requireOwnMembership("update", record, space);
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(AgentV2Store, "update")));
      space.records.agentsV2.set(record.id, row);
    }),
  });
});

/** Provide agent storage over the caller's binding. @category layers */
export const layer = Layer.effect(AgentV2Store.Service, make());

export * as AgentsV2 from "./agents-v2.ts";
