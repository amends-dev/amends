/**
 * Tasks: work a thread tracks, with a status, a priority, and an assignee, keyed by the thread.
 * `Task` is the record and its changes; `TaskService` the operations an actor calls; `TaskCommand`
 * the writes workflows share; `TaskActivity` and `TaskTimeline` how a task appears in its thread's
 * timeline; and `TaskStore` the contract every storage adapter implements.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as Task from "./Task.ts"

/**
 * @since 0.1.0
 */
export * as TaskActivity from "./TaskActivity.ts"

/**
 * @since 0.1.0
 */
export * as TaskCommand from "./TaskCommand.ts"

/**
 * @since 0.1.0
 */
export * as TaskFacts from "./TaskFacts.ts"

/**
 * @since 0.1.0
 */
export * as TaskPermissions from "./TaskPermissions.ts"

/**
 * @since 0.1.0
 */
export * as TaskProjection from "./TaskProjection.ts"

/**
 * @since 0.1.0
 */
export * as TaskService from "./TaskService.ts"

/**
 * @since 0.1.0
 */
export * as TaskStore from "./TaskStore.ts"

/**
 * @since 0.1.0
 */
export * as TaskTimeline from "./TaskTimeline.ts"
