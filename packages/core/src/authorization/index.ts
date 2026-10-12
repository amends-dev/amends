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

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as Assignment from "./Assignment.ts";

/**
 * @since 0.1.0
 */
export * as AssignmentCommand from "./AssignmentCommand.ts";

/**
 * @since 0.1.0
 */
export * as AssignmentFacts from "./AssignmentFacts.ts";

/**
 * @since 0.1.0
 */
export * as AssignmentPermissions from "./AssignmentPermissions.ts";

/**
 * @since 0.1.0
 */
export * as AssignmentProjection from "./AssignmentProjection.ts";

/**
 * @since 0.1.0
 */
export * as AssignmentService from "./AssignmentService.ts";

/**
 * @since 0.1.0
 */
export * as AssignmentStore from "./AssignmentStore.ts";

/**
 * @since 0.1.0
 */
export * as Authorization from "./Authorization.ts";

/**
 * @since 0.1.0
 */
export * as BuiltinRoles from "./BuiltinRoles.ts";

/**
 * @since 0.1.0
 */
export * as BuiltinRoleUpgrade from "./BuiltinRoleUpgrade.ts";

/**
 * @since 0.1.0
 */
export * as Delegation from "./Delegation.ts";

/**
 * @since 0.1.0
 */
export * as Grant from "./Grant.ts";

/**
 * @since 0.1.0
 */
export * as GrantResolver from "./GrantResolver.ts";

/**
 * @since 0.1.0
 */
export * as Permission from "./Permission.ts";

/**
 * @since 0.1.0
 */
export * as PermissionCatalog from "./PermissionCatalog.ts";

/**
 * @since 0.1.0
 */
export * as Requirement from "./Requirement.ts";

/**
 * @since 0.1.0
 */
export * as Role from "./Role.ts";

/**
 * @since 0.1.0
 */
export * as RoleFacts from "./RoleFacts.ts";

/**
 * @since 0.1.0
 */
export * as RoleProjection from "./RoleProjection.ts";

/**
 * @since 0.1.0
 */
export * as RoleStore from "./RoleStore.ts";

/**
 * @since 0.1.0
 */
export * as Scope from "./Scope.ts";

/**
 * @since 0.1.0
 */
export * as Target from "./Target.ts";
