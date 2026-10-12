/**
 * The outcomes core reports by kind, whichever operation raises them. Each says in its fields what
 * it is about and in its `message` what happened, so a protocol or client handles a kind once,
 * however many operations report it, and a new operation adds no mapping: `NotFound`, for anything
 * the caller named that is missing or out of their reach, and `Changed`, for what changed since the
 * caller read it.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * What an error names, as core's modules name it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Resource = Schema.Literals([
  "Agent",
  "Assignment",
  "Channel",
  "ChannelBinding",
  "Connection",
  "Group",
  "GroupMembership",
  "Invitation",
  "Member",
  "Notification",
  "Role",
  "Task",
  "Thread",
  "ThreadMessage",
  "ThreadParticipation",
  "Turn",
  "Workspace",
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Resource = typeof Resource.Type;

/**
 * The caller named something that is missing, or out of their reach, as a thread outside their
 * groups is; the two are not told apart, so no caller learns what exists beyond what they may
 * read. `id` is the ID the caller named, or that the operation reached it by: a thread's task by
 * the thread's ID, and a thread's binding to a channel by the thread's.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("CoreError.NotFound", {
  resource: Resource,
  id: Schema.String,
}) {
  override get message(): string {
    return `${this.resource} ${this.id} not found`;
  }
}

/**
 * What the caller expected of a resource, such as the name, title, revision, or roles they last
 * read, is no longer so: someone changed it meanwhile, and nothing was recorded. Reading it again
 * and asking against what it is now may succeed.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("CoreError.Changed", {
  resource: Resource,
  id: Schema.String,
}) {
  override get message(): string {
    return `${this.resource} ${this.id} changed since it was read`;
  }
}
