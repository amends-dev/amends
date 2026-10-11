/**
 * A task: work a thread tracks, as a row keyed by the thread, holding its current status, priority,
 * and assignee. Its title is the thread's and its description the thread's opening message, so it
 * holds no text of its own. A thread has at most one task, created with the thread or in a
 * conversation later, and each change to it is activity in the thread's timeline. `TaskService` is
 * the operations, and `TaskCommand` the writes other workflows share.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as GroupId from "../group/GroupId.ts";
import * as Notification from "../notification/Notification.ts";
import type * as ThreadActivity from "../thread/ThreadActivity.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadMessage from "../thread/ThreadMessage.ts";
import * as ThreadParticipation from "../thread/ThreadParticipation.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemberId from "../workspace/MemberId.ts";

/**
 * Where a task stands: awaiting a decision in `triage`, being worked in `todo` and `doing`, set
 * aside in `held`, or finished as `done` or `dismissed`. A finished task's thread goes on, and a
 * later status reopens the work.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["triage", "todo", "doing", "held", "done", "dismissed"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type;

/**
 * How urgent a task is.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Priority = Schema.Literals(["none", "low", "medium", "high", "urgent"]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Priority = typeof Priority.Type;

/**
 * Whether a task in this status is being worked, so its assignee is asked to work it: `todo` and
 * `doing`. In `triage` a decision is awaited, and `held`, `done`, and `dismissed` ask no work.
 *
 * @category utils
 * @since 0.1.0
 */
export const working = (status: Status): boolean => status === "todo" || status === "doing";

/**
 * The assignee, while the task is being worked and so asks them to work it; null otherwise.
 *
 * @category utils
 * @since 0.1.0
 */
export const asked = (task: { readonly status: Status; readonly assignee: MemberId.Id | null }) =>
  working(task.status) ? task.assignee : null;

/**
 * A task as created and since changed. The thread is its key: a thread has at most one task, and a
 * task has exactly one thread.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Task = Schema.Struct({
  threadId: ThreadId.Id,
  workspaceId: WorkspaceId.Id,
  /** The thread's group, which is the assignee pool, copied so tasks list by group. */
  groupId: GroupId.Id,
  status: Status,
  priority: Priority,
  /** The one member responsible, or null. An assignee takes part in the thread. */
  assignee: Schema.NullOr(MemberId.Id),
  /** Who created the task: a member, or the contact whose conversation a channel opened as one. */
  createdBy: ThreadMessage.Author,
  createdAt: Schema.DateTimeUtcFromString,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Task extends Schema.Schema.Type<typeof Task> {}

/**
 * One change to a task: its status, assignee, or priority, with the value it replaces, so a later
 * change cannot alter what an earlier one meant, and a change made meanwhile is not silently
 * replaced.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Change = Schema.TaggedUnion({
  Status: { from: Status, to: Status },
  Assignee: { from: Schema.NullOr(MemberId.Id), to: Schema.NullOr(MemberId.Id) },
  Priority: { from: Priority, to: Priority },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Change = typeof Change.Type;

/**
 * The task's current value of what a change changes.
 *
 * @category utils
 * @since 0.1.0
 */
export const valueOf = (task: Task, change: Change): Change["from"] => {
  switch (change._tag) {
    case "Status":
      return task.status;
    case "Assignee":
      return task.assignee;
    case "Priority":
      return task.priority;
  }
};

/**
 * The task with a change applied.
 *
 * @category utils
 * @since 0.1.0
 */
export const apply = (task: Task, change: Change): Task =>
  Change.match(change, {
    Status: ({ to }): Task => Object.assign({}, task, { status: to }),
    Assignee: ({ to }): Task => Object.assign({}, task, { assignee: to }),
    Priority: ({ to }): Task => Object.assign({}, task, { priority: to }),
  });

/**
 * How a task is created: its status, `triage` unless given, or `todo` when assigned; its priority,
 * `none` unless given; and its assignee, if any.
 *
 * @category options
 * @since 0.1.0
 */
export const Options = Schema.Struct({
  status: Schema.optionalKey(Status),
  priority: Schema.optionalKey(Priority),
  assignee: Schema.optionalKey(MemberId.Id),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface Options extends Schema.Schema.Type<typeof Options> {}

/**
 * What a task starts as, from its options.
 *
 * @category utils
 * @since 0.1.0
 */
export const initial = (options: Options): Pick<Task, "status" | "priority" | "assignee"> => ({
  status: options.status ?? (options.assignee === undefined ? "triage" : "todo"),
  priority: options.priority ?? "none",
  assignee: options.assignee ?? null,
});

/**
 * What creates a task in a conversation: the thread, and how the task starts.
 *
 * @category options
 * @since 0.1.0
 */
export const CreateInput = Schema.Struct({ threadId: ThreadId.Id, ...Options.fields });

/**
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/**
 * What changes a task: its thread, and one change from the value the changer last saw.
 *
 * @category options
 * @since 0.1.0
 */
export const UpdateInput = Schema.Struct({ threadId: ThreadId.Id, change: Change });

/**
 * @category options
 * @since 0.1.0
 */
export interface UpdateInput extends Schema.Schema.Type<typeof UpdateInput> {}

/**
 * What changing a task records: the change, and when. The group is the fact's audience.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Updated = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  groupId: GroupId.Id,
  change: Change,
  changedAt: Schema.DateTimeUtcFromString,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Updated extends Schema.Schema.Type<typeof Updated> {}

/**
 * Exclusive boundary for paging a group's tasks by when they were created, newest first: the last
 * listed task's creation time and thread.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ListCursor = Schema.Struct({
  createdAt: Task.fields.createdAt,
  threadId: ThreadId.Id,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ListCursor extends Schema.Schema.Type<typeof ListCursor> {}

/**
 * One page of a group's tasks by creation, newest first: those of one status when given, at most
 * `limit`, after the exclusive `before` cursor, or the newest without one.
 *
 * @category options
 * @since 0.1.0
 */
export const ListOptions = Schema.Struct({
  status: Schema.optionalKey(Status),
  before: Schema.optionalKey(ListCursor),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
});

/**
 * @category options
 * @since 0.1.0
 */
export interface ListOptions extends Schema.Schema.Type<typeof ListOptions> {}

/**
 * Whom a change on a task's thread reaches: every participant given but whoever made it, told,
 * and `asked`, when an agent among them, asked for work.
 *
 * @category utils
 * @since 0.1.0
 */
export const recipients = (
  participants: ReadonlyArray<ThreadParticipation.ThreadParticipation>,
  by: ThreadParticipation.Reference | undefined,
  asked: MemberId.Id | null,
): ReadonlyArray<ThreadActivity.Recipient> => {
  const byKey = by === undefined ? undefined : ThreadParticipation.keyOf(by);
  return participants.flatMap(({ id, participant }) => {
    // A task's changes are never delivered: contacts are told of messages alone.
    if (ThreadParticipation.Participant.isAnyOf(["Contact"])(participant)) return [];
    if (ThreadParticipation.keyOf(participant) === byKey) return [];
    const recipient = ThreadParticipation.recipientOf(participant);
    return [
      {
        participationId: id,
        recipient,
        requestsWork:
          Notification.Recipient.isAnyOf(["Agent"])(recipient) && recipient.memberId === asked,
      },
    ];
  });
};
