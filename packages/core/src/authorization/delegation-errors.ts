import { Schema } from "effect";
import { Workspace } from "../workspace/workspace.ts";
import { Role } from "./role/role.ts";

/** The outcomes `Delegation` reports that a caller can act on; schemas only, for contracts. */
export class Denied extends Schema.TaggedError<Denied>()("Delegation.Denied", {
  reason: Schema.Literals(["administrator-role", "protected-member"]),
}) {}
export class OwnerProtected extends Schema.TaggedError<OwnerProtected>()(
  "Delegation.OwnerProtected",
  {
    workspaceId: Workspace.Id,
  },
) {}
export class RoleNotFound extends Schema.TaggedError<RoleNotFound>()("Delegation.RoleNotFound", {
  roleId: Role.Id,
}) {}
export class UnsupportedRole extends Schema.TaggedError<UnsupportedRole>()(
  "Delegation.UnsupportedRole",
  { roleId: Role.Id },
) {}

export * as DelegationErrors from "./delegation-errors.ts";
