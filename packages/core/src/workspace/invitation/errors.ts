import { Schema } from "effect";
import { Identity } from "../../identity/identity.ts";
import { Invitation } from "./invitation.ts";

/** The outcomes `InvitationApplication` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "InvitationApplication.AlreadyMember",
  { recipientId: Identity.HumanId },
) {}
export class InvalidExpiry extends Schema.TaggedError<InvalidExpiry>()(
  "InvitationApplication.InvalidExpiry",
  {},
) {}
export class NotFound extends Schema.TaggedError<NotFound>()("InvitationApplication.NotFound", {
  invitationId: Invitation.Id,
}) {}
export class NotRecipient extends Schema.TaggedError<NotRecipient>()(
  "InvitationApplication.NotRecipient",
  { invitationId: Invitation.Id },
) {}
export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "InvitationApplication.Unavailable",
  {
    invitationId: Invitation.Id,
    reason: Schema.Literals(["expired", "revoked", "accepted"]),
  },
) {}

export * as InvitationErrors from "./errors.ts";
