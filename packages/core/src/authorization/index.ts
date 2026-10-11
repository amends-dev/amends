/**
 * Authorization: who may do what to which target in one workspace. Features declare the actions
 * that need a grant as `Permission` definitions, which `PermissionCatalog` holds; a `Requirement`
 * names one on a `Target`, and `Authorization` checks an operation's requirements against the
 * acting member's grants, which `GrantResolver` resolves from their `Assignment`s, by `Role` or
 * direct `Grant`, each in a `Scope`. `BuiltinRoles` are the only roles, and `BuiltinRoleUpgrade`
 * keeps them current. `AssignmentService` is the operations an actor calls, `Delegation` the
 * rules for who may give roles, and the stores the contracts every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * An assignment's record and source, the inputs that assign and change roles, and the views of a
 * member's access.
 *
 * @since 0.1.0
 */
export * as Assignment from "./Assignment.ts";

/**
 * The operations on assignments an actor calls: listing access and permissions, and assigning,
 * changing, and revoking roles.
 *
 * @since 0.1.0
 */
export * as AssignmentService from "./AssignmentService.ts";

/**
 * The writes to assignments that operations share, run inside the caller's commit.
 *
 * @since 0.1.0
 */
export * as AssignmentCommand from "./AssignmentCommand.ts";

/**
 * The actions on assignments that need a grant: reading and managing them.
 *
 * @since 0.1.0
 */
export * as AssignmentPermissions from "./AssignmentPermissions.ts";

/**
 * The facts recorded about assignments.
 *
 * @since 0.1.0
 */
export * as AssignmentFacts from "./AssignmentFacts.ts";

/**
 * The projection that keeps the assignment read model.
 *
 * @since 0.1.0
 */
export * as AssignmentProjection from "./AssignmentProjection.ts";

/**
 * The storage contract for assignments.
 *
 * @since 0.1.0
 */
export * as AssignmentStore from "./AssignmentStore.ts";

/**
 * The check every operation runs for the acting member against its requirements.
 *
 * @since 0.1.0
 */
export * as Authorization from "./Authorization.ts";

/**
 * The rules for who may give, change, or take away a member's roles.
 *
 * @since 0.1.0
 */
export * as Delegation from "./Delegation.ts";

/**
 * The built-in Member, Administrator, and Owner roles, and the bundles built for them.
 *
 * @since 0.1.0
 */
export * as BuiltinRoles from "./BuiltinRoles.ts";

/**
 * What brings a workspace's built-in roles to the host's revision when it boots.
 *
 * @since 0.1.0
 */
export * as BuiltinRoleUpgrade from "./BuiltinRoleUpgrade.ts";

/**
 * One permission in one scope, and whether a member's grants cover a requirement.
 *
 * @since 0.1.0
 */
export * as Grant from "./Grant.ts";

/**
 * The grants a member currently holds, resolved from their active assignments.
 *
 * @since 0.1.0
 */
export * as GrantResolver from "./GrantResolver.ts";

/**
 * How a feature declares an action that needs a grant.
 *
 * @since 0.1.0
 */
export * as Permission from "./Permission.ts";

/**
 * The permissions this host declares, checked and frozen at start.
 *
 * @since 0.1.0
 */
export * as PermissionCatalog from "./PermissionCatalog.ts";

/**
 * One permission an operation needs on one target.
 *
 * @since 0.1.0
 */
export * as Requirement from "./Requirement.ts";

/**
 * A role's record: a named bundle of permissions in one workspace.
 *
 * @since 0.1.0
 */
export * as Role from "./Role.ts";

/**
 * The facts recorded about roles and the built-in bundles' revision.
 *
 * @since 0.1.0
 */
export * as RoleFacts from "./RoleFacts.ts";

/**
 * The projection that keeps the role read model.
 *
 * @since 0.1.0
 */
export * as RoleProjection from "./RoleProjection.ts";

/**
 * The storage contract for roles.
 *
 * @since 0.1.0
 */
export * as RoleStore from "./RoleStore.ts";

/**
 * What a grant covers: a whole workspace or one exact target.
 *
 * @since 0.1.0
 */
export * as Scope from "./Scope.ts";

/**
 * What an action is done to: a workspace, member, thread, group, connection, or channel.
 *
 * @since 0.1.0
 */
export * as Target from "./Target.ts";
