/**
 * How a member's browser keeps a workspace in sync, as Effect eventlog events. The browser writes
 * actions, what the member does, which it applies at once and the server runs as core's
 * operations; the server writes back changes, each record the member may see as it is now or
 * gone from their replica, and how each action ended. Each domain's module, such as `ThreadSync`,
 * holds its actions and changes, `ReplicaSync` the reset, `Outcomes` how actions ended, and
 * `SyncSchema` all of them as the schema of a member's store.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as AgentSync from "./AgentSync.ts"

/**
 * @since 0.1.0
 */
export * as ChannelSync from "./ChannelSync.ts"

/**
 * @since 0.1.0
 */
export * as ConnectionSync from "./ConnectionSync.ts"

/**
 * @since 0.1.0
 */
export * as GroupSync from "./GroupSync.ts"

/**
 * @since 0.1.0
 */
export * as NotificationSync from "./NotificationSync.ts"

/**
 * @since 0.1.0
 */
export * as Outcomes from "./Outcomes.ts"

/**
 * @since 0.1.0
 */
export * as ReplicaSync from "./ReplicaSync.ts"

/**
 * @since 0.1.0
 */
export * as SyncSchema from "./SyncSchema.ts"

/**
 * @since 0.1.0
 */
export * as TaskSync from "./TaskSync.ts"

/**
 * @since 0.1.0
 */
export * as ThreadSync from "./ThreadSync.ts"

/**
 * @since 0.1.0
 */
export * as TurnSync from "./TurnSync.ts"

/**
 * @since 0.1.0
 */
export * as WorkspaceSync from "./WorkspaceSync.ts"
