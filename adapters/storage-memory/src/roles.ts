import { Role, RoleStore } from "@amends/core/authorization";
import { Store } from "@amends/core/journal";
import { Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Role.Record));
const rows = Rows.make(Schema.fromJsonString(Role.Record));

/**
 * Named permission bundles; edits keep the role's identity.
 *
 * @category constructors
 */
export const make = Effect.fn("Roles.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  /** Replace one role with an edited record, validated as a whole. */
  const edit = Effect.fn("Roles.edit")(function* (
    operation: string,
    id: Role.Id,
    change: (role: Role.Record) => Role.Record,
  ) {
    yield* Store.Transaction;
    const space = yield* write.pipe(Effect.mapError(storeFailure(RoleStore, operation)));
    const current = yield* rows
      .get(space.records.roles, id)
      .pipe(Effect.mapError(storeFailure(RoleStore, operation)));
    if (Option.isNone(current))
      return yield* new RoleStore.Conflict({ operation, message: "Role does not exist" });
    const record = yield* validateRecord(change(current.value)).pipe(
      Effect.mapError(storeConflict(RoleStore, operation)),
    );
    const row = yield* rows
      .encode(record)
      .pipe(Effect.mapError(storeFailure(RoleStore, operation)));
    space.records.roles.set(id, row);
  });
  return RoleStore.Service.of({
    workspaceId,
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.roles, id)).pipe(
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
      const space = yield* write.pipe(Effect.mapError(storeFailure(RoleStore, "insert")));
      if (space.records.roles.has(record.id))
        return yield* new RoleStore.Conflict({
          operation: "insert",
          message: "Role ID already exists",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(RoleStore, "insert")));
      space.records.roles.set(record.id, row);
    }),
    rename: (id, name) => edit("rename", id, (role) => Object.assign({}, role, { name })),
    setPermissions: (id, permissions) =>
      edit("setPermissions", id, (role) => Object.assign({}, role, { permissions })),
  });
});

/**
 * Provide RoleStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(RoleStore.Service, make());

export * as Roles from "./roles.ts";
