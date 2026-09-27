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
export { Denied, OwnerProtected, RoleNotFound, UnsupportedRole } from "./delegation-errors.ts";

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
    const id = yield* Schema.decodeEffect(Role.Id)(roleId);
    if (![BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId].includes(id))
      return yield* new UnsupportedRole({ roleId: id });
    const found = yield* roles.get(id);
    if (Option.isNone(found)) return yield* new RoleNotFound({ roleId: id });
    const role = yield* Schema.decodeEffect(Role.Record)(found.value);
    if (role.id !== id || role.workspaceId !== workspaceId)
      return yield* new InvalidResponse({
        message: "Role store returned a different role or workspace",
      });
    // A permission this host does not declare, retired or added by a newer host's bundles, grants
    // nothing here, as in GrantResolver; the role still loads, with every permission it records.
    for (const name of role.permissions) {
      const definition = yield* catalog.get(name).pipe(
        Effect.asSome,
        Effect.catchTag("PermissionCatalog.Unknown", () => Effect.succeedNone),
      );
      if (Option.isSome(definition))
        yield* Schema.decodeEffect(Grant.makeSchema(definition.value))({
          permission: name,
          scope: { _tag: "Workspace", workspaceId },
        });
    }
    return role;
  });
  const assignmentsFor = Effect.fn("Delegation.assignmentsFor")(function* (memberId: Member.Id) {
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
