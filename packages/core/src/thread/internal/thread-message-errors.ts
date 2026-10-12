/**
 * The outcomes `ThreadMessageService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Member from "../../workspace/Member.ts";
import * as ThreadMessageId from "../ThreadMessageId.ts";

/**
 * The message was deleted, so it has no text to edit.
 */
export class Deleted extends Schema.TaggedError<Deleted>()("ThreadMessageService.Deleted", {
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
