import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Group } from "./group.ts";

/** A group's creation; a public one is news to everyone who might join it. */
export const Created = Fact.make("group.created", {
  audience: (payload) =>
    payload.kind === "Team" && payload.visibility === "Public"
      ? [Audience.workspace, Group.audienceOf(payload.id)]
      : [Group.audienceOf(payload.id)],
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
