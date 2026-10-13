/**
 * The PostgreSQL driver for `RoleStore.RoleStore`, over two tables: `roles`, each named bundle of
 * permissions as a text array, and `builtin_role_revisions`, the built-in bundle revision the
 * workspace's roles hold. `RoleStore.make` checks every input before the driver sees it, so the
 * driver keeps only what storage keeps: the primary key rejects a reused ID, an edit that finds no
 * role is rejected, and recording a revision is an upsert that only moves it forward, rejected
 * otherwise. Every statement is scoped to the binding's workspace and runs under its `guard`, which
 * lets a read join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */
import { Role, RoleStore } from "@amends-dev/core/authorization";
import { and, eq, lt } from "drizzle-orm";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Binding from "./Binding.ts";
import { storeError } from "./internal/errors.ts";
import { builtinRoleRevisions, roles } from "./internal/schema.ts";
import { StoreError } from "@amends-dev/core/journal";

/** The table's columns already have the record's names; decoding checks brands and uniqueness. */
const decode = Schema.decodeUnknownEffect(Schema.Array(Role.Role));

/**
 * Builds the role store for the binding's workspace: this module's driver inside
 * `RoleStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Roles.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(roles.workspaceId, workspaceId);
  /** Apply an edit to one role, reporting a conflict when it does not exist. */
  const edit = Effect.fn("Roles.edit")(function* (
    operation: string,
    id: Role.Id,
    change: Partial<typeof roles.$inferInsert>,
  ) {
    const rows = yield* guard(
      db
        .update(roles)
        .set(change)
        .where(and(inWorkspace, eq(roles.id, id)))
        .returning({ id: roles.id }),
      true,
    ).pipe(Effect.mapError(storeError("RoleStore", operation)));
    if (rows.length === 0)
      return yield* StoreError.rejected("RoleStore", operation, "Role does not exist");
  });
  const driver: RoleStore.RoleStore["Service"] = {
    get: (id) =>
      guard(
        db
          .select()
          .from(roles)
          .where(and(inWorkspace, eq(roles.id, id))),
      ).pipe(
        Effect.flatMap(decode),
        Effect.map(Array.head),
        Effect.mapError(StoreError.failed("RoleStore", "get")),
      ),
    insert: Effect.fn("Roles.insert")(function* (record) {
      yield* guard(
        db.insert(roles).values({
          workspaceId,
          id: record.id,
          name: record.name,
          permissions: [...record.permissions],
        }),
        true,
      ).pipe(Effect.mapError(storeError("RoleStore", "insert")));
    }),
    rename: Effect.fn("Roles.rename")(function* (id, validated) {
      yield* edit("rename", id, { name: validated });
    }),
    setPermissions: Effect.fn("Roles.setPermissions")(function* (id, validated) {
      yield* edit("setPermissions", id, { permissions: [...validated] });
    }),
    builtinRevision: guard(
      db
        .select({ revision: builtinRoleRevisions.revision })
        .from(builtinRoleRevisions)
        .where(eq(builtinRoleRevisions.workspaceId, workspaceId)),
    ).pipe(
      Effect.map((rows) => Array.head(rows.map(({ revision }) => revision))),
      Effect.mapError(StoreError.failed("RoleStore", "builtinRevision")),
    ),
    recordBuiltinRevision: Effect.fn("Roles.recordBuiltinRevision")(function* (revision) {
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
      ).pipe(Effect.mapError(storeError("RoleStore", "recordBuiltinRevision")));
      if (rows.length === 0)
        return yield* StoreError.rejected(
          "RoleStore",
          "recordBuiltinRevision",
          "Expected a later built-in revision",
        );
    }),
  };
  return RoleStore.make(workspaceId, driver);
});

/**
 * Provides `RoleStore.RoleStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(RoleStore.RoleStore, make());
