/**
 * The rules for who may give, change, or take away a member's roles, which assigning, inviting,
 * creating an agent, transferring ownership, and removing a member share: `AssignmentService`,
 * `InvitationService`, `AgentService`, `OwnershipService`, and `MemberService` call them. Only the
 * three built-in roles are delegated. Giving a role needs `assignment.manage`; Administrator is
 * the owner's alone to give, and Owner is given by ownership transfer only. The owner is never a
 * recipient, and a member holding a direct grant or any role but Member is changed by the owner
 * alone, rather than guessing their authority. `recipientDenial` is the recipient rule as a pure
 * function, for a screen deciding many members at once.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Actor from "../identity/Actor.ts";
import * as Member from "../workspace/Member.ts";
import * as Workspace from "../workspace/Workspace.ts";
import * as WorkspaceStore from "../workspace/WorkspaceStore.ts";
import * as Assignment from "./Assignment.ts";
import * as AssignmentPermissions from "./AssignmentPermissions.ts";
import * as AssignmentStore from "./AssignmentStore.ts";
import * as Authorization from "./Authorization.ts";
import * as Grant from "./Grant.ts";
import * as PermissionCatalog from "./PermissionCatalog.ts";
import * as Requirement from "./Requirement.ts";
import * as BuiltinRoles from "./BuiltinRoles.ts";
import * as Role from "./Role.ts";
import * as RoleStore from "./RoleStore.ts";
import { Denied, OwnerProtected, RoleNotFound, UnsupportedRole } from "./DelegationErrors.ts";
import * as Store from "../journal/Store.ts";
export {
  /**
   * The actor may not delegate this: only the owner gives Administrator (`administrator-role`), and
   * only the owner changes a member who holds a direct grant or a role other than Member
   * (`protected-member`).
   *
   * @category errors
   * @since 0.1.0
   */
  Denied,
  /**
   * The owner is out of reach: Owner is given by ownership transfer alone, and the owner's own
   * roles are changed by no one.
   *
   * @category errors
   * @since 0.1.0
   */
  OwnerProtected,
  /**
   * The built-in role is not recorded in this workspace.
   *
   * @category errors
   * @since 0.1.0
   */
  RoleNotFound,
  /**
   * The role is not one of the three built-in ones; no other role is delegated.
   *
   * @category errors
   * @since 0.1.0
   */
  UnsupportedRole,
} from "./DelegationErrors.ts";

/**
 * What a delegation check can fail with: the outcomes in `DelegationErrors`, authorization's, and
 * the failures of the stores and catalog it reads.
 *
 * @category errors
 * @since 0.1.0
 */
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

/**
 * The delegation rules, bound to one workspace. Read screens check current policy to show what the
 * actor may do; write operations check it inside their commit.
 *
 * @category services
 * @since 0.1.0
 */
export class Delegation extends Context.Service<
  Delegation,
  {
    /**
     * A built-in role as recorded, with each of its permissions this host declares checked to fit
     * a workspace-wide grant; one it does not declare is kept and grants nothing. Any other role
     * is `UnsupportedRole`.
     */
    readonly loadRole: (roleId: Role.Id) => Effect.Effect<Role.Role, Error>;
    /** The member's active assignments, by role and direct grant alike. */
    readonly assignmentsFor: (
      memberId: Member.Id,
    ) => Effect.Effect<ReadonlyArray<Assignment.Assignment>, Error>;
    /**
     * The role the actor may give, under `assignment.manage` on the workspace. Owner is never given
     * here, and only the current owner gives Administrator.
     */
    readonly requireGrant: (roleId: Role.Id) => Effect.Effect<Role.Role, Error, Actor.Actor>;
    /**
     * That the actor may change this member's roles, by `recipientDenial`. The caller checks the
     * operation's own permission; the owner is always protected.
     */
    readonly requireRecipient: (memberId: Member.Id) => Effect.Effect<void, Error, Actor.Actor>;
    /**
     * That the actor may remove this member: as `requireRecipient`, except that a member other
     * than the owner may remove themself whatever roles they hold, without thereby gaining
     * authority over their own roles.
     */
    readonly requireRemoval: (memberId: Member.Id) => Effect.Effect<void, Error, Actor.Actor>;
  }
>()("@amends-dev/core/authorization/Delegation") {}

/**
 * One member an actor would change the roles of, or remove when `selfRemoval` is set.
 *
 * @category models
 * @since 0.1.0
 */
export interface Recipient {
  readonly workspaceId: Workspace.Id;
  readonly memberId: Member.Id;
  readonly ownerId: Member.Id;
  readonly actorId: Member.Id;
  readonly selfRemoval: boolean;
}

/**
 * Whether the rule depends on the recipient's assignments, so callers read them only then.
 *
 * @category utils
 * @since 0.1.0
 */
export const recipientNeedsAssignments = (recipient: Recipient) =>
  recipient.memberId !== recipient.ownerId &&
  recipient.actorId !== recipient.ownerId &&
  !(recipient.selfRemoval && recipient.actorId === recipient.memberId);
/**
 * The delegation rule `requireRecipient` enforces, for callers deciding many members at once.
 * The owner is never a recipient. The owner may act on anyone else, and a member may leave.
 * Otherwise only members holding the Member role alone, or nothing, are ordinary recipients:
 * direct grants and other roles require the owner, rather than guessing their authority.
 *
 * @category utils
 * @since 0.1.0
 */
export const recipientDenial = (
  recipient: Recipient,
  assignments: ReadonlyArray<Assignment.Assignment>,
): OwnerProtected | Denied | undefined => {
  if (recipient.memberId === recipient.ownerId)
    return new OwnerProtected({ workspaceId: recipient.workspaceId });
  if (!recipientNeedsAssignments(recipient)) return undefined;
  return assignments.some(
    ({ source }) =>
      !Assignment.Source.isAnyOf(["Role"])(source) || source.roleId !== BuiltinRoles.MemberId,
  )
    ? new Denied({ reason: "protected-member" })
    : undefined;
};

/**
 * Capture the stores, authorization, and the catalog; read the owner, the actor, and assignments
 * per call.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Delegation.make")(function* (): Effect.fn.Return<
  Delegation["Service"],
  never,
  | WorkspaceStore.WorkspaceStore
  | AssignmentStore.AssignmentStore
  | RoleStore.RoleStore
  | Authorization.Authorization
  | PermissionCatalog.PermissionCatalog
  | Store.Store
> {
  const workspaceStore = yield* WorkspaceStore.WorkspaceStore;
  const assignmentStore = yield* AssignmentStore.AssignmentStore;
  const roleStore = yield* RoleStore.RoleStore;
  const authorization = yield* Authorization.Authorization;
  const permissionCatalog = yield* PermissionCatalog.PermissionCatalog;
  const { workspaceId } = yield* Store.Store;
  const readOwnerId = Effect.fn("Delegation.readOwnerId")(function* () {
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
      (yield* Actor.Actor).memberId !== (yield* readOwnerId())
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
      ownerId: yield* readOwnerId(),
      actorId: (yield* Actor.Actor).memberId,
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
  return Delegation.of({
    loadRole,
    assignmentsFor,
    requireGrant,
    requireRecipient,
    requireRemoval,
  });
});

/**
 * Provide the delegation rules over the workspace stores, authorization, and the permission
 * catalog.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Delegation, make());
