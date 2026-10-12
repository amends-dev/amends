/**
 * The facts recorded about tasks: one created, and one changed. Each carries its thread's group,
 * whose members may learn of it, because an audience is derived from the payload alone. The same
 * commit records the task's activity in the thread's timeline, `TaskActivity`.
 *
 * @since 0.1.0
 */
import * as Fact from "../journal/Fact.ts";
import * as Subject from "../journal/Subject.ts";
import * as Group from "../group/Group.ts";
import * as Task from "./Task.ts";

/**
 * A task was created, as its record says: once per thread.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("task.created", {
  version: 1,
  subject: (payload) => Subject.make("task", payload.threadId),
  occurrence: (payload) => [payload.threadId],
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Task.Task,
});

/**
 * A task changed in one way: its status, assignee, or priority, from one value to the next. Each
 * change is its own fact.
 *
 * @category facts
 * @since 0.1.0
 */
export const Updated = Fact.make("task.updated", {
  version: 1,
  subject: (payload) => Subject.make("task", payload.threadId),
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  payload: Task.Updated,
});
