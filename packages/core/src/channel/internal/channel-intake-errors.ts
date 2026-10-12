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
