import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";
import type { Store } from "../../journal/store.ts";
import type { Workspace } from "../../workspace/workspace.ts";
import type { Role } from "./role.ts";

export class Failure extends Schema.TaggedError<Failure>()("RoleStore.Failure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()("RoleStore.Conflict", {
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * Host-owned role read model for one workspace. Reads use the current host
 * transaction when present, including its staged writes; otherwise committed
 * state. Isolate stored inputs and returned records from caller mutation.
 *
 * Projection writes enlist in the same native transaction as journal entries and
 * checkpoints. Enforce constraints atomically across concurrent writers. Reject
 * expired or foreign transaction handles and never retry the program internally.
 * Permission definitions, affected assignments, and grant authority are checked
 * by application services before publication.
 */
export interface Interface {
  readonly workspaceId: Workspace.Id;

  /** Find a role in this workspace; None if absent. */
  readonly get: (roleId: Role.Id) => Effect.Effect<Option.Option<Role.Record>, Failure>;

  /**
   * Insert a valid Role.Record belonging to this workspace. Fail with Conflict
   * for schema violations, a workspace mismatch, or a reused role ID. Never upsert.
   */
  readonly insert: (
    record: Role.Record,
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

  /**
   * Change only the display name. Fail with Conflict if the role is absent in
   * this workspace or the name violates Role.Record's name schema.
   */
  readonly rename: (
    roleId: Role.Id,
    name: Role.Record["name"],
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;

  /**
   * Replace the complete permission list, retaining the ID, workspace, and name.
   * An empty list is valid. Fail with Conflict if the role is absent in this
   * workspace or the list violates Role.Record's permissions schema.
   */
  readonly setPermissions: (
    roleId: Role.Id,
    permissions: Role.Record["permissions"],
  ) => Effect.Effect<void, Failure | Conflict, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/role-store/Service",
) {}

export * as RoleStore from "./store.ts";
