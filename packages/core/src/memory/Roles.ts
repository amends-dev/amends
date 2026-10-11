/**
 * The memory implementation of `RoleStore` from `../authorization/RoleStore.ts`, over the
 * workspace's `Binding`: roles, and the revision of the built-in roles the workspace was last
 * given, as one row. It keeps what the contract leaves to storage: a reused ID conflicts, renaming
 * or setting permissions of a missing role conflicts, and a built-in revision no later than the
 * recorded one conflicts. `RoleStore.make` checks every input before this driver sees it.
 *
 * @since 0.1.0
 */
import { BuiltinRoles, Role, RoleStore } from "../authorization/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Role.Role));
const revisions = Rows.make(Schema.fromJsonString(BuiltinRoles.Revision));
/** The workspace's one built-in revision row. */
const revisionKey = "builtin";

/**
 * Named permission bundles; edits keep the role's identity.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Roles.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Binding;
  /** Replace one role with an edited record. */
  const edit = Effect.fn("Roles.edit")(function* (
    operation: string,
    id: Role.Id,
    change: (role: Role.Role) => Role.Role,
  ) {
    const space = yield* write.pipe(Effect.mapError(storeFailure(RoleStore, operation)));
    const current = yield* rows
      .get(space.records.of("roles"), id)
      .pipe(Effect.mapError(storeFailure(RoleStore, operation)));
    if (Option.isNone(current))
      return yield* new RoleStore.Conflict({ operation, message: "Role does not exist" });
    const record = change(current.value);
    const row = yield* rows
      .encode(record)
      .pipe(Effect.mapError(storeFailure(RoleStore, operation)));
    space.records.of("roles").set(id, row);
  });
  const driver: RoleStore.RoleStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("roles"), id)).pipe(
        Effect.mapError(storeFailure(RoleStore, "get")),
      ),
    insert: Effect.fn("Roles.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(RoleStore, "insert")));
      if (space.records.of("roles").has(record.id))
        return yield* new RoleStore.Conflict({
          operation: "insert",
          message: "Role ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(RoleStore, "insert")));
      space.records.of("roles").set(record.id, row);
    }),
    rename: (id, name) => edit("rename", id, (role) => Object.assign({}, role, { name })),
    setPermissions: (id, permissions) =>
      edit("setPermissions", id, (role) => Object.assign({}, role, { permissions })),
    builtinRevision: Effect.flatMap(read, (space) =>
      revisions.get(space.records.of("builtinRoleRevision"), revisionKey),
    ).pipe(Effect.mapError(storeFailure(RoleStore, "builtinRevision"))),
    recordBuiltinRevision: Effect.fn("Roles.recordBuiltinRevision")(function* (revision) {
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(RoleStore, "recordBuiltinRevision")),
      );
      const current = yield* revisions
        .get(space.records.of("builtinRoleRevision"), revisionKey)
        .pipe(Effect.mapError(storeFailure(RoleStore, "recordBuiltinRevision")));
      if (Option.isSome(current) && revision <= current.value)
        return yield* new RoleStore.Conflict({
          operation: "recordBuiltinRevision",
          message: "Expected a later built-in revision",
        });
      const row = yield* revisions
        .encode(revision)
        .pipe(Effect.mapError(storeFailure(RoleStore, "recordBuiltinRevision")));
      space.records.of("builtinRoleRevision").set(revisionKey, row);
    }),
  };
  return RoleStore.make(workspaceId, driver);
});

/**
 * Provide role storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(RoleStore.RoleStore, make());
