import { BuiltinRoles, Role, RoleStore } from "../authorization/index.ts";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const rows = Rows.make(Schema.fromJsonString(Role.Record));
const revisions = Rows.make(Schema.fromJsonString(BuiltinRoles.Revision));
/** The workspace's one built-in revision row. */
const revisionKey = "builtin";

/**
 * Named permission bundles; edits keep the role's identity.
 *
 * @category constructors
 */
export const make = Effect.fn("Roles.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  /** Replace one role with an edited record. */
  const edit = Effect.fn("Roles.edit")(function* (
    operation: string,
    id: Role.Id,
    change: (role: Role.Record) => Role.Record,
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
  const driver: RoleStore.Interface = {
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
 * Provide RoleStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(RoleStore.Service, make());

export * as Roles from "./roles.ts";
