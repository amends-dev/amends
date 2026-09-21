import { Fact } from "../../journal/fact.ts";
import { Schema } from "effect";
import { Subject } from "../../journal/subject.ts";
import { ThreadParticipation } from "./participation.ts";
export const Added = Fact.make("thread.participation.added", {
  version: 1,
  subject: (payload) => Subject.make("thread-participation", payload.id),
  occurrence: (payload) => [payload.id],
  payload: ThreadParticipation.Admission,
});
export const Ended = Fact.make("thread.participation.ended", {
  version: 1,
  subject: (payload) => Subject.make("thread-participation", payload.participationId),
  occurrence: (payload) => [payload.participationId],
  payload: Schema.Struct({
    ...ThreadParticipation.Departure.fields,
    reason: ThreadParticipation.EndReason,
  }),
});
export * as ThreadParticipationFacts from "./facts.ts";
