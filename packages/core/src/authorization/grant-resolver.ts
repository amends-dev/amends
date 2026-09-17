import { Context, Effect, Layer, Option, Schema } from "effect";
import { Store } from "../journal/store.ts";
import type { Member } from "../workspace/member.ts";
import { Workspace } from "../workspace/workspace.ts";
import { AssignmentStore } from "./assignment-store.ts";
import { Assignment } from "./assignment.ts";
import { Grant } from "./grant.ts";
import { PermissionCatalog } from "./permission-catalog.ts";
import type { Permission } from "./permission.ts";
import { RoleStore } from "./role-store.ts";
import { Role } from "./role.ts";
import type { Scope } from "./scope.ts";

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "GrantResolver.WorkspaceMismatch",
  { expectedWorkspaceId: Workspace.Id, actualWorkspaceId: Workspace.Id },
) {}

export class MissingRole extends Schema.TaggedError<MissingRole>()("GrantResolver.MissingRole", {
  assignmentId: Assignment.Id,
  roleId: Role.Id,
}) {}

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "GrantResolver.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | AssignmentStore.Failure
  | RoleStore.Failure
  | PermissionCatalog.Unknown
  | Schema.SchemaError
  | WorkspaceMismatch
  | MissingRole
  | InvalidResponse;

export interface Interface {
  readonly workspaceId: Workspace.Id;
  /**
   * Resolve all active assignments using the caller's transaction. Any invalid
   * assignment fails the whole operation. Overlapping grants may repeat.
   * Actor identity, active membership, and action requirements are checked by authorization.
   */
  readonly resolve: (
    memberId: Member.Id,
  ) => Effect.Effect<ReadonlyArray<Grant.Value>, Error, Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/grant-resolver/Service",
) {}

const requireWorkspace = Effect.fnUntraced(function* (
  expectedWorkspaceId: Workspace.Id,
  actualWorkspaceId: Workspace.Id,
) {
  if (expectedWorkspaceId !== actualWorkspaceId) {
    return yield* new WorkspaceMismatch({ expectedWorkspaceId, actualWorkspaceId });
  }
});
const decodeAssignments = Schema.decodeEffect(Schema.Array(Assignment.Record));
const decodeRole = Schema.decodeEffect(Role.Record);

/** Bind workspace stores and code metadata; read assignments and roles afresh on each call. */
export const make = Effect.fn("GrantResolver.make")(function* (): Effect.fn.Return<
  Interface,
  WorkspaceMismatch,
  AssignmentStore.Service | RoleStore.Service | PermissionCatalog.Service
> {
  const assignments = yield* AssignmentStore.Service;
  const roles = yield* RoleStore.Service;
  const catalog = yield* PermissionCatalog.Service;
  const workspaceId = assignments.workspaceId;
  yield* requireWorkspace(workspaceId, roles.workspaceId);

  const resolveGrant = Effect.fnUntraced(function* (name: Permission.Name, scope: Scope.Value) {
    const permission = yield* catalog.get(name);
    return yield* Schema.decodeEffect(Grant.schema(permission))({ permission: name, scope });
  });

  const resolve = Effect.fn("GrantResolver.resolve")(function* (memberId: Member.Id) {
    yield* Store.Transaction;
    const records = yield* decodeAssignments(yield* assignments.listActiveByMember(memberId));
    const grants: Array<Grant.Value> = [];
    const seen = new Set<Assignment.Id>();
    for (const assignment of records) {
      yield* requireWorkspace(workspaceId, assignment.workspaceId);
      if (assignment.memberId !== memberId || assignment.status !== "active") {
        return yield* new InvalidResponse({
          message: "Expected an active assignment for the requested member",
        });
      }
      if (seen.has(assignment.id)) {
        return yield* new InvalidResponse({
          message: "Assignment store returned a duplicate assignment ID",
        });
      }
      seen.add(assignment.id);

      const source = assignment.source;
      if (source._tag === "Direct") {
        grants.push(yield* resolveGrant(source.grant.permission, source.grant.scope));
      } else {
        const found = yield* roles.get(source.roleId);
        if (Option.isNone(found)) {
          return yield* new MissingRole({ assignmentId: assignment.id, roleId: source.roleId });
        }
        const role = yield* decodeRole(found.value);
        yield* requireWorkspace(workspaceId, role.workspaceId);
        if (role.id !== source.roleId) {
          return yield* new InvalidResponse({ message: "Role store returned a different role ID" });
        }
        for (const name of role.permissions) {
          grants.push(yield* resolveGrant(name, source.scope));
        }
      }
    }
    return grants;
  });

  return Service.of({ workspaceId, resolve });
});

export const layer = Layer.effect(Service, make());

export * as GrantResolver from "./grant-resolver.ts";
