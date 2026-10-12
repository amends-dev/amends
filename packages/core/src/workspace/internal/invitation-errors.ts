/**
 * The outcomes `InvitationService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";

/**
 * The expiry given is not after now.
 */
export class InvalidExpiry extends Schema.TaggedError<InvalidExpiry>()(
  "InvitationService.InvalidExpiry",
  {},
) {}
