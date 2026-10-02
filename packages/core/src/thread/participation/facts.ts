import { Fact } from "../../journal/fact.ts";
import { Schema } from "effect";
import { Subject } from "../../journal/subject.ts";
import { Group } from "../../group/group.ts";
import { GroupId } from "../../group/id.ts";
import { MemberId } from "../../workspace/member/id.ts";
import { ThreadParticipation } from "./participation.ts";
/** Participation with its thread's group, whose members may see who takes part. */
export const Added = Fact.make("thread.participation.added", {
  version: 1,
  subject: (payload) => Subject.make("thread-participation", payload.id),
  occurrence: (payload) => [payload.id],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Schema.Struct({ ...ThreadParticipation.Admission.fields, groupId: GroupId.Id }),
});
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
export * as ThreadParticipationFacts from "./facts.ts";
