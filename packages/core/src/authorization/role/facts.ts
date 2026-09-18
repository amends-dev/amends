import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Workspace } from "../../workspace/workspace.ts";
import { Role } from "./role.ts";

/** Establishes a workspace role with its initial permission names. */
export const Created = Fact.make("workspace.role.created", {
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    name: Role.Record.fields.name,
    permissions: Role.Record.fields.permissions,
  }),
});

/** Changes the display name while retaining the role's identity. */
export const Renamed = Fact.make("workspace.role.renamed", {
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    name: Role.Record.fields.name,
  }),
});

/** Replaces the complete permission list; an empty list removes all permissions. */
export const PermissionsChanged = Fact.make("workspace.role.permissions-changed", {
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    permissions: Role.Record.fields.permissions,
  }),
});

export * as RoleFacts from "./facts.ts";
