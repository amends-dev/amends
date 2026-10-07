import { Agent, AgentStore } from "@amends/core/agent";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { agents } from "./schema.ts";

type Row = typeof agents.$inferSelect;

const validateRecord = Schema.decodeEffect(Schema.toType(Agent.Record));
const decodeRecord = Schema.decodeUnknownEffect(
  Schema.Struct({ ...Agent.Record.fields, createdAt: Schema.DateTimeUtcFromDate }),
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

const toRow = (record: Agent.Record): typeof agents.$inferInsert => ({
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
export const make = Effect.fn("Agents.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = (id: Agent.Id) => and(eq(agents.workspaceId, workspaceId), eq(agents.id, id));
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
  return AgentStore.Service.of({
    get: Effect.fn("Agents.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Agent.Id)(input);
        return yield* guard(db.select().from(agents).where(inWorkspace(id))).pipe(
          Effect.flatMap(decodeRows),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(AgentStore, "get")),
    ),
    list: guard(db.select().from(agents).where(eq(agents.workspaceId, workspaceId))).pipe(
      Effect.flatMap(decodeRows),
      Effect.mapError(storeFailure(AgentStore, "list")),
    ),
    insert: Effect.fn("Agents.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(agents).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(AgentStore, "insert")),
      );
    }),
    update: Effect.fn("Agents.update")(function* (input) {
      const record = yield* valid("update", input);
      const updated = yield* guard(
        db
          .update(agents)
          .set(toRow(record))
          .where(inWorkspace(record.id))
          .returning({ id: agents.id }),
        true,
      ).pipe(Effect.mapError(storeError(AgentStore, "update")));
      if (updated.length === 0)
        return yield* new AgentStore.Conflict({
          operation: "update",
          message: "Expected a stored agent",
        });
    }),
  });
});

/** Provide agent storage over the caller's binding. @category layers */
export const layer = Layer.effect(AgentStore.Service, make());

export * as Agents from "./agents.ts";
