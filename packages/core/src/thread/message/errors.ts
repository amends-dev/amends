import { Schema } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { ThreadId } from "../id.ts";

/** The outcomes `ThreadMessageApplication` reports that a caller can act on; schemas only, for contracts. */
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadMessageApplication.HumanAuthorRequired",
  {
    memberId: Member.Id,
  },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadMessageApplication.NotFound", {
  threadId: ThreadId.Id,
}) {}
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadMessageApplication.ParticipantUnavailable",
  {
    memberId: Member.Id,
  },
) {}

export * as ThreadMessageErrors from "./errors.ts";
