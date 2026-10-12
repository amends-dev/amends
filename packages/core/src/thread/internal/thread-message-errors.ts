/**
 * The outcomes `ThreadMessageService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Member from "../../workspace/Member.ts";
import * as ThreadMessageId from "../ThreadMessageId.ts";

/**
 * The message's revision is no longer the one the editor expected: someone edited it meanwhile.
 */
export class Changed extends Schema.TaggedError<Changed>()("ThreadMessageService.Changed", {
  messageId: ThreadMessageId.Id,
}) {}

/**
 * The message was deleted, so it has no text to edit.
 */
export class Deleted extends Schema.TaggedError<Deleted>()("ThreadMessageService.Deleted", {
  messageId: ThreadMessageId.Id,
}) {}

/**
 * An agent asked to publish; only people publish through the service, and agents' messages come
 * from their turns.
 */
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadMessageService.HumanAuthorRequired",
  {
    memberId: Member.Id,
  },
) {}

/**
 * Someone other than the message's author asked to edit it; only the author edits a message.
 */
export class NotAuthor extends Schema.TaggedError<NotAuthor>()("ThreadMessageService.NotAuthor", {
  messageId: ThreadMessageId.Id,
}) {}

/**
 * A mentioned member cannot take part: they are missing, inactive, or not in the group.
 */
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadMessageService.ParticipantUnavailable",
  {
    memberId: Member.Id,
  },
) {}
