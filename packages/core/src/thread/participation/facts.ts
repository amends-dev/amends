import { Fact } from "../../journal/fact.ts";
import { Subject } from "../../journal/subject.ts";
import { ThreadParticipation } from "./participation.ts";
export const Added = Fact.make("thread.participation.added", {
  version: 1,
  subject: (payload) => Subject.make("thread-participation", payload.id),
  occurrence: (payload) => [payload.id],
  payload: ThreadParticipation.Admission,
});
export * as ThreadParticipationFacts from "./facts.ts";
