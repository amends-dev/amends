/**
 * The identity of a workspace membership, in a leaf of its own so that models which refer to
 * members, such as actors, performers, group memberships, and connections, need not import the
 * member's record.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Identifies one admission to a workspace. Rejoining after removal creates a new membership with
 * a new ID, so a member ID names one span of access as well as who held it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceMemberId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;
