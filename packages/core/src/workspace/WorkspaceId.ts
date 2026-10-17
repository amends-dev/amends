/**
 * The identity of a workspace, in a leaf of its own so that models which refer to workspaces,
 * such as every record's `workspaceId`, authorization targets, and journal provenance, need not
 * import the workspace's record. `CurrentWorkspaceId` is the workspace a core runs for, which
 * storage binds with the workspace's stores, and `rejectForeign` is how those stores refuse a
 * record of another workspace.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Schema from "effect/Schema"

/**
 * Names a workspace. The host allocates it when it creates the workspace and binds storage to it;
 * inside core, a service reads it from `CurrentWorkspaceId`.
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

/**
 * The workspace a core runs for: storage binds it with the workspace's stores, and every service
 * that names its workspace reads it here.
 *
 * @category services
 * @since 0.1.0
 */
export class CurrentWorkspaceId extends Context.Service<CurrentWorkspaceId, WorkspaceId>()(
  "@amends-dev/core/workspace/WorkspaceId/CurrentWorkspaceId"
) {}

/** Does the value, or any value in it, name another workspace? */
const isForeign = (value: unknown, workspaceId: WorkspaceId): boolean =>
  Array.isArray(value)
    ? value.some((item) => isForeign(item, workspaceId))
    : typeof value === "object" && value !== null && "workspaceId" in value && value.workspaceId !== workspaceId

/**
 * How a store bound to `workspaceId` refuses a write of a record that names another workspace,
 * for `StoreInput.write`: why it is refused, or nothing to accept it.
 *
 * @category predicates
 * @since 0.1.0
 */
export const rejectForeign =
  (workspaceId: WorkspaceId) =>
  (value: unknown): string | undefined =>
    isForeign(value, workspaceId) ? "Expected a record in this workspace" : undefined
