import { Schema } from "effect";
import { Thread } from "../thread.ts";
import { ThreadParticipation } from "./participation.ts";

/** The outcomes `ThreadParticipationApplication` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyEnded extends Schema.TaggedError<AlreadyEnded>()(
  "ThreadParticipationApplication.AlreadyEnded",
  ThreadParticipation.UnfollowInput.fields,
) {}
/** Missing, other-thread, and other-member participations share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()(
  "ThreadParticipationApplication.NotFound",
  ThreadParticipation.UnfollowInput.fields,
) {}
export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  "ThreadParticipationApplication.ThreadNotFound",
  { threadId: Thread.Id },
) {}

export * as ThreadParticipationErrors from "./errors.ts";
