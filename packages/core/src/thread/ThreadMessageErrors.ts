/**
 * The outcomes `ThreadMessageService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { Member } from "../workspace/member/member.ts";
import { ThreadId } from "./ThreadId.ts";

/**
 * An agent asked to publish; only people publish through the service, and agents' messages come
 * from their turns.
 *
 * @category errors
 * @since 0.1.0
 */
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadMessageService.HumanAuthorRequired",
  {
    memberId: Member.Id,
  },
) {}

/**
 * The thread is missing, in another workspace, or outside the actor's groups; the three are not
 * told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadMessageService.NotFound", {
  threadId: ThreadId.Id,
}) {}

/**
 * A mentioned member cannot take part: they are missing, inactive, or not in the group.
 *
 * @category errors
 * @since 0.1.0
 */
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadMessageService.ParticipantUnavailable",
  {
    memberId: Member.Id,
  },
) {}

export * as ThreadMessageErrors from "./ThreadMessageErrors.ts";
