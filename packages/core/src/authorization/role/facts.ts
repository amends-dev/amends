import { Subject } from "../../journal/subject.ts";
import { Schema } from "effect";
import { Audience } from "../../journal/audience.ts";
import { Fact } from "../../journal/fact.ts";
import { Workspace } from "../../workspace/workspace.ts";
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

export * as RoleFacts from "./facts.ts";
