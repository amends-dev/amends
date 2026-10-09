import { Schema } from "effect";
import { Group } from "../group/group.ts";
import { Member } from "../workspace/member/member.ts";
import { Thread } from "./thread.ts";

/** The outcomes `ThreadService` reports that a caller can act on; schemas only, for contracts. */
/** A direct group needs the author and at least one other member. */
export class DirectMembersRequired extends Schema.TaggedError<DirectMembersRequired>()(
  "ThreadService.DirectMembersRequired",
  {},
) {}

export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ThreadService.GroupNotFound",
  { groupId: Group.Id },
) {}

export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadService.HumanAuthorRequired",
  { memberId: Member.Id },
) {}

/** Missing, foreign, and outside-audience threads share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadService.NotFound", {
  threadId: Thread.Id,
}) {}

export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadService.ParticipantUnavailable",
  { memberId: Member.Id },
) {}

export * as ThreadErrors from "./errors.ts";
