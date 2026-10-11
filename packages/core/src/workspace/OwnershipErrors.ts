/**
 * The outcomes `OwnershipService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Member from "./Member.ts";
import * as Workspace from "./Workspace.ts";

/**
 * The Owner assignment is no longer the one the caller reviewed: ownership moved meanwhile, and
 * nothing was recorded.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("OwnershipService.Changed", {
  workspaceId: Workspace.Id,
}) {}

/**
 * The member cannot become owner: they are the owner already, removed, or an agent, as `reason`
 * says.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidRecipient extends Schema.TaggedError<InvalidRecipient>()(
  "OwnershipService.InvalidRecipient",
  {
    memberId: Member.Id,
    reason: Schema.Literals(["same-owner", "removed", "agent"]),
  },
) {}

/**
 * No membership has the ID given as the recipient.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "OwnershipService.MemberNotFound",
  { memberId: Member.Id },
) {}

/**
 * The actor is not the current owner, or is not a person; only the owner transfers, whatever
 * their grants.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotOwner extends Schema.TaggedError<NotOwner>()("OwnershipService.NotOwner", {
  workspaceId: Workspace.Id,
}) {}
