/**
 * The outcomes `InvitationService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Identity from "../../identity/Identity.ts";
import * as Invitation from "../Invitation.ts";

/**
 * The person has an active membership already, so they can neither be invited nor accept.
 */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "InvitationService.AlreadyMember",
  { recipientId: Identity.HumanId },
) {}

/**
 * The expiry given is not after now.
 */
export class InvalidExpiry extends Schema.TaggedError<InvalidExpiry>()(
  "InvitationService.InvalidExpiry",
  {},
) {}

/**
 * The authenticated person is not whom the invitation names; only the named recipient may accept.
 */
export class NotRecipient extends Schema.TaggedError<NotRecipient>()(
  "InvitationService.NotRecipient",
  { invitationId: Invitation.Id },
) {}

/**
 * The invitation cannot be accepted or revoked now: it has expired, was revoked, or was accepted
 * already, as `reason` says.
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "InvitationService.Unavailable",
  {
    invitationId: Invitation.Id,
    reason: Schema.Literals(["expired", "revoked", "accepted"]),
  },
) {}
