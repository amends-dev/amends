import { Schema } from "effect";
import * as Identity from "../identity/Identity.ts";
import * as Invitation from "./Invitation.ts";

/** The outcomes `InvitationService` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "InvitationService.AlreadyMember",
  { recipientId: Identity.HumanId },
) {}
export class InvalidExpiry extends Schema.TaggedError<InvalidExpiry>()(
  "InvitationService.InvalidExpiry",
  {},
) {}
export class NotFound extends Schema.TaggedError<NotFound>()("InvitationService.NotFound", {
  invitationId: Invitation.Id,
}) {}
export class NotRecipient extends Schema.TaggedError<NotRecipient>()(
  "InvitationService.NotRecipient",
  { invitationId: Invitation.Id },
) {}
export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "InvitationService.Unavailable",
  {
    invitationId: Invitation.Id,
    reason: Schema.Literals(["expired", "revoked", "accepted"]),
  },
) {}
