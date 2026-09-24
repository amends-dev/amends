import { BuiltinRoles, Role, RoleStore } from "@amends/core/authorization";
import { Store } from "@amends/core/journal";
import { and, eq, lt } from "drizzle-orm";
import { Array, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { builtinRoleRevisions, roles } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Role.Record));

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
    insert: Effect.fn("Roles.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(RoleStore, "insert")),
      );
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
    rename: Effect.fn("Roles.rename")(function* (id, name) {
      const validated = yield* Schema.decodeEffect(Role.Record.fields.name)(name).pipe(
        Effect.mapError(storeConflict(RoleStore, "rename")),
      );
      yield* edit("rename", id, { name: validated });
    }),
    setPermissions: Effect.fn("Roles.setPermissions")(function* (id, permissions) {
      const validated = yield* Schema.decodeEffect(Schema.toType(Role.Record.fields.permissions))(
        permissions,
      ).pipe(Effect.mapError(storeConflict(RoleStore, "setPermissions")));
      yield* edit("setPermissions", id, { permissions: [...validated] });
    }),
    builtinRevision: guard(
      db
        .select({ revision: builtinRoleRevisions.revision })
        .from(builtinRoleRevisions)
        .where(eq(builtinRoleRevisions.workspaceId, workspaceId)),
    ).pipe(
      Effect.map((rows) => Array.head(rows.map(({ revision }) => revision))),
      Effect.mapError(storeFailure(RoleStore, "builtinRevision")),
    ),
    recordBuiltinRevision: Effect.fn("Roles.recordBuiltinRevision")(function* (input) {
      yield* Store.Transaction;
      const revision = yield* Schema.decodeEffect(BuiltinRoles.Revision)(input).pipe(
        Effect.mapError(storeConflict(RoleStore, "recordBuiltinRevision")),
      );
      // Only a later revision replaces the recorded one.
      const rows = yield* guard(
        db
          .insert(builtinRoleRevisions)
          .values({ workspaceId, revision })
          .onConflictDoUpdate({
            target: builtinRoleRevisions.workspaceId,
            set: { revision },
            setWhere: lt(builtinRoleRevisions.revision, revision),
          })
          .returning({ revision: builtinRoleRevisions.revision }),
        true,
      ).pipe(Effect.mapError(storeError(RoleStore, "recordBuiltinRevision")));
      if (rows.length === 0)
        return yield* new RoleStore.Conflict({
          operation: "recordBuiltinRevision",
          message: "Expected a later built-in revision",
        });
    }),
  });
});

/**
 * Provide RoleStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(RoleStore.Service, make());

export * as Roles from "./roles.ts";
