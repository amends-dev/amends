/**
 * The identity of a group, in a leaf of its own so that models which refer to groups, such as
 * threads, tasks, notifications, and channel bindings, need not import the group's record.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Names a group. The general group's is the fixed `Group.GeneralId`; a keyed team creation
 * derives its own, so a retry names the group its first attempt created.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("GroupId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;
