/**
 * The outcomes `Delegation` reports that a caller can act on. They are schemas, so protocols carry
 * them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Role from "../Role.ts";

/**
 * The role is not one of the three built-in ones; no other role is delegated.
 */
export class UnsupportedRole extends Schema.TaggedError<UnsupportedRole>()(
  "Delegation.UnsupportedRole",
  { roleId: Role.Id },
) {}
