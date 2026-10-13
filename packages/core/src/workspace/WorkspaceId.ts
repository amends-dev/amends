/**
 * The identity of a workspace, in a leaf of its own so that models which refer to workspaces,
 * such as every record's `workspaceId`, authorization targets, and journal provenance, need not
 * import the workspace's record.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"

/**
 * Names a workspace. The host allocates it when it creates the workspace and binds storage to it;
 * inside core, a service reads it from `Store.Store`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const WorkspaceId = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type WorkspaceId = typeof WorkspaceId.Type
