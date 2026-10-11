/**
 * The writes to tasks that workflows share, run inside the caller's commit: creating a thread's
 * task, and changing it. Each publishes the task fact and records the activity at the thread's next
 * position, admitting the participants the change brings in and telling those it reaches, by the
 * rules below; a change that takes an agent off the task asks the agent's turn there to stop. The
 * caller owns authorization and gives a change that replaces the task's value as it is.
 *
 * | Change                        | Admits                | Tells                                                   |
 * | ----------------------------- | --------------------- | ------------------------------------------------------- |
 * | Created                       | Triage when in triage; the assignee | Those admitted; the assignee is asked for work when the task is being worked |
 * | Assignee                      | The new assignee      | The new assignee, asked for work when the task is being worked |
 * | Status to `triage`            | Triage                | Triage                                                  |
 * | Status to `todo` or `doing`   | The assignee          | Every participant; the assignee is asked for work       |
 * | Status to `held`, `done`, or `dismissed` | Nobody     | Every participant                                       |
 * | Priority                      | Nobody                | Every participant                                       |
 *
 * Whoever made the change is told nothing.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Option } from "effect";
import type { DateTime } from "effect";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import type * as Thread from "../thread/Thread.ts";
import type * as ThreadActivity from "../thread/ThreadActivity.ts";
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import * as ThreadCommand from "../thread/ThreadCommand.ts";
import type * as ThreadMessage from "../thread/ThreadMessage.ts";
import type * as ThreadParticipation from "../thread/ThreadParticipation.ts";
import * as ThreadQuery from "../thread/ThreadQuery.ts";
import * as ThreadStore from "../thread/ThreadStore.ts";
import * as TurnCommand from "../turn/TurnCommand.ts";
import * as TurnStore from "../turn/TurnStore.ts";
import type * as Member from "../workspace/Member.ts";
import * as Task from "./Task.ts";
import * as TaskActivity from "./TaskActivity.ts";
import * as TaskFacts from "./TaskFacts.ts";

/**
 * What the writes can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = ThreadCommand.Error | TurnCommand.EndError | TurnStore.Failure;

/**
 * What creates a task: its thread, how it starts, who created it, and when. `by` is who made the
 * change, as a participant, and is told nothing; a job creating a task names nobody.
 *
 * @category options
 * @since 0.1.0
 */
export interface CreateInput extends Pick<Task.Record, "status" | "priority" | "assignee"> {
  readonly thread: Thread.Record;
  readonly createdBy: ThreadMessage.Author;
  readonly by: ThreadParticipation.Reference | undefined;
  readonly occurredAt: DateTime.Utc;
}

/**
 * A created task and the timeline activity that records it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Created {
  readonly task: Task.Record;
  readonly activity: TaskActivity.Created;
}

/**
 * What changes a task: the task as it is, one change from its current value, who made it, and when.
 *
 * @category options
 * @since 0.1.0
 */
export interface UpdateInput {
  readonly task: Task.Record;
  readonly change: Task.Change;
  readonly by: ThreadParticipation.Reference | undefined;
  readonly occurredAt: DateTime.Utc;
}

/**
 * A changed task and the timeline activity that records the change.
 *
 * @category models
 * @since 0.1.0
 */
export interface Updated {
  readonly task: Task.Record;
  readonly activity: TaskActivity.Updated;
}

/**
 * The shared writes of tasks. Internal: not among `Core.Operations`.
 *
 * @effect-expect-leaking Transaction
 *
 * The shared writes.
 *
 * @category services
 * @since 0.1.0
 */
export class TaskCommand extends Context.Service<
  TaskCommand,
  {
    /**
     * Make the thread a task, at its next position, in the caller's commit. The caller authorizes
     * the creation and gives a thread without a task.
     */
    readonly create: (
      input: CreateInput,
    ) => Effect.Effect<Created, Error, Store.Transaction | Publication.Publication>;
    /**
     * Change a task in one way, at its thread's next position, in the caller's commit. An agent
     * taken off the task, by reassignment or by a status that asks no work, has its turn there
     * stopped. The caller authorizes the change and checks it replaces the task's value as it is.
     */
    readonly update: (
      input: UpdateInput,
    ) => Effect.Effect<Updated, Error, Store.Transaction | Publication.Publication>;
  }
>()("@amends-dev/core/task/TaskCommand") {}

const member = (memberId: Member.Id): ThreadParticipation.Reference => ({
  _tag: "Member",
  memberId,
});

/** Who takes part through a task in this state: triage while it is in triage, and its assignee. */
const participantsOf = (
  task: Pick<Task.Record, "status" | "assignee">,
): ReadonlyArray<ThreadParticipation.Reference> => [
  ...(task.status === "triage" ? [{ _tag: "Triage" } as const] : []),
  ...(task.assignee === null ? [] : [member(task.assignee)]),
];

/**
 * Whom a change brings into the thread: the new assignee, triage as the task enters triage, and
 * the assignee as work resumes.
 */
const admittedBy = (change: Task.Change, next: Task.Record) =>
  Task.Change.match(change, {
    Assignee: ({ to }) => (to === null ? [] : [member(to)]),
    Status: ({ to }) =>
      to === "triage"
        ? [{ _tag: "Triage" } as const]
        : Task.working(to) && next.assignee !== null
          ? [member(next.assignee)]
          : [],
    Priority: () => [],
  });

/** Whom a change asks for work: the assignee while the task is being worked; a priority informs alone. */
const askedBy = (change: Task.Change, next: Task.Record): Member.Id | null =>
  Task.Change.isAnyOf(["Priority"])(change) ? null : Task.asked(next);

/** Whether a change reaches every participant, rather than those it admits alone. */
const reachesEveryone = (change: Task.Change) =>
  !Task.Change.isAnyOf(["Assignee"])(change) &&
  !(Task.Change.isAnyOf(["Status"])(change) && change.to === "triage");

/** The agent a change takes off the task: the former assignee, or the assignee as work stops. */
const leftBy = (task: Task.Record, change: Task.Change): Member.Id | null =>
  Task.Change.match(change, {
    Assignee: ({ from }) => from,
    Status: ({ to }) =>
      to === "held" || to === "done" || to === "dismissed" ? task.assignee : null,
    Priority: () => null,
  });

/**
 * Capture the shared thread writes and reads, the journal, and the turn command.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("TaskCommand.make")(function* () {
  const journal = yield* Journal.Journal;
  const threadCommand = yield* ThreadCommand.ThreadCommand;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const threadStore = yield* ThreadStore.ThreadStore;
  const turnCommand = yield* TurnCommand.TurnCommand;
  const turnStore = yield* TurnStore.TurnStore;
  const { workspaceId } = yield* Store.Store;

  /** The thread a task belongs to, which a task cannot outlive. */
  const threadOf = Effect.fnUntraced(function* (task: Task.Record) {
    const found = yield* threadStore.get(task.threadId);
    if (Option.isNone(found)) return yield* Effect.die("A task's thread is missing");
    return found.value;
  });

  const create = Effect.fn("TaskCommand.create")(function* (input: CreateInput) {
    yield* Store.Transaction;
    const { thread } = input;
    const task: Task.Record = {
      threadId: thread.id,
      workspaceId,
      groupId: thread.groupId,
      status: input.status,
      priority: input.priority,
      assignee: input.assignee,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    };
    const created = yield* threadCommand.publishActivity({
      thread,
      occurredAt: input.occurredAt,
      admit: participantsOf(task),
      step: ({ admitted }) =>
        Effect.gen(function* () {
          const fact = yield* journal
            .publish(TaskFacts.Created, task)
            .pipe(Publication.withOccurredAt(input.occurredAt));
          return {
            value: task,
            kind: TaskActivity.Created,
            details: {
              status: task.status,
              priority: task.priority,
              assignee: task.assignee,
              createdBy: task.createdBy,
            },
            recipients: Task.recipients(admitted.participants, input.by, Task.asked(task)),
            cause: fact,
          };
        }),
    });
    const activity = yield* Effect.orDie(
      ThreadActivityKind.decode(TaskActivity.Created, created.event.payload.activity),
    );
    return { task, activity } satisfies Created;
  });

  /** Ask the agent's active turn in the thread, if it has one, to stop. */
  const stopTurnOf = Effect.fnUntraced(function* (memberId: Member.Id, thread: Thread.Record) {
    const active = yield* turnStore.findActive(memberId, thread.id);
    if (Option.isSome(active) && active.value.status !== "cancelling")
      yield* turnCommand.requestStop(active.value, "task-changed");
  });

  const update = Effect.fn("TaskCommand.update")(function* (input: UpdateInput) {
    yield* Store.Transaction;
    const { task, change } = input;
    if (Task.valueOf(task, change) !== change.from)
      return yield* Effect.die("A change must replace the task's value as it is");
    const thread = yield* threadOf(task);
    const next = Task.apply(task, change);
    const updated = yield* threadCommand.publishActivity({
      thread,
      occurredAt: input.occurredAt,
      admit: admittedBy(change, next),
      step: ({ admitted }) =>
        Effect.gen(function* () {
          const fact = yield* journal
            .publish(TaskFacts.Updated, {
              workspaceId,
              threadId: thread.id,
              groupId: thread.groupId,
              change,
              changedAt: input.occurredAt,
            })
            .pipe(Publication.withOccurredAt(input.occurredAt));
          const told: ReadonlyArray<ThreadActivity.Recipient> = Task.recipients(
            reachesEveryone(change)
              ? yield* threadQuery.currentParticipants(thread)
              : admitted.participants,
            input.by,
            askedBy(change, next),
          );
          return {
            value: next,
            kind: TaskActivity.Updated,
            details: change,
            recipients: told,
            cause: fact,
          };
        }),
    });
    const left = leftBy(task, change);
    if (left !== null) yield* stopTurnOf(left, thread);
    const activity = yield* Effect.orDie(
      ThreadActivityKind.decode(TaskActivity.Updated, updated.event.payload.activity),
    );
    return { task: next, activity } satisfies Updated;
  });

  return TaskCommand.of({ create, update });
});

/**
 * Provide the shared task writes over the thread writes and reads, the turn command, and the
 * stores.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(TaskCommand, make());
