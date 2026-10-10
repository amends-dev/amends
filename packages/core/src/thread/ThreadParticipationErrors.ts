/**
 * The outcomes `ThreadParticipationService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { Thread } from "./Thread.ts";
import { ThreadParticipation } from "./ThreadParticipation.ts";

/**
 * The actor's participation had already ended.
 *
 * @category errors
 * @since 0.1.0
 */
export class AlreadyEnded extends Schema.TaggedError<AlreadyEnded>()(
  "ThreadParticipationService.AlreadyEnded",
  ThreadParticipation.UnfollowInput.fields,
) {}

/**
 * The participation is missing, in another thread, or another member's; the three are not told
 * apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()(
  "ThreadParticipationService.NotFound",
  ThreadParticipation.UnfollowInput.fields,
) {}

/**
 * Everyone in a direct conversation takes part in all of its threads, so none is unfollowed.
 *
 * @category errors
 * @since 0.1.0
 */
export class FixedParticipation extends Schema.TaggedError<FixedParticipation>()(
  "ThreadParticipationService.FixedParticipation",
  { threadId: Thread.Id },
) {}

/**
 * The thread is missing, in another workspace, or outside the actor's groups; the three are not
 * told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "ThreadParticipationService.ThreadNotFound",
  { threadId: Thread.Id },
) {}

export * as ThreadParticipationErrors from "./ThreadParticipationErrors.ts";
