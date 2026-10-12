/**
 * The outcomes `ThreadService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Member from "../../workspace/Member.ts";
import * as Thread from "../Thread.ts";

/**
 * The thread's title is no longer the one the renamer expected: someone renamed it meanwhile.
 */
export class Changed extends Schema.TaggedError<Changed>()("ThreadService.Changed", {
  threadId: Thread.Id,
}) {}

/**
 * A direct group needs the author and at least one other member.
 */
export class DirectMembersRequired extends Schema.TaggedError<DirectMembersRequired>()(
  "ThreadService.DirectMembersRequired",
  {},
) {}

/**
 * An agent asked to start a thread; only people start them, and agents' messages come from
 * their turns.
 */
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadService.HumanAuthorRequired",
  { memberId: Member.Id },
) {}

/**
 * A member who was to take part cannot: they are missing, inactive, or not in the group.
 */
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadService.ParticipantUnavailable",
  { memberId: Member.Id },
) {}
