/**
 * The outcomes `Delegation` reports that a caller can act on. They are schemas, so protocols carry
 * them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Workspace from "../../workspace/Workspace.ts";
import * as Role from "../Role.ts";

/**
 * The actor may not delegate this: only the owner gives Administrator (`administrator-role`), and
 * only the owner changes a member who holds a direct grant or a role other than Member
 * (`protected-member`).
 */
export class Denied extends Schema.TaggedError<Denied>()("Delegation.Denied", {
  reason: Schema.Literals(["administrator-role", "protected-member"]),
}) {}

/**
 * The owner is out of reach: Owner is given by ownership transfer alone, and the owner's own
 * roles are changed by no one.
 */
export class OwnerProtected extends Schema.TaggedError<OwnerProtected>()(
  "Delegation.OwnerProtected",
  {
    workspaceId: Workspace.Id,
  },
) {}

/**
 * The role is not one of the three built-in ones; no other role is delegated.
 */
export class UnsupportedRole extends Schema.TaggedError<UnsupportedRole>()(
  "Delegation.UnsupportedRole",
  { roleId: Role.Id },
) {}
