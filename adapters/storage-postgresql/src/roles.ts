import { Role, RoleStore } from "@amends/core/authorization";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeError, storeFailure } from "./errors.ts";
import { roles } from "./schema.ts";

/** The table's columns already have the record's names; decoding checks brands and uniqueness. */
const decode = Schema.decodeUnknownEffect(Schema.Array(Role.Record));

/**
 * Named permission bundles; edits keep the role's identity.
 *
 * @category constructors
 */
export const make = Effect.fn("Roles.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(roles.workspaceId, workspaceId);
  /** Apply an edit to one role, reporting a conflict when it does not exist. */
  const edit = Effect.fn("Roles.edit")(function* (
    operation: string,
    id: Role.Id,
    change: Partial<typeof roles.$inferInsert>,
  ) {
    yield* Store.Transaction;
    const rows = yield* guard(
      db
        .update(roles)
        .set(change)
        .where(and(inWorkspace, eq(roles.id, id)))
        .returning({ id: roles.id }),
      true,
    ).pipe(Effect.mapError(storeError(RoleStore, operation)));
    if (rows.length === 0)
      return yield* new RoleStore.Conflict({ operation, message: "Role does not exist" });
  });
  return RoleStore.Service.of({
    workspaceId,
    get: (id) =>
      guard(
        db
          .select()
          .from(roles)
          .where(and(inWorkspace, eq(roles.id, id))),
      ).pipe(
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
      yield* guard(
        db.insert(roles).values({
          workspaceId,
          id: record.id,
          name: record.name,
          permissions: [...record.permissions],
        }),
        true,
      ).pipe(Effect.mapError(storeError(RoleStore, "insert")));
    }),
    rename: (id, name) => edit("rename", id, { name }),
    setPermissions: (id, permissions) =>
      edit("setPermissions", id, { permissions: [...permissions] }),
  });
});

/**
 * Provide RoleStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(RoleStore.Service, make());

export * as Roles from "./roles.ts";
