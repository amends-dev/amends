/**
 * Tasks: work a thread tracks, with a status, a priority, and an assignee, keyed by the thread.
 * `Task` is the record and its changes; `TaskService` the operations an actor calls; `TaskCommand`
 * the writes workflows share; `TaskActivity` and `TaskTimeline` how a task appears in its thread's
 * timeline; and `TaskStore` the contract every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * A task's record, its status and priority, its changes, and the inputs that create and change one.
 *
 * @since 0.1.0
 */
export { Task } from "./Task.ts";

/**
 * The kinds of activity a task records in its thread's timeline.
 *
 * @since 0.1.0
 */
export { TaskActivity } from "./TaskActivity.ts";

/**
 * The writes to tasks that workflows share, run inside the caller's commit.
 *
 * @since 0.1.0
 */
export { TaskCommand } from "./TaskCommand.ts";

/**
 * The outcomes `TaskService` reports that a caller can act on.
 *
 * @since 0.1.0
 */
export { TaskErrors } from "./TaskErrors.ts";

/**
 * The facts recorded about tasks.
 *
 * @since 0.1.0
 */
export { TaskFacts } from "./TaskFacts.ts";

/**
 * The actions on tasks that need a grant.
 *
 * @since 0.1.0
 */
export { TaskPermissions } from "./TaskPermissions.ts";

/**
 * The projection that keeps the task read model.
 *
 * @since 0.1.0
 */
export { TaskProjection } from "./TaskProjection.ts";

/**
 * The operations on tasks an actor calls: creating one in a conversation, changing one, and reading.
 *
 * @since 0.1.0
 */
export { TaskService } from "./TaskService.ts";

/**
 * The storage contract for tasks.
 *
 * @since 0.1.0
 */
export { TaskStore } from "./TaskStore.ts";

/**
 * How a task appears in a timeline.
 *
 * @since 0.1.0
 */
export { TaskTimeline } from "./TaskTimeline.ts";
