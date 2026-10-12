/**
 * The outcomes `ThreadParticipationService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Thread from "../Thread.ts";
import * as ThreadParticipation from "../ThreadParticipation.ts";

/**
 * The actor's participation had already ended.
 */
export class AlreadyEnded extends Schema.TaggedError<AlreadyEnded>()(
  "ThreadParticipationService.AlreadyEnded",
  ThreadParticipation.UnfollowInput.fields,
) {}

/**
 * Everyone in a direct conversation takes part in all of its threads, so none is unfollowed.
 */
export class FixedParticipation extends Schema.TaggedError<FixedParticipation>()(
  "ThreadParticipationService.FixedParticipation",
  { threadId: Thread.Id },
) {}
