/**
 * The actions on tasks that need a grant: creating one in a group, and changing one in its thread.
 * Reading a task is reading its thread.
 *
 * @since 0.1.0
 */
import { Permission } from "../authorization/permission.ts";

/**
 * Create a task in a group: with its thread, or in one of the group's conversations.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Create = Permission.make("task.create", {
  targetKind: "Group",
  builtinTier: "member",
});

/**
 * Change a task's status, assignee, or priority.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Update = Permission.make("task.update", {
  targetKind: "Thread",
  builtinTier: "member",
});

export * as TaskPermissions from "./TaskPermissions.ts";
