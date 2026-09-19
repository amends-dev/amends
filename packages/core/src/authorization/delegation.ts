import { Context, Effect, Layer, Option, Schema } from "effect";
import { Actor } from "../identity/actor.ts";
import { Store } from "../journal/store.ts";
import { Member } from "../workspace/member/member.ts";
import { Workspace } from "../workspace/workspace.ts";
import { WorkspaceStore } from "../workspace/store.ts";
import { Assignment } from "./assignment/assignment.ts";
import { AssignmentPermissions } from "./assignment/permissions.ts";
import { AssignmentStore } from "./assignment/store.ts";
import { Authorization } from "./authorization.ts";
import { Grant } from "./grant.ts";
import { PermissionCatalog } from "./permission-catalog.ts";
import { Requirement } from "./requirement.ts";
import { BuiltinRoles } from "./role/builtin.ts";
import { Role } from "./role/role.ts";
import { RoleStore } from "./role/store.ts";

export class Denied extends Schema.TaggedError<Denied>()("Delegation.Denied", {
  reason: Schema.Literals(["administrator-role", "protected-member"]),
}) {}
export class OwnerProtected extends Schema.TaggedError<OwnerProtected>()(
  "Delegation.OwnerProtected",
  {
    workspaceId: Workspace.Id,
  },
) {}
export class UnsupportedRole extends Schema.TaggedError<UnsupportedRole>()(
  "Delegation.UnsupportedRole",
  { roleId: Role.Id },
) {}
export class RoleNotFound extends Schema.TaggedError<RoleNotFound>()("Delegation.RoleNotFound", {
  roleId: Role.Id,
}) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "Delegation.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | Authorization.Error
  | WorkspaceStore.Failure
  | AssignmentStore.Failure
  | RoleStore.Failure
  | PermissionCatalog.Unknown
  | Schema.SchemaError
  | Denied
  | OwnerProtected
  | UnsupportedRole
  | RoleNotFound
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: Workspace.Id;
  readonly loadRole: (roleId: Role.Id) => Effect.Effect<Role.Record, Error, Store.Transaction>;
  readonly assignmentsFor: (
    memberId: Member.Id,
  ) => Effect.Effect<ReadonlyArray<Assignment.Record>, Error, Store.Transaction>;
  /** Requires assignment.manage. Only current ownership allows delegating Administrator. */
  readonly requireGrant: (
    roleId: Role.Id,
  ) => Effect.Effect<Role.Record, Error, Actor.Service | Store.Transaction>;
  /** Operation permissions are checked by the caller. Owners are always protected. */
  readonly requireRecipient: (
    memberId: Member.Id,
  ) => Effect.Effect<void, Error, Actor.Service | Store.Transaction>;
  /** Authorized non-owners may leave without gaining authority to change their own roles. */
  readonly requireRemoval: (
    memberId: Member.Id,
  ) => Effect.Effect<void, Error, Actor.Service | Store.Transaction>;
}
/** Transaction ownership belongs to the calling application operation. @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/delegation/Service",
) {}

/** @category constructors */
export const make = Effect.fn("Delegation.make")(function* (): Effect.fn.Return<
  Interface,
  InvalidResponse,
  | WorkspaceStore.Service
  | AssignmentStore.Service
  | RoleStore.Service
  | Authorization.Service
  | PermissionCatalog.Service
> {
  const workspace = yield* WorkspaceStore.Service;
  const assignments = yield* AssignmentStore.Service;
  const roles = yield* RoleStore.Service;
  const authorization = yield* Authorization.Service;
  const catalog = yield* PermissionCatalog.Service;
  const workspaceId = workspace.workspaceId;
  if (
    [assignments.workspaceId, roles.workspaceId, authorization.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidResponse({
      message: "Delegation services belong to different workspaces",
    });
  const owner = Effect.fn("Delegation.owner")(function* () {
    const found = yield* workspace.get;
    if (Option.isNone(found))
      return yield* new InvalidResponse({ message: "Workspace metadata is missing" });
    const record = yield* Schema.decodeEffect(Workspace.Record)(found.value);
    if (record.id !== workspaceId)
      return yield* new InvalidResponse({ message: "Workspace metadata is mismatched" });
    return record.ownerMemberId;
  });
  const loadRole = Effect.fn("Delegation.loadRole")(function* (roleId: Role.Id) {
    yield* Store.Transaction;
    const id = yield* Schema.decodeEffect(Role.Id)(roleId);
    if (![BuiltinRoles.ViewerId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId].includes(id))
      return yield* new UnsupportedRole({ roleId: id });
    const found = yield* roles.get(id);
    if (Option.isNone(found)) return yield* new RoleNotFound({ roleId: id });
    const role = yield* Schema.decodeEffect(Role.Record)(found.value);
    if (role.id !== id || role.workspaceId !== workspaceId)
      return yield* new InvalidResponse({
        message: "Role store returned a different role or workspace",
      });
    for (const name of role.permissions) {
      const definition = yield* catalog.get(name);
      yield* Schema.decodeEffect(Grant.makeSchema(definition))({
        permission: name,
        scope: { _tag: "Workspace", workspaceId },
      });
    }
    return role;
  });
  const assignmentsFor = Effect.fn("Delegation.assignmentsFor")(function* (memberId: Member.Id) {
    yield* Store.Transaction;
    const records = yield* Schema.decodeEffect(Schema.Array(Assignment.Record))(
      yield* assignments.listActiveByMember(memberId),
    );
    const ids = new Set<Assignment.Id>();
    for (const record of records) {
      if (
        record.workspaceId !== workspaceId ||
        record.memberId !== memberId ||
        record.status !== "active" ||
        ids.has(record.id)
      )
        return yield* new InvalidResponse({
          message: "Assignment store returned an inconsistent membership listing",
        });
      ids.add(record.id);
    }
    return records;
  });
  const requireGrant = Effect.fn("Delegation.requireGrant")(function* (roleId: Role.Id) {
    yield* authorization.require([
      Requirement.make(AssignmentPermissions.Manage, { _tag: "Workspace", workspaceId }),
    ]);
    if (roleId === BuiltinRoles.OwnerId) return yield* new OwnerProtected({ workspaceId });
    const role = yield* loadRole(roleId);
    if (
      roleId === BuiltinRoles.AdministratorId &&
      (yield* Actor.Service).memberId !== (yield* owner())
    )
      return yield* new Denied({ reason: "administrator-role" });
    return role;
  });
  const requireRecipient = Effect.fn("Delegation.requireRecipient")(function* (
    memberId: Member.Id,
    selfRemoval = false,
  ) {
    yield* authorization.require([]);
    const ownerId = yield* owner();
    if (memberId === ownerId) return yield* new OwnerProtected({ workspaceId });
    const actorId = (yield* Actor.Service).memberId;
    if (actorId === ownerId || (selfRemoval && actorId === memberId)) return;
    // Only Viewer-only or unassigned members are ordinary recipients. Direct
    // grants and unfamiliar roles require the owner, rather than guessing their authority.
    const records = yield* assignmentsFor(memberId);
    if (
      records.some(
        ({ source }) => source._tag !== "Role" || source.roleId !== BuiltinRoles.ViewerId,
      )
    )
      return yield* new Denied({ reason: "protected-member" });
  });
  const requireRemoval = Effect.fn("Delegation.requireRemoval")(function* (memberId: Member.Id) {
    yield* requireRecipient(memberId, true);
  });
  return Service.of({
    workspaceId,
    loadRole,
    assignmentsFor,
    requireGrant,
    requireRecipient,
    requireRemoval,
  });
});

/** @category layers */
export const layer = Layer.effect(Service, make());
export * as Delegation from "./delegation.ts";
