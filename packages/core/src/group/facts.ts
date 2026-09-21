import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Group } from "./group.ts";

export const Created = Fact.make("group.created", {
  version: 1,
  subject: (payload) => Subject.make("group", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Group.Record,
});

export * as GroupFacts from "./facts.ts";
