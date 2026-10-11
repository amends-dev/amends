/**
 * The facts recorded about participations: a participant admitted to a thread, and a participation
 * ended. Each carries its thread's group, whose members may see who takes part, because an
 * audience is derived from the payload alone.
 *
 * @since 0.1.0
 */
import * as Fact from "../journal/Fact.ts";
import { Schema } from "effect";
import * as Subject from "../journal/Subject.ts";
import * as Group from "../group/Group.ts";
import * as GroupId from "../group/GroupId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as ThreadParticipation from "./ThreadParticipation.ts";

/**
 * A participant was admitted to a thread: the participation as it began, active and not ended.
 *
 * @category facts
 * @since 0.1.0
 */
export const Added = Fact.make("thread.participation.added", {
  version: 1,
  subject: (payload) => Subject.make("thread-participation", payload.id),
  occurrence: (payload) => [payload.id],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Schema.Struct({ ...ThreadParticipation.Admission.fields, groupId: GroupId.Id }),
});

/**
 * A participation ended, for the reason recorded. Only unfollowing records one now; a departure
 * from the group ends participations through `GroupMembershipFacts.Removed` instead.
 *
 * @category facts
 * @since 0.1.0
 */
export const Ended = Fact.make("thread.participation.ended", {
  version: 1,
  subject: (payload) => Subject.make("thread-participation", payload.participationId),
  occurrence: (payload) => [payload.participationId],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Schema.Struct({
    ...ThreadParticipation.Departure.fields,
    groupId: GroupId.Id,
    /** The member who took part, whose work may stop with it. */
    memberId: MemberId.Id,
    reason: ThreadParticipation.EndReason,
  }),
});
