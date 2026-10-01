import { Context, Effect, Layer, Option, Schema } from "effect";
import { Actor } from "../identity/actor.ts";
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
import { Denied, OwnerProtected, RoleNotFound, UnsupportedRole } from "./delegation-errors.ts";
import { Store } from "../journal/store.ts";
export { Denied, OwnerProtected, RoleNotFound, UnsupportedRole } from "./delegation-errors.ts";

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
  | RoleNotFound;
export interface Interface {
  readonly loadRole: (roleId: Role.Id) => Effect.Effect<Role.Record, Error>;
  readonly assignmentsFor: (
    memberId: Member.Id,
  ) => Effect.Effect<ReadonlyArray<Assignment.Record>, Error>;
  /** Requires assignment.manage. Only current ownership allows delegating Administrator. */
  readonly requireGrant: (roleId: Role.Id) => Effect.Effect<Role.Record, Error, Actor.Service>;
  /** Operation permissions are checked by the caller. Owners are always protected. */
  readonly requireRecipient: (memberId: Member.Id) => Effect.Effect<void, Error, Actor.Service>;
  /** Authorized non-owners may leave without gaining authority to change their own roles. */
  readonly requireRemoval: (memberId: Member.Id) => Effect.Effect<void, Error, Actor.Service>;
}
/** Read screens check current policy; write operations check it inside their commit. */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/delegation/Service",
) {}

/** One member an actor would change the roles of, or remove when `selfRemoval` is set. */
export interface Recipient {
  readonly workspaceId: Workspace.Id;
  readonly memberId: Member.Id;
  readonly ownerId: Member.Id;
  readonly actorId: Member.Id;
  readonly selfRemoval: boolean;
}
/** Whether the rule depends on the recipient's assignments, so callers read them only then. */
export const recipientNeedsAssignments = (recipient: Recipient) =>
  recipient.memberId !== recipient.ownerId &&
  recipient.actorId !== recipient.ownerId &&
  !(recipient.selfRemoval && recipient.actorId === recipient.memberId);
/**
 * The delegation rule `requireRecipient` enforces, for callers deciding many members at once.
 * The owner is never a recipient. The owner may act on anyone else, and a member may leave.
 * Otherwise only Viewer-only or unassigned members are ordinary recipients: direct grants and
 * unfamiliar roles require the owner, rather than guessing their authority.
 */
export const recipientDenial = (
  recipient: Recipient,
  assignments: ReadonlyArray<Assignment.Record>,
): OwnerProtected | Denied | undefined => {
  if (recipient.memberId === recipient.ownerId)
    return new OwnerProtected({ workspaceId: recipient.workspaceId });
  if (!recipientNeedsAssignments(recipient)) return undefined;
  return assignments.some(
    ({ source }) => source._tag !== "Role" || source.roleId !== BuiltinRoles.MemberId,
  )
    ? new Denied({ reason: "protected-member" })
    : undefined;
};

/** @category constructors */
export const make = Effect.fn("Delegation.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  | WorkspaceStore.Service
  | AssignmentStore.Service
  | RoleStore.Service
  | Authorization.Service
  | PermissionCatalog.Service
  | Store.Service
> {
  const workspaceStore = yield* WorkspaceStore.Service;
  const assignmentStore = yield* AssignmentStore.Service;
  const roleStore = yield* RoleStore.Service;
  const authorization = yield* Authorization.Service;
  const permissionCatalog = yield* PermissionCatalog.Service;
  const { workspaceId } = yield* Store.Service;
  const owner = Effect.fn("Delegation.owner")(function* () {
    const found = yield* workspaceStore.get;
    if (Option.isNone(found)) return yield* Effect.die("A workspace's record is missing");
    return found.value.ownerMemberId;
  });
  const loadRole = Effect.fn("Delegation.loadRole")(function* (roleId: Role.Id) {
    const id = yield* Schema.decodeEffect(Role.Id)(roleId);
    if (![BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId].includes(id))
      return yield* new UnsupportedRole({ roleId: id });
    const found = yield* roleStore.get(id);
    if (Option.isNone(found)) return yield* new RoleNotFound({ roleId: id });
    const role = found.value;
    // A permission this host does not declare, retired or added by a newer host's bundles, grants
    // nothing here, as in GrantResolver; the role still loads, with every permission it records.
    for (const name of role.permissions) {
      const definition = yield* permissionCatalog.get(name).pipe(
        Effect.asSome,
        Effect.catchTag("PermissionCatalog.Unknown", () => Effect.succeedNone),
      );
      // A role whose permission no longer fits a workspace-wide grant is stored state core
      // can't use, not something the caller sent.
      if (Option.isSome(definition))
        yield* Effect.orDie(
          Schema.decodeEffect(Grant.makeSchema(definition.value))({
            permission: name,
            scope: { _tag: "Workspace", workspaceId },
          }),
        );
    }
    return role;
  });
  const assignmentsFor = Effect.fn("Delegation.assignmentsFor")((memberId: Member.Id) =>
    assignmentStore.listActiveByMember(memberId),
  );
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
    const recipient: Recipient = {
      workspaceId,
      memberId,
      ownerId: yield* owner(),
      actorId: (yield* Actor.Service).memberId,
      selfRemoval,
    };
    const denial = recipientDenial(
      recipient,
      recipientNeedsAssignments(recipient) ? yield* assignmentsFor(memberId) : [],
    );
    if (denial) return yield* denial;
  });
  const requireRemoval = Effect.fn("Delegation.requireRemoval")(function* (memberId: Member.Id) {
    yield* requireRecipient(memberId, true);
  });
  return Service.of({
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
