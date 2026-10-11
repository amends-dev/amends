/**
 * Groups: lasting spaces for threads within a workspace, team or direct, with the admissions that
 * make each one's audience and the follows that enroll members in its new threads. `Group`,
 * `GroupMembership`, and `GroupFollow` are the records; `GroupService`, `GroupMembershipService`,
 * and `GroupFollowService` the operations an actor calls; `GroupQuery` and `GroupCommand` the read
 * and writes other domains share; and the stores the contracts every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * A group's record, team or direct, the views lists show of it, and the inputs that create and
 * rename one.
 *
 * @since 0.1.0
 */
export * as Group from "./Group.ts";

/**
 * The operations on groups an actor calls: creating, renaming, and reading them.
 *
 * @since 0.1.0
 */
export * as GroupService from "./GroupService.ts";

/**
 * The writes to groups that operations share, run inside the caller's commit.
 *
 * @since 0.1.0
 */
export * as GroupCommand from "./GroupCommand.ts";

/**
 * The read of groups that operations share: the actor's current audience membership.
 *
 * @since 0.1.0
 */
export * as GroupQuery from "./GroupQuery.ts";

/**
 * The facts recorded about a group itself.
 *
 * @since 0.1.0
 */
export * as GroupFacts from "./GroupFacts.ts";

/**
 * The actions on a group that need a grant: creating, reading, renaming, following, and
 * moderating one.
 *
 * @since 0.1.0
 */
export * as GroupPermissions from "./GroupPermissions.ts";

/**
 * The projection that keeps the group read model.
 *
 * @since 0.1.0
 */
export * as GroupProjection from "./GroupProjection.ts";

/**
 * The storage contract for groups.
 *
 * @since 0.1.0
 */
export * as GroupStore from "./GroupStore.ts";

/**
 * One member's admission to one group, and the inputs that add, remove, and leave.
 *
 * @since 0.1.0
 */
export * as GroupMembership from "./GroupMembership.ts";

/**
 * The operations on membership an actor calls: adding, removing, joining, leaving, and listing a
 * roster.
 *
 * @since 0.1.0
 */
export * as GroupMembershipService from "./GroupMembershipService.ts";

/**
 * The actions on membership that need a grant: managing a team group's members, and joining a
 * public one.
 *
 * @since 0.1.0
 */
export * as GroupMembershipPermissions from "./GroupMembershipPermissions.ts";

/**
 * The facts recorded about admissions.
 *
 * @since 0.1.0
 */
export * as GroupMembershipFacts from "./GroupMembershipFacts.ts";

/**
 * The projection that keeps the admission read model.
 *
 * @since 0.1.0
 */
export * as GroupMembershipProjection from "./GroupMembershipProjection.ts";

/**
 * The storage contract for admissions.
 *
 * @since 0.1.0
 */
export * as GroupMembershipStore from "./GroupMembershipStore.ts";

/**
 * A member's follow of a team group, held through their admission, and the input that starts and
 * ends one.
 *
 * @since 0.1.0
 */
export * as GroupFollow from "./GroupFollow.ts";

/**
 * The operations on following an actor calls: following and unfollowing a team group.
 *
 * @since 0.1.0
 */
export * as GroupFollowService from "./GroupFollowService.ts";

/**
 * The facts recorded about follows.
 *
 * @since 0.1.0
 */
export * as GroupFollowFacts from "./GroupFollowFacts.ts";

/**
 * The projection that keeps the follow read model.
 *
 * @since 0.1.0
 */
export * as GroupFollowProjection from "./GroupFollowProjection.ts";

/**
 * The storage contract for follows.
 *
 * @since 0.1.0
 */
export * as GroupFollowStore from "./GroupFollowStore.ts";
