/**
 * The actions on a thread that need a grant: starting one in a group, reading one, and renaming
 * one. Publishing and following are declared beside their operations, in
 * `ThreadMessagePermissions` and `ThreadParticipationPermissions`. Every action also needs current
 * membership of the group.
 *
 * @since 0.1.0
 */
import { Permission } from "../authorization/permission.ts";

/**
 * Start a thread in a group.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Start = Permission.make("thread.start", {
  targetKind: "Group",
  builtinTier: "member",
});

/**
 * Read a thread: its record, timeline, and participants. Lists skip the threads it does not cover.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Read = Permission.make("thread.read", {
  targetKind: "Thread",
  builtinTier: "member",
});

/**
 * Give a thread a title, or change the one it has.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Rename = Permission.make("thread.rename", {
  targetKind: "Thread",
  builtinTier: "member",
});

export * as ThreadPermissions from "./ThreadPermissions.ts";
