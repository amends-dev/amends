/**
 * The actions on messages that need a grant: publishing, which covers editing and deleting one's
 * own, and moderating, deleting others'. Every action also needs current membership of the group.
 *
 * @since 0.1.0
 */

import * as Permission from "../authorization/Permission.ts"

/**
 * Publish a message in a thread, or tell its readers one is being written. Replying needs no
 * `thread.read`.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Publish = Permission.make("thread.publish", {
  targetKind: "Thread",
  builtinTier: "member"
})

/**
 * Delete another member's message in a thread of the group.
 *
 * @category permissions
 * @since 0.1.0
 */
export const Moderate = Permission.make("thread.moderate", {
  targetKind: "Group",
  builtinTier: "administrator"
})
