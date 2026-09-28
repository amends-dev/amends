import { Environment, EnvironmentStore } from "@amends/core/environment";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { environments } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Environment.Record));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...Environment.Record.fields, createdAt: Schema.DateTimeUtcFromDate }),
  ),
);
type Row = typeof environments.$inferSelect;
const toRecord = ({
  sandboxProviderId,
  sandboxHarness,
  sandboxConnectionId,
  sandboxTemplate,
  sandboxEnv,
  sandboxSetup,
  sandboxRetention,
  ...common
}: Row) => ({
  ...common,
  sandbox:
    sandboxProviderId === null
      ? null
      : {
          providerId: sandboxProviderId,
          harness: sandboxHarness,
          connectionId: sandboxConnectionId,
          template: sandboxTemplate,
          env: sandboxEnv,
          setup: sandboxSetup,
          retention: sandboxRetention,
        },
});
const decode = (rows: ReadonlyArray<Row>) =>
  decodeRows(rows.map(toRecord)).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))),
  );
const toRow = ({ sandbox, ...record }: Environment.Record): typeof environments.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  name: record.name,
  harnessId: record.harnessId,
  sandboxProviderId: sandbox?.providerId ?? null,
  sandboxHarness: sandbox?.harness ?? null,
  sandboxConnectionId: sandbox?.connectionId ?? null,
  sandboxTemplate: sandbox?.template ?? null,
  sandboxEnv: sandbox?.env ?? null,
  sandboxSetup: sandbox?.setup ?? null,
  sandboxRetention: sandbox?.retention ?? null,
  status: record.status,
  createdBy: record.createdBy,
  createdAt: DateTime.toDate(record.createdAt),
});

/** Environment records in the workspace's database. @category constructors */
export const make = Effect.fn("Environments.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = (id: Environment.Id) =>
    and(eq(environments.workspaceId, workspaceId), eq(environments.id, id));
  /** Validate a record for this workspace before writing it. */
  const valid = (operation: string, input: Environment.Record) =>
    Effect.gen(function* () {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(EnvironmentStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new EnvironmentStore.Conflict({
          operation,
          message: "Expected an environment in this workspace",
        });
      return record;
    });
  return EnvironmentStore.Service.of({
    workspaceId,
    get: Effect.fn("Environments.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Environment.Id)(input);
        return yield* guard(db.select().from(environments).where(inWorkspace(id))).pipe(
          Effect.flatMap(decode),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(EnvironmentStore, "get")),
    ),
    list: guard(
      db.select().from(environments).where(eq(environments.workspaceId, workspaceId)),
    ).pipe(Effect.flatMap(decode), Effect.mapError(storeFailure(EnvironmentStore, "list"))),
    insert: Effect.fn("Environments.insert")(function* (input) {
      const record = yield* valid("insert", input);
      yield* guard(db.insert(environments).values(toRow(record)), true).pipe(
        Effect.mapError(storeError(EnvironmentStore, "insert")),
      );
    }),
    update: Effect.fn("Environments.update")(function* (input) {
      const record = yield* valid("update", input);
      const updated = yield* guard(
        db
          .update(environments)
          .set(toRow(record))
          .where(inWorkspace(record.id))
          .returning({ id: environments.id }),
        true,
      ).pipe(Effect.mapError(storeError(EnvironmentStore, "update")));
      if (updated.length === 0)
        return yield* new EnvironmentStore.Conflict({
          operation: "update",
          message: "Expected a stored environment",
        });
    }),
  });
});

/** Provide environment storage over the caller's binding. @category layers */
export const layer = Layer.effect(EnvironmentStore.Service, make());

export * as Environments from "./environments.ts";
