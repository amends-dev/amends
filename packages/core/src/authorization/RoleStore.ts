/**
 * The storage contract for roles, which every storage adapter implements and `RoleProjection`
 * writes. It also keeps the built-in bundles' revision the workspace holds, which
 * `BuiltinRoleUpgrade` compares with the host's. `GrantResolver` and `Delegation` read roles by
 * ID. Reads honor the caller's transaction when there is one; writes require it. The store checks
 * what it is given and authorizes nobody: operations do that.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Store from "../journal/Store.ts";
import * as Role from "./Role.ts";
import * as StoreInput from "../journal/StoreInput.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as BuiltinRoles from "./BuiltinRoles.ts";
import { storeFailure } from "../journal/internal/storeFailure.ts";
import * as MemoryDatabase from "../journal/MemoryDatabase.ts";

/**
 * Storage failed while reading or writing roles.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("RoleStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * A write disagreed with what is stored: a malformed or foreign record, a reused ID, a missing
 * role, or a built-in revision not later than the recorded one.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("RoleStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The role store, bound to one workspace by the host.
 *
 * Host-owned role read model for one workspace. Reads use the current host
 * transaction when present, including its staged writes; otherwise committed
 * state. Isolate stored inputs and returned records from caller mutation.
 *
 * Projection writes enlist in the same native transaction as journal entries and
 * checkpoints. Enforce constraints atomically across concurrent writers. Reject
 * expired or foreign transaction handles and never retry the program internally.
 * Permission definitions, affected assignments, and grant authority are checked
 * by services before publication.
 *
 * `make` builds the store over a driver of the same shape. It checks every input
 * against its schema, and a record against the workspace, before the driver sees it, so a driver
 * keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class RoleStore extends Context.Service<
  RoleStore,
  {
    /** Find a role in this workspace; None if absent. */
    readonly get: (roleId: Role.Id) => Effect.Effect<Option.Option<Role.Role>, Failure>;

    /**
     * Insert a role. Fail with Conflict for a reused role ID. Never upsert.
     */
    readonly insert: (
      record: Role.Role,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

    /**
     * Change only the display name. Fail with Conflict if the role is absent in this workspace.
     */
    readonly rename: (
      roleId: Role.Id,
      name: Role.Role["name"],
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

    /**
     * Replace the complete permission list, retaining the ID, workspace, and name.
     * An empty list is valid. Fail with Conflict if the role is absent in this workspace.
     */
    readonly setPermissions: (
      roleId: Role.Id,
      permissions: Role.Role["permissions"],
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

    /** The built-in bundle revision the workspace's roles hold; None before one is recorded. */
    readonly builtinRevision: Effect.Effect<Option.Option<number>, Failure>;

    /**
     * Record a later built-in bundle revision. Fail with Conflict for one not later than the
     * recorded revision.
     */
    readonly recordBuiltinRevision: (
      revision: number,
    ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
  }
>()("@amends-dev/core/authorization/RoleStore") {}

/**
 * The store over a driver: each input is checked against its schema, and a record against the
 * workspace, before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (
  workspaceId: WorkspaceId.Id,
  driver: RoleStore["Service"],
): RoleStore["Service"] => {
  const read = StoreInput.read(Failure);
  const write = StoreInput.write(Conflict, workspaceId);
  return {
    get: (roleId) => Effect.flatMap(read("get", Role.Id, roleId), driver.get),
    insert: (record) => Effect.flatMap(write("insert", Role.Role, record), driver.insert),
    rename: Effect.fn("RoleStore.rename")(function* (roleId, name) {
      return yield* driver.rename(
        yield* write("rename", Role.Id, roleId),
        yield* write("rename", Role.Role.fields.name, name),
      );
    }),
    setPermissions: Effect.fn("RoleStore.setPermissions")(function* (roleId, permissions) {
      return yield* driver.setPermissions(
        yield* write("setPermissions", Role.Id, roleId),
        yield* write("setPermissions", Role.Role.fields.permissions, permissions),
      );
    }),
    builtinRevision: driver.builtinRevision,
    recordBuiltinRevision: (revision) =>
      Effect.flatMap(
        write("recordBuiltinRevision", BuiltinRoles.Revision, revision),
        driver.recordBuiltinRevision,
      ),
  };
};

const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Role.Role));
const revisions = MemoryDatabase.makeRows(Schema.fromJsonString(BuiltinRoles.Revision));
/** The workspace's one built-in revision row. */
const revisionKey = "builtin";

/**
 * Named permission bundles; edits keep the role's identity.
 */
const makeMemory = Effect.fn("RoleStore.makeMemory")(function* () {
  const { workspaceId, read, write } = yield* Store.MemoryBinding;
  /** Replace one role with an edited record. */
  const edit = Effect.fn("RoleStore.memory.edit")(function* (
    operation: string,
    id: Role.Id,
    change: (role: Role.Role) => Role.Role,
  ) {
    const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, operation)));
    const current = yield* rows
      .get(space.records.of("roles"), id)
      .pipe(Effect.mapError(storeFailure(Failure, operation)));
    if (Option.isNone(current))
      return yield* new Conflict({ operation, message: "Role does not exist" });
    const record = change(current.value);
    const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, operation)));
    space.records.of("roles").set(id, row);
  });
  const driver: RoleStore["Service"] = {
    get: (id) =>
      Effect.flatMap(read, (space) => rows.get(space.records.of("roles"), id)).pipe(
        Effect.mapError(storeFailure(Failure, "get")),
      ),
    insert: Effect.fn("RoleStore.memory.insert")(function* (record) {
      const space = yield* write.pipe(Effect.mapError(storeFailure(Failure, "insert")));
      if (space.records.of("roles").has(record.id))
        return yield* new Conflict({
          operation: "insert",
          message: "Role ID already exists",
        });
      const row = yield* rows.encode(record).pipe(Effect.mapError(storeFailure(Failure, "insert")));
      space.records.of("roles").set(record.id, row);
    }),
    rename: (id, name) => edit("rename", id, (role) => Object.assign({}, role, { name })),
    setPermissions: (id, permissions) =>
      edit("setPermissions", id, (role) => Object.assign({}, role, { permissions })),
    builtinRevision: Effect.flatMap(read, (space) =>
      revisions.get(space.records.of("builtinRoleRevision"), revisionKey),
    ).pipe(Effect.mapError(storeFailure(Failure, "builtinRevision"))),
    recordBuiltinRevision: Effect.fn("RoleStore.memory.recordBuiltinRevision")(
      function* (revision) {
        const space = yield* write.pipe(
          Effect.mapError(storeFailure(Failure, "recordBuiltinRevision")),
        );
        const current = yield* revisions
          .get(space.records.of("builtinRoleRevision"), revisionKey)
          .pipe(Effect.mapError(storeFailure(Failure, "recordBuiltinRevision")));
        if (Option.isSome(current) && revision <= current.value)
          return yield* new Conflict({
            operation: "recordBuiltinRevision",
            message: "Expected a later built-in revision",
          });
        const row = yield* revisions
          .encode(revision)
          .pipe(Effect.mapError(storeFailure(Failure, "recordBuiltinRevision")));
        space.records.of("builtinRoleRevision").set(revisionKey, row);
      },
    ),
  };
  return make(workspaceId, driver);
});

/**
 * Provide `RoleStore` in process memory, over the workspace's `Store.MemoryBinding`: roles, and the
 * revision of the built-in roles the workspace was last given, as one row. It keeps what the
 * contract leaves to storage: a reused ID conflicts, renaming or setting permissions of a missing
 * role conflicts, and a built-in revision no later than the recorded one conflicts. `make` checks
 * every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(RoleStore, makeMemory());
