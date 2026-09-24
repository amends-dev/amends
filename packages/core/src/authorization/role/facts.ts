import { Subject } from "../../journal/subject.ts";
import { Schema } from "effect";
import { Audience } from "../../journal/audience.ts";
import { Fact } from "../../journal/fact.ts";
import { Workspace } from "../../workspace/workspace.ts";
import { BuiltinRoles } from "./builtin.ts";
import { Role } from "./role.ts";

/** Establishes a workspace role with its initial permission names. */
export const Created = Fact.make("workspace.role.created", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("role", payload.roleId),
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    name: Role.Record.fields.name,
    permissions: Role.Record.fields.permissions,
  }),
  occurrence: (payload) => [payload.roleId],
});

/** Changes the display name while retaining the role's identity. */
export const Renamed = Fact.make("workspace.role.renamed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("role", payload.roleId),
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    name: Role.Record.fields.name,
  }),
});

/** Replaces the complete permission list; an empty list removes all permissions. */
export const PermissionsChanged = Fact.make("workspace.role.permissions-changed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("role", payload.roleId),
  version: 1,
  payload: Schema.Struct({
    roleId: Role.Id,
    workspaceId: Workspace.Id,
    permissions: Role.Record.fields.permissions,
  }),
});

/**
 * The workspace's built-in roles now hold this revision's bundles. Recorded at initialization
 * and after each upgrade, following the role facts that brought them there.
 */
export const BuiltinsRevised = Fact.make("workspace.role.builtins-revised", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("builtin-roles", payload.workspaceId),
  version: 1,
  payload: Schema.Struct({ workspaceId: Workspace.Id, revision: BuiltinRoles.Revision }),
  occurrence: (payload) => [String(payload.revision)],
});

export * as RoleFacts from "./facts.ts";
