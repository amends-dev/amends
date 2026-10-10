/**
 * The facts recorded about a thread itself. Its messages, participations, and activity have facts
 * of their own, in `ThreadMessageFacts`, `ThreadParticipationFacts`, and `ThreadActivityFacts`.
 *
 * @since 0.1.0
 */
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Group } from "../group/group.ts";
import { Thread } from "./Thread.ts";

/**
 * A thread was created, as its record says. The members of its group may learn of it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("thread.created", {
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  version: 2,
  subject: (payload) => Subject.make("thread", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Thread.Record,
});

/**
 * A thread's title changed; each rename is its own fact. The same commit records a quiet
 * `thread.renamed` activity in the thread's timeline.
 *
 * @category facts
 * @since 0.1.0
 */
export const Renamed = Fact.make("thread.renamed", {
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  version: 1,
  subject: (payload) => Subject.make("thread", payload.threadId),
  payload: Thread.Renamed,
});

export * as ThreadFacts from "./ThreadFacts.ts";
