import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Group } from "./group.ts";

export const Created = Fact.make("group.created", {
  audience: (payload) => [Group.audienceOf(payload.id)],
  version: 1,
  subject: (payload) => Subject.make("group", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Group.Record,
});

/** A team group's name changed; each rename is its own fact. */
export const Renamed = Fact.make("group.renamed", {
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  version: 1,
  subject: (payload) => Subject.make("group", payload.groupId),
  payload: Group.Renamed,
});

export * as GroupFacts from "./facts.ts";
