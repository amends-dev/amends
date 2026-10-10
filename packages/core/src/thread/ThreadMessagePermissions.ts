/**
 * The action on messages that needs a grant.
 *
 * @since 0.1.0
 */
import { Permission } from "../authorization/permission.ts";

/**
 * Publish a message in a thread, or tell its readers one is being written. Replying needs no
 * `thread.read`.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Publish = Permission.make("thread.publish", {
  targetKind: "Thread",
  builtinTier: "member",
});

export * as ThreadMessagePermissions from "./ThreadMessagePermissions.ts";
