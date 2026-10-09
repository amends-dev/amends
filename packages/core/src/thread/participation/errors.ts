import { Schema } from "effect";
import { Thread } from "../thread.ts";
import { ThreadParticipation } from "./participation.ts";

/** The outcomes `ThreadParticipationService` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyEnded extends Schema.TaggedError<AlreadyEnded>()(
  "ThreadParticipationService.AlreadyEnded",
  ThreadParticipation.UnfollowInput.fields,
) {}

/** Missing, other-thread, and other-member participations share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()(
  "ThreadParticipationService.NotFound",
  ThreadParticipation.UnfollowInput.fields,
) {}

/** Everyone in a direct conversation takes part in all of its threads, so none is unfollowed. */
export class FixedParticipation extends Schema.TaggedError<FixedParticipation>()(
  "ThreadParticipationService.FixedParticipation",
  { threadId: Thread.Id },
) {}

export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "ThreadParticipationService.ThreadNotFound",
  { threadId: Thread.Id },
) {}

export * as ThreadParticipationErrors from "./errors.ts";
