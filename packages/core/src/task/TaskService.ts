/**
 * The operations on tasks an actor calls: making a conversation a task, changing a task, and
 * reading a thread's task or a group's tasks. A task created with its thread is `ThreadService`'s
 * start. Each operation authorizes the actor itself, writes inside one journal commit, and reads
 * outside any.
 *
 * @since 0.1.0
 */
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as AgentPermissions from "../agent/AgentPermissions.ts";
import * as Authorization from "../authorization/Authorization.ts";
import * as Requirement from "../authorization/Requirement.ts";
import type * as Group from "../group/Group.ts";
import * as Actor from "../identity/Actor.ts";
import * as Identity from "../identity/Identity.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as Thread from "../thread/Thread.ts";
import * as ThreadQuery from "../thread/ThreadQuery.ts";
import * as ThreadStore from "../thread/ThreadStore.ts";
import type * as Member from "../workspace/Member.ts";
import * as Task from "./Task.ts";
import * as TaskCommand from "./TaskCommand.ts";
import * as TaskPermissions from "./TaskPermissions.ts";
import * as TaskStore from "./TaskStore.ts";
import * as CoreError from "../error/CoreError.ts";
import * as StoreError from "../journal/StoreError.ts";

/**
 * What creating a task in a conversation can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type CreateError =
  | Authorization.Error
  | ThreadQuery.AccessError
  | TaskCommand.Error
  | StoreError.StoreError
  | CoreError.NotFound
  | CoreError.Conflict;

/**
 * What changing a task can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type UpdateError =
  | Authorization.Error
  | ThreadQuery.AccessError
  | TaskCommand.Error
  | StoreError.StoreError
  | CoreError.NotFound
  | CoreError.Changed
  | CoreError.Conflict;

/**
 * What reading tasks can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError =
  | ThreadQuery.AccessError
  | ThreadQuery.ListError
  | StoreError.StoreError
  | CoreError.NotFound;

/**
 * The task operations, one of `Core.Operations`.
 *
 * The task operations.
 *
 * @category services
 * @since 0.1.0
 */
export class TaskService extends Context.Service<
  TaskService,
  {
    /**
     * Make a conversation a task, under current group audience and `task.create` on the group. The
     * conversation's opening message becomes the task's description, and its title stays as it is.
     * A thread that is a task already is `CoreError.Conflict` (`AlreadyTask`). An assignee must be
     * able to take part in the thread, and assigning an agent needs `agent.use` on it. Returns the
     * task.
     */
    readonly create: (
      input: Task.CreateInput,
    ) => Effect.Effect<Task.Task, CreateError, Actor.Actor>;
    /**
     * Change a task in one way, under current group audience and `task.update` on the thread. The
     * change names the value it replaces: the same value again records nothing, and a task that
     * changed meanwhile is `CoreError.Changed`. A new assignee must be able to take part, and
     * assigning an agent needs `agent.use` on it. Returns the task as changed.
     */
    readonly update: (
      input: Task.UpdateInput,
    ) => Effect.Effect<Task.Task, UpdateError, Actor.Actor>;
    /**
     * The thread's task, under current group audience and `thread.read`; a thread without one is
     * `CoreError.NotFound`.
     */
    readonly get: (threadId: Thread.Id) => Effect.Effect<Task.Task, ReadError, Actor.Actor>;
    /**
     * One page of a group's tasks the actor can read, newest created first, of one status when the
     * options name one: each thread with its task, latest activity, and the actor's position and
     * unread state, under the rules of `ThreadService.listInGroup`.
     */
    readonly listInGroup: (
      groupId: Group.Id,
      options: Task.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Thread.ListItem>, ReadError, Actor.Actor>;
  }
>()("@amends-dev/core/task/TaskService") {}

/**
 * Capture bound services; authorize each operation inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("TaskService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const threadStore = yield* ThreadStore.ThreadStore;
  const taskCommand = yield* TaskCommand.TaskCommand;
  const taskStore = yield* TaskStore.TaskStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  /** The thread's task, which it must have. */
  const requireTask = Effect.fnUntraced(function* (thread: Thread.Thread) {
    const found = yield* taskStore.get(thread.id);
    if (Option.isNone(found))
      return yield* new CoreError.NotFound({ resource: "Task", id: thread.id });
    return found.value;
  });

  /**
   * Require the assignee to be able to take part in the thread, and the actor's agent use when
   * the assignee is an agent, since assigning one directs it.
   */
  const requireAssignable = Effect.fnUntraced(function* (
    thread: Thread.Thread,
    memberId: Member.Id,
  ) {
    const eligible = yield* threadQuery.eligibleMembers(thread.groupId, [memberId]);
    const entry = eligible.get(memberId);
    if (entry === undefined)
      return yield* new CoreError.Conflict({
        reason: new CoreError.ParticipantUnavailable({ memberId }),
      });
    if (Identity.MemberReference.isAnyOf(["Agent"])(entry.member.identity))
      yield* authorization.require([
        Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
      ]);
  });

  /** The actor as a member, who created the task or made the change, and is told nothing of it. */
  const actorAsMember = Effect.map(
    Actor.Actor,
    (actor) => ({ _tag: "Member", memberId: actor.memberId }) as const,
  );

  const create = Effect.fn("TaskService.create")(
    function* (input: Task.CreateInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Task.CreateInput))(input);
      const thread = yield* threadQuery.requireAccess(request.threadId);
      yield* authorization.require([
        Requirement.make(TaskPermissions.Create, {
          _tag: "Group",
          workspaceId,
          groupId: thread.groupId,
        }),
      ]);
      if (Option.isSome(yield* taskStore.get(thread.id)))
        return yield* new CoreError.Conflict({
          reason: new CoreError.AlreadyTask({ threadId: thread.id }),
        });
      const initial = Task.initial(request);
      if (initial.assignee !== null) yield* requireAssignable(thread, initial.assignee);
      const by = yield* actorAsMember;
      const created = yield* taskCommand.create({
        thread,
        ...initial,
        createdBy: by,
        by,
        occurredAt: yield* DateTime.now,
      });
      return created.task;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const update = Effect.fn("TaskService.update")(
    function* (input: Task.UpdateInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Task.UpdateInput))(input);
      const thread = yield* threadQuery.requireAccess(request.threadId);
      const task = yield* requireTask(thread);
      yield* authorization.require([
        Requirement.make(TaskPermissions.Update, {
          _tag: "Thread",
          workspaceId,
          threadId: thread.id,
        }),
      ]);
      const { change } = request;
      if (Task.valueOf(task, change) === change.to) return task;
      if (Task.valueOf(task, change) !== change.from)
        return yield* new CoreError.Changed({ resource: "Task", id: thread.id });
      if (Task.Change.isAnyOf(["Assignee"])(change) && change.to !== null)
        yield* requireAssignable(thread, change.to);
      const updated = yield* taskCommand.update({
        task,
        change,
        by: yield* actorAsMember,
        occurredAt: yield* DateTime.now,
      });
      return updated.task;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  // Reads are outside journal.commit; an enclosing caller transaction remains authoritative.
  const get = Effect.fn("TaskService.get")(function* (threadId: Thread.Id) {
    const thread = yield* threadQuery.requireReadable(threadId);
    return yield* requireTask(thread);
  });

  const listInGroup = Effect.fn("TaskService.listInGroup")(function* (
    groupId: Group.Id,
    input: Task.ListOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(Task.ListOptions))(input);
    /** A page of the group's tasks, each with its thread, which a task cannot outlive. */
    const page = Effect.fnUntraced(function* (
      before: Task.ListCursor | undefined,
    ): Effect.fn.Return<
      ReadonlyArray<{ readonly task: Task.Task; readonly thread: Thread.Thread }>,
      StoreError.StoreError
    > {
      const tasks = yield* taskStore.listByGroup(groupId, {
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(before === undefined ? {} : { before }),
        limit: options.limit,
      });
      const threads = new Map(
        (yield* threadStore.getMany(tasks.map((task) => task.threadId))).map(
          (thread) => [thread.id, thread] as const,
        ),
      );
      return yield* Effect.forEach(tasks, (task) => {
        const thread = threads.get(task.threadId);
        return thread === undefined
          ? Effect.die("A task's thread is missing")
          : Effect.succeed({ task, thread });
      });
    });
    return yield* threadQuery.listReadable(groupId, {
      limit: options.limit,
      first: options.before,
      list: page,
      threadOf: ({ thread }) => thread,
      cursorOf: ({ task }): Task.ListCursor => ({
        createdAt: task.createdAt,
        threadId: task.threadId,
      }),
    });
  });

  return TaskService.of({ create, update, get, listInGroup });
});

/**
 * Provide the task operations over the shared writes and reads, the stores, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(TaskService, make());
