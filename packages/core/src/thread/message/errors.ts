import { Schema } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { ThreadId } from "../id.ts";

/** The outcomes `ThreadMessageService` reports that a caller can act on; schemas only, for contracts. */
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadMessageService.HumanAuthorRequired",
  {
    memberId: Member.Id,
  },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()("ThreadMessageService.NotFound", {
  threadId: ThreadId.Id,
}) {}

export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadMessageService.ParticipantUnavailable",
  {
    memberId: Member.Id,
  },
) {}

export * as ThreadMessageErrors from "./errors.ts";
