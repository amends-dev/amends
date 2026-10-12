/**
 * The operations on assignments an actor calls: what they may do across the workspace, the roles on
 * offer, a member's access, and giving, changing, and revoking a member's built-in roles. Each
 * write authorizes the actor under `assignment.manage` and the `Delegation` rules, publishes
 * through `AssignmentCommand`, and runs inside one journal commit; reads run outside any.
 *
 * @since 0.1.0
 */
import * as Scope from "./Scope.ts";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import * as Actor from "../identity/Actor.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import * as Store from "../journal/Store.ts";
import * as Member from "../workspace/Member.ts";
import * as MemberStore from "../workspace/MemberStore.ts";
import * as Authorization from "./Authorization.ts";
import * as Delegation from "./Delegation.ts";
import type * as Permission from "./Permission.ts";
import * as PermissionCatalog from "./PermissionCatalog.ts";
import * as Requirement from "./Requirement.ts";
import * as BuiltinRoles from "./BuiltinRoles.ts";
import * as Assignment from "./Assignment.ts";
import * as AssignmentCommand from "./AssignmentCommand.ts";
import * as AssignmentPermissions from "./AssignmentPermissions.ts";
import * as AssignmentStore from "./AssignmentStore.ts";
import { Changed, InactiveMember, MemberNotFound, NotFound } from "./internal/assignment-errors.ts";
export {
  /**
   * The member's workspace role assignments are no longer the ones the caller expected: someone
   * changed them meanwhile.
   *
   * @category errors
   * @since 0.1.0
   */
  Changed,
  /**
   * The member has been removed; roles are given to and taken from active members only.
   *
   * @category errors
   * @since 0.1.0
   */
  InactiveMember,
  /**
   * No member with this ID is recorded in the workspace.
   *
   * @category errors
   * @since 0.1.0
   */
  MemberNotFound,
  /**
   * No assignment with this ID is recorded for the member.
   *
   * @category errors
   * @since 0.1.0
   */
  NotFound,
} from "./internal/assignment-errors.ts";

/**
 * What the assignment operations can fail with: the outcomes above, delegation's,
 * and the failures of what they depend on.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | Delegation.Error
  | MemberStore.Failure
  | Projection.Error
  | Log.WriteError
  | PlatformError.PlatformError
  | MemberNotFound
  | InactiveMember
  | NotFound
  | Changed;

/**
 * What reading a member's access can fail with: the delegation checks it shows, and a member who
 * is missing or no longer active.
 *
 * @category errors
 * @since 0.1.0
 */
export type ListError = Delegation.Error | MemberNotFound | InactiveMember;

/**
 * What `permissions` can fail with: authorization's failures but never `Denied`, since reading
 * one's own permissions needs only active membership.
 *
 * @category errors
 * @since 0.1.0
 */
export type PermissionsError = Exclude<Authorization.Error, Authorization.Denied>;

/**
 * The assignment operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class AssignmentService extends Context.Service<
  AssignmentService,
  {
    /**
     * What the acting member may do across the whole workspace: each declared workspace permission
     * a current grant covers, in declaration order. Clients offer only the actions it names; the
     * operations still check their own requirements.
     */
    readonly permissions: Effect.Effect<
      ReadonlyArray<Permission.Name>,
      PermissionsError,
      Actor.Actor
    >;
    /** The three built-in roles, each with whether the actor may give it, under active membership. */
    readonly roles: Effect.Effect<
      ReadonlyArray<Assignment.RoleChoice>,
      Delegation.Error,
      Actor.Actor
    >;
    /**
     * A member's access, under `assignment.read` on them: their active assignments, the roles on
     * offer, and whether the actor may change them.
     */
    readonly list: (
      memberId: Member.Id,
    ) => Effect.Effect<Assignment.Access, ListError, Actor.Actor>;
    /**
     * Give a member a built-in role across the workspace, under `assignment.manage` and the
     * delegation rules for the member and the role. A role they already hold is returned as it is,
     * and other roles they hold stay.
     */
    readonly assign: (
      input: Assignment.AssignInput,
    ) => Effect.Effect<Assignment.Assignment, Error, Actor.Actor>;
    /**
     * End one of a member's assignments, under `assignment.manage` and the delegation rules for the
     * member and, for a role assignment, its role. Another member's assignment is `NotFound`; one
     * already revoked is returned as it is.
     */
    readonly revoke: (
      memberId: Member.Id,
      assignmentId: Assignment.Id,
    ) => Effect.Effect<Assignment.Assignment, Error, Actor.Actor>;
    /**
     * Replace a member's workspace roles with one, under `assignment.manage` and the delegation
     * rules for the member, the new role, and each role replaced. The roles must be the ones the
     * caller saw, or the change is `Changed`; a member holding that role alone is left as they are.
     */
    readonly change: (
      input: Assignment.ChangeInput,
    ) => Effect.Effect<Assignment.Assignment, Error, Actor.Actor>;
  }
>()("@amends-dev/core/authorization/AssignmentService") {}

/**
 * Capture the stores, authorization, delegation, and the command; the workspace-wide permissions
 * are taken from the catalog once.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("AssignmentService.make")(function* (): Effect.fn.Return<
  AssignmentService["Service"],
  never,
  | AssignmentStore.AssignmentStore
  | MemberStore.MemberStore
  | Authorization.Authorization
  | Delegation.Delegation
  | AssignmentCommand.AssignmentCommand
  | Journal.Journal
  | Crypto.Crypto
  | PermissionCatalog.PermissionCatalog
  | Store.Store
> {
  const assignmentStore = yield* AssignmentStore.AssignmentStore;
  const memberStore = yield* MemberStore.MemberStore;
  const authorization = yield* Authorization.Authorization;
  const delegation = yield* Delegation.Delegation;
  const assignmentCommand = yield* AssignmentCommand.AssignmentCommand;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const permissionCatalog = yield* PermissionCatalog.PermissionCatalog;
  const { workspaceId } = yield* Store.Store;
  const manageRequirement = Requirement.make(AssignmentPermissions.Manage, {
    _tag: "Workspace",
    workspaceId,
  });
  const workspaceWide = permissionCatalog.definitions.filter(
    (permission) => permission.targetKind === "Workspace",
  );
  const permissions = Effect.gen(function* () {
    const covered = yield* authorization.permitted(
      workspaceWide.map((permission) =>
        Requirement.Requirement.make({
          permission: { name: permission.name, targetKind: permission.targetKind },
          target: { _tag: "Workspace", workspaceId },
        }),
      ),
    );
    return workspaceWide
      .filter((_, index) => covered[index] === true)
      .map((permission) => permission.name);
  }).pipe(Effect.withSpan("AssignmentService.permissions"));
  const requireMember = Effect.fn("AssignmentService.requireMember")(function* (
    memberId: Member.Id,
  ) {
    const id = yield* Schema.decodeEffect(Member.Id)(memberId);
    const found = yield* memberStore.get(id);
    if (Option.isNone(found)) return yield* new MemberNotFound({ memberId: id });
    return found.value;
  });
  const authorizeRecipient = Effect.fn("AssignmentService.authorizeRecipient")(function* (
    memberId: Member.Id,
  ) {
    yield* authorization.require([manageRequirement]);
    const record = yield* requireMember(memberId);
    if (record.status !== "active") return yield* new InactiveMember({ memberId });
    yield* delegation.requireRecipient(memberId);
  });
  const listRoleChoices = Effect.gen(function* () {
    yield* authorization.require([]);
    return yield* Effect.forEach(
      [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId],
      (id) =>
        Effect.gen(function* () {
          const role = yield* delegation.loadRole(id);
          return { role, assignable: yield* Delegation.isAllowedBy(delegation.requireGrant(id)) };
        }),
    );
  });
  const list = Effect.fn("AssignmentService.list")(function* (memberId: Member.Id) {
    yield* authorization.require([
      Requirement.make(AssignmentPermissions.Read, { _tag: "Member", workspaceId, memberId }),
    ]);
    const record = yield* requireMember(memberId);
    return Assignment.Access.make({
      assignments: yield* delegation.assignmentsFor(memberId),
      roles: yield* listRoleChoices,
      canManage:
        record.status === "active" && (yield* Delegation.isAllowedBy(authorizeRecipient(memberId))),
    });
  });
  /** Is this a role held across the workspace? Its source then names the role. */
  const isWorkspaceRole = (
    record: Assignment.Assignment,
  ): record is Assignment.Assignment & {
    readonly source: Extract<Assignment.Source, { readonly _tag: "Role" }>;
  } =>
    Assignment.Source.isAnyOf(["Role"])(record.source) &&
    Scope.Scope.isAnyOf(["Workspace"])(record.source.scope);
  const assign = Effect.fn("AssignmentService.assign")(
    function* (input: Assignment.AssignInput) {
      const request = yield* Schema.decodeEffect(Assignment.AssignInput)(input);
      yield* authorizeRecipient(request.memberId);
      yield* delegation.requireGrant(request.roleId);
      const existing = (yield* delegation.assignmentsFor(request.memberId)).find(
        (record) => isWorkspaceRole(record) && record.source.roleId === request.roleId,
      );
      if (existing !== undefined) return existing;
      return yield* assignmentCommand.assignRole(request.memberId, request.roleId);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const revoke = Effect.fn("AssignmentService.revoke")(
    function* (memberId: Member.Id, assignmentId: Assignment.Id) {
      yield* authorizeRecipient(memberId);
      const id = yield* Schema.decodeEffect(Assignment.Id)(assignmentId);
      const found = yield* assignmentStore.get(id);
      if (Option.isNone(found)) return yield* new NotFound({ assignmentId: id });
      const record = found.value;
      if (record.memberId !== memberId) return yield* new NotFound({ assignmentId: id });
      if (Assignment.Source.isAnyOf(["Role"])(record.source))
        yield* delegation.requireGrant(record.source.roleId);
      if (record.status === "revoked") return record;
      return yield* assignmentCommand.revokeAssignment(record);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const change = Effect.fn("AssignmentService.change")(
    function* (input: Assignment.ChangeInput) {
      const request = yield* Schema.decodeEffect(Assignment.ChangeInput)(input);
      yield* authorizeRecipient(request.memberId);
      yield* delegation.requireGrant(request.roleId);
      const current = (yield* delegation.assignmentsFor(request.memberId)).filter(isWorkspaceRole);
      if (
        current.length !== request.expectedAssignmentIds.length ||
        current.some(({ id }) => !request.expectedAssignmentIds.includes(id))
      )
        return yield* new Changed({ memberId: request.memberId });
      for (const record of current) yield* delegation.requireGrant(record.source.roleId);
      const same = current.find(({ source }) => source.roleId === request.roleId);
      if (current.length === 1 && same !== undefined) return same;
      for (const record of current) yield* assignmentCommand.revokeAssignment(record);
      return yield* assignmentCommand.assignRole(request.memberId, request.roleId);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return AssignmentService.of({
    permissions,
    roles: listRoleChoices,
    list,
    assign,
    revoke,
    change,
  });
});

/**
 * Provide the assignment operations over the stores, authorization, delegation, the command, and
 * the journal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(AssignmentService, make());
