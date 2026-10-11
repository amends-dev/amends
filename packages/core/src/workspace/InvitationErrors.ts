/**
 * The outcomes `InvitationService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Identity from "../identity/Identity.ts";
import * as Invitation from "./Invitation.ts";

/**
 * The person has an active membership already, so they can neither be invited nor accept.
 *
 * @category errors
 * @since 0.1.0
 */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "InvitationService.AlreadyMember",
  { recipientId: Identity.HumanId },
) {}

/**
 * The expiry given is not after now.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidExpiry extends Schema.TaggedError<InvalidExpiry>()(
  "InvitationService.InvalidExpiry",
  {},
) {}

/**
 * No invitation has this ID in the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("InvitationService.NotFound", {
  invitationId: Invitation.Id,
}) {}

/**
 * The authenticated person is not whom the invitation names; only the named recipient may accept.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotRecipient extends Schema.TaggedError<NotRecipient>()(
  "InvitationService.NotRecipient",
  { invitationId: Invitation.Id },
) {}

/**
 * The invitation cannot be accepted or revoked now: it has expired, was revoked, or was accepted
 * already, as `reason` says.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "InvitationService.Unavailable",
  {
    invitationId: Invitation.Id,
    reason: Schema.Literals(["expired", "revoked", "accepted"]),
  },
) {}
