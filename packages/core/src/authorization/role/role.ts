import { Schema } from "effect";
import * as Workspace from "../../workspace/workspace.ts";
import * as Permission from "../permission.ts";

/** Stable identity retained when the role's display name or permissions change. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceRoleId"));
export type Id = typeof Id.Type;

/**
 * A workspace-owned permission bundle. Assignments supply recipients and scopes.
 * Permission definitions and existing assignments must be checked when editing a role.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: Workspace.Id,
  name: Schema.NonEmptyString,
  /** Empty roles confer no permissions; each permission name appears at most once. */
  permissions: Schema.UniqueArray(Permission.Name),
});
export interface Record extends Schema.Schema.Type<typeof Record> {}
