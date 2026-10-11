/**
 * The actions on channels that need a grant: creating one, seeing one, and managing one. What a
 * channel receives is taken in by the host, under no member's grant, and read through its threads.
 *
 * @since 0.1.0
 */
import * as Permission from "../authorization/permission.ts";

/**
 * Create a channel: give a connection's channel transport a destination group in the workspace.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Create = Permission.make("channel.create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});

/**
 * See a channel: its connection, destination, name, and whether it opens tasks.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Read = Permission.make("channel.read", {
  targetKind: "Channel",
  builtinTier: "member",
});

/**
 * Redirect a channel to another group, and remove it.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Manage = Permission.make("channel.manage", {
  targetKind: "Channel",
  builtinTier: "administrator",
});
