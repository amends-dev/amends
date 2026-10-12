/**
 * The outcomes `OwnershipService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Member from "../Member.ts";
import * as Workspace from "../Workspace.ts";

/**
 * The member cannot become owner: they are the owner already, removed, or an agent, as `reason`
 * says.
 */
export class InvalidRecipient extends Schema.TaggedError<InvalidRecipient>()(
  "OwnershipService.InvalidRecipient",
  {
    memberId: Member.Id,
    reason: Schema.Literals(["same-owner", "removed", "agent"]),
  },
) {}

/**
 * The actor is not the current owner, or is not a person; only the owner transfers, whatever
 * their grants.
 */
export class NotOwner extends Schema.TaggedError<NotOwner>()("OwnershipService.NotOwner", {
  workspaceId: Workspace.Id,
}) {}
