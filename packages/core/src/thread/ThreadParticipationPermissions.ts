/**
 * The action on participation that needs a grant. Unfollowing needs none, so a member can leave a
 * thread after losing the grant.
 *
 * @since 0.1.0
 */
import { Permission } from "../authorization/permission.ts";

/**
 * Follow a thread: take part in it, and be notified of what it addresses to everyone.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Follow = Permission.make("thread.follow", {
  targetKind: "Thread",
  builtinTier: "member",
});

export * as ThreadParticipationPermissions from "./ThreadParticipationPermissions.ts";
