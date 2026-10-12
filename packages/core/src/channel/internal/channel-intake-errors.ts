/**
 * The outcomes `ChannelIntake` reports to whoever hands it an external system's requests. They are
 * schemas, so protocols carry them to the system; the service's error types add the failures of
 * what it depends on. `ChannelIntake` re-exports them.
 */
import { Schema } from "effect";

/**
 * The channel's transport rejected what the host received: it is not the external system's, or
 * its signature does not hold. Nothing was taken in.
 */
export class Rejected extends Schema.TaggedError<Rejected>()("ChannelIntake.Rejected", {
  description: Schema.String,
}) {}

/**
 * The channel cannot be reached now: its connection was removed or has no key, its integration is
 * not installed or gives no channels, or the external system could not answer. The system may send
 * again.
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()("ChannelIntake.Unavailable", {
  description: Schema.String,
}) {}
