import { Schema } from "effect";
import { Group } from "../group/group.ts";
import { Member } from "../workspace/member/member.ts";
import { Thread } from "./thread.ts";

/** The outcomes `ThreadApplication` reports that a caller can act on; schemas only, for contracts. */
/** A direct group needs the author and at least one other member. */
export class DirectMembersRequired extends Schema.TaggedError<DirectMembersRequired>()(
  "ThreadApplication.DirectMembersRequired",
  {},
) {}
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ThreadApplication.GroupNotFound",
  { groupId: Group.Id },
) {}
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadApplication.HumanAuthorRequired",
  { memberId: Member.Id },
) {}
/** Missing, foreign, and outside-audience threads share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadApplication.NotFound", {
  threadId: Thread.Id,
}) {}
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadApplication.ParticipantUnavailable",
  { memberId: Member.Id },
) {}

export * as ThreadErrors from "./errors.ts";
