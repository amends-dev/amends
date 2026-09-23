import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Subject } from "../../journal/subject.ts";
import { GroupFollow } from "./follow.ts";

export const Started = Fact.make("group.follow.started", {
  version: 1,
  subject: (payload) => Subject.make("group-follow", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct({
    ...GroupFollow.Record.fields,
    status: Schema.Literal("active"),
    endedAt: Schema.Null,
  }),
});

/** Ends one follow by its ID. Leaving the group ends its follow without this fact. */
export const Ended = Fact.make("group.follow.ended", {
  version: 1,
  subject: (payload) => Subject.make("group-follow", payload.followId),
  occurrence: (payload) => [payload.followId],
  payload: GroupFollow.Ending,
});

export * as GroupFollowFacts from "./facts.ts";
