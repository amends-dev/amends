/**
 * The outcomes `ThreadMessageService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Member from "../workspace/member/member.ts";
import * as ThreadId from "./ThreadId.ts";
import * as ThreadMessageId from "./ThreadMessageId.ts";

/**
 * The message's revision is no longer the one the editor expected: someone edited it meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("ThreadMessageService.Changed", {
  messageId: ThreadMessageId.Id,
}) {}

/**
 * The message was deleted, so it has no text to edit.
 *
 * @category errors
 * @since 0.1.0
 */
export class Deleted extends Schema.TaggedError<Deleted>()("ThreadMessageService.Deleted", {
  messageId: ThreadMessageId.Id,
}) {}

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
 * The message is missing, in another workspace, or in a thread outside the actor's groups; the
 * three are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class MessageNotFound extends Schema.TaggedError<MessageNotFound>()(
  "ThreadMessageService.MessageNotFound",
  { messageId: ThreadMessageId.Id },
) {}

/**
 * Someone other than the message's author asked to edit it; only the author edits a message.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotAuthor extends Schema.TaggedError<NotAuthor>()("ThreadMessageService.NotAuthor", {
  messageId: ThreadMessageId.Id,
}) {}

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
