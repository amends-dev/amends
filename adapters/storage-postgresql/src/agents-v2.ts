import { AgentV2, AgentV2Store } from "@amends/core/agent-v2";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { agentsV2 } from "./schema.ts";

type Row = typeof agentsV2.$inferSelect;

const validateRecord = Schema.decodeEffect(Schema.toType(AgentV2.Record));
const decodeRecord = Schema.decodeUnknownEffect(
  Schema.Struct({ ...AgentV2.Record.fields, createdAt: Schema.DateTimeUtcFromDate }),
);

/** The record a row stores, before its fields are checked. */
const recordOf = (row: Row) => ({
  id: row.id,
  workspaceId: row.workspaceId,
  memberId: row.memberId,
  instructions: row.instructions,
  harness:
    row.harnessConnectionId === null
      ? { _tag: "Auto" }
      : { _tag: "Connection", connectionId: row.harnessConnectionId },
  model: {
    connectionId: row.modelConnectionId,
    id: row.modelId,
    ...(row.modelEffort === null ? {} : { effort: row.modelEffort }),
  },
  sandbox: row.sandboxConnectionId === null ? null : { connectionId: row.sandboxConnectionId },
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const decodeRows = (rows: ReadonlyArray<Row>) =>
  Effect.forEach(rows, (row) => decodeRecord(recordOf(row)));

const toRow = (record: AgentV2.Record): typeof agentsV2.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  memberId: record.memberId,
  instructions: record.instructions,
  harnessConnectionId: record.harness._tag === "Connection" ? record.harness.connectionId : null,
  modelConnectionId: record.model.connectionId,
  modelId: record.model.id,
  modelEffort: record.model.effort ?? null,
  sandboxConnectionId: record.sandbox?.connectionId ?? null,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt),
});

/** Agent records in the workspace's database. @category constructors */
export const make = Effect.fn("AgentsV2.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = (id: AgentV2.Id) =>
    and(eq(agentsV2.workspaceId, workspaceId), eq(agentsV2.id, id));
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
  return AgentV2Store.Service.of({
    get: Effect.fn("AgentsV2.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(AgentV2.Id)(input);
        return yield* guard(db.select().from(agentsV2).where(inWorkspace(id))).pipe(
          Effect.flatMap(decodeRows),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(AgentV2Store, "get")),
    ),
    list: guard(db.select().from(agentsV2).where(eq(agentsV2.workspaceId, workspaceId))).pipe(
      Effect.flatMap(decodeRows),
      Effect.mapError(storeFailure(AgentV2Store, "list")),
    ),
    insert: Effect.fn("AgentsV2.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(agentsV2).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(AgentV2Store, "insert")),
      );
    }),
    update: Effect.fn("AgentsV2.update")(function* (input) {
      const record = yield* valid("update", input);
      const updated = yield* guard(
        db
          .update(agentsV2)
          .set(toRow(record))
          .where(inWorkspace(record.id))
          .returning({ id: agentsV2.id }),
        true,
      ).pipe(Effect.mapError(storeError(AgentV2Store, "update")));
      if (updated.length === 0)
        return yield* new AgentV2Store.Conflict({
          operation: "update",
          message: "Expected a stored agent",
        });
    }),
  });
});

/** Provide agent storage over the caller's binding. @category layers */
export const layer = Layer.effect(AgentV2Store.Service, make());

export * as AgentsV2 from "./agents-v2.ts";
