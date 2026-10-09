import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Group } from "../group/group.ts";
import { Thread } from "./thread.ts";
export const Created = Fact.make("thread.created", {
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  version: 1,
  subject: (payload) => Subject.make("thread", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Thread.Record,
});

export * as ThreadFacts from "./facts.ts";
