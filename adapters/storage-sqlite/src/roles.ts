import { Role, RoleStore } from "@amends/core/authorization";
import { Store } from "@amends/core/journal";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { recordColumn } from "./record-column.ts";

const codec = Schema.fromJsonString(Role.Record);
const decode = recordColumn(codec);
const encode = Schema.encodeEffect(codec);
const encodePermissions = Schema.encodeEffect(
  Schema.fromJsonString(Role.Record.fields.permissions),
);

/** Named permission bundles; edits keep the role's identity. */
export const make = Effect.fn("Roles.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  /** Apply an edit to one role, reporting a conflict when it does not exist. */
  const edit = Effect.fn("Roles.edit")(function* (
    operation: string,
    id: Role.Id,
    path: string,
    value: string,
    json = false,
  ) {
    yield* Store.Transaction;
    const rows = yield* guard(
      json
        ? sql`UPDATE roles SET record = json_set(record, ${path}, json(${value})) WHERE workspace_id = ${workspaceId} AND id = ${id} RETURNING id`
        : sql`UPDATE roles SET record = json_set(record, ${path}, ${value}) WHERE workspace_id = ${workspaceId} AND id = ${id} RETURNING id`,
      true,
    ).pipe(Effect.mapError(storeError(RoleStore, operation)));
    if (rows.length === 0)
      return yield* new RoleStore.Conflict({ operation, message: "Role does not exist" });
  });
  return RoleStore.Service.of({
    workspaceId,
    get: (id) =>
      guard(sql`SELECT record FROM roles WHERE workspace_id = ${workspaceId} AND id = ${id}`).pipe(
        Effect.flatMap(decode),
        Effect.map(Array.head),
        Effect.mapError(storeFailure(RoleStore, "get")),
      ),
    insert: Effect.fn("Roles.insert")(function* (record) {
      yield* Store.Transaction;
      if (record.workspaceId !== workspaceId)
        return yield* new RoleStore.Conflict({
          operation: "insert",
          message: "Role belongs to another workspace",
        });
      const data = yield* encode(record).pipe(Effect.mapError(storeFailure(RoleStore, "insert")));
      yield* guard(
        sql`INSERT INTO roles VALUES (${workspaceId}, ${record.id}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(RoleStore, "insert")));
    }),
    rename: (id, name) => edit("rename", id, "$.name", name),
    setPermissions: Effect.fn("Roles.setPermissions")(function* (id, permissions) {
      const data = yield* encodePermissions(permissions).pipe(
        Effect.mapError(storeFailure(RoleStore, "setPermissions")),
      );
      yield* edit("setPermissions", id, "$.permissions", data, true);
    }),
  });
});

export const layer = Layer.effect(RoleStore.Service, make());

export * as Roles from "./roles.ts";
