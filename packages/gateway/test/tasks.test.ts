import { describe, expect, it } from "@effect/vitest";
import { AgentPermissions } from "@amends-dev/core/agent";
import {
  Assignment,
  AssignmentFacts,
  Grant,
  type Permission,
  type Target,
} from "@amends-dev/core/authorization";
import { GroupService } from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Entry, Journal, Publication } from "@amends-dev/core/journal";
import { Notification } from "@amends-dev/core/notification";
import { Request } from "@amends-dev/core/request";
import { Task, TaskPermissions, TaskService } from "@amends-dev/core/task";
import {
  Thread,
  ThreadMessageService,
  ThreadParticipation,
  ThreadPermissions,
  ThreadService,
} from "@amends-dev/core/thread";
import { Member, MemberFacts } from "@amends-dev/core/workspace";
import { DateTime, Effect, Option } from "effect";
import { TestClock } from "effect/testing";
import { withStorage } from "./fixture.ts";
import * as Support from "./support.ts";
import {
  type Bound,
  boundTo,
  listOldestFirst,
  otherWorkspaceId,
  runHost,
  takeTurnJobs,
  testProvenance,
  workspaceId,
} from "./support.ts";

/** Tasks: creation with a thread or in one, changes and whom they reach, and the task store. */

const { core, initialized } = Support;
describe("tasks", () => {
  const humanId = Member.Id.make("human");
  const otherId = Member.Id.make("other");
  const agentId = Member.Id.make("agent");
  const identityFor = (id: Member.Id): Identity.MemberReference =>
    id === agentId
      ? { _tag: "Agent", id: Identity.AgentId.make("agent") }
      : { _tag: "Human", id: Identity.HumanId.make(id) };
  const actorFor = (memberId: Member.Id) =>
    Actor.Actor.of({ workspaceId, memberId, identity: identityFor(memberId) });
  const run = <A, E, R>(
    bound: Bound,
    actor: Actor.Actor["Service"],
    effect: Effect.Effect<A, E, R>,
  ) => effect.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(core(bound)));
  const facts = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Publication.Publication, testProvenance(bound.store.workspaceId)),
      Effect.provide(core(bound)),
    );
  const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 100 });
  /** A recipient's notifications oldest first: the position each is about, and whether it asks work. */
  /** What a recipient was told, by thread sequence: one change tells everyone at one instant. */
  const toldOf = (bound: Bound, recipient: Notification.Recipient) =>
    Effect.map(listOldestFirst(bound.notifications, recipient, { limit: 100 }), (records) =>
      records
        .map((record) => ({
          sequence: record.thread?.sequence ?? 0,
          state: record.state._tag,
        }))
        .sort((left, right) => left.sequence - right.sequence),
    );
  const told = (bound: Bound, memberId: Member.Id) =>
    toldOf(bound, Notification.ofMember(memberId, identityFor(memberId)));
  const grant = (
    bound: Bound,
    memberId: Member.Id,
    permission: Permission.Definition,
    target: Target.Reference,
  ) =>
    facts(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.publish(AssignmentFacts.Created, {
          workspaceId: bound.store.workspaceId,
          assignmentId: Assignment.Id.make(
            `${memberId}:${permission.name}:${JSON.stringify(target)}`,
          ),
          memberId,
          source: { _tag: "Direct", grant: Grant.make(permission, { _tag: "Target", target }) },
        }),
      ),
    );
  const seed = (bound: Bound) =>
    facts(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          Effect.forEach([humanId, otherId, agentId], (memberId) =>
            journal.publish(MemberFacts.Added, {
              workspaceId: bound.store.workspaceId,
              memberId,
              identity: identityFor(memberId),
              name: Member.Name.make(memberId),
            }),
          ),
        ),
      ),
    );
  const create = (memberIds: ReadonlyArray<Member.Id>) =>
    Effect.flatMap(GroupService.GroupService, (groupService) =>
      groupService.createTeam({ name: "Engineering", memberIds, visibility: "Private" }),
    );
  const start = (
    input: Omit<Thread.StartInGroupInput, "text" | "mentions"> &
      Partial<Pick<Thread.StartInGroupInput, "text" | "mentions">>,
    options?: { readonly requestKey: Request.Key },
  ) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.startInGroup({ text: "Ship it", mentions: [], ...input }, options),
    );
  const taskOf = (threadId: Thread.Id) =>
    Effect.flatMap(TaskService.TaskService, (taskService) => taskService.get(threadId));
  const createTask = (input: Task.CreateInput) =>
    Effect.flatMap(TaskService.TaskService, (taskService) => taskService.create(input));
  const update = (threadId: Thread.Id, change: Task.Change) =>
    Effect.flatMap(TaskService.TaskService, (taskService) =>
      taskService.update({ threadId, change }),
    );
  const kinds = (bound: Bound, threadId: Thread.Id) =>
    Effect.map(bound.activities.listByThread(threadId), (activities) =>
      activities.map((activity) => [activity.sequence, activity.kind] as const),
    );
  /** Who takes part, by where they joined, then by participant. */
  const participants = (bound: Bound, threadId: Thread.Id) =>
    Effect.map(bound.participations.listByThread(threadId), (records) =>
      records
        .filter((record) => record.status === "active")
        .map(
          (record) =>
            [ThreadParticipation.keyOf(record.participant), record.joinedAtSequence] as const,
        )
        .toSorted((left, right) => left[1] - right[1] || left[0].localeCompare(right[0])),
    );
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId);
    const workspace = yield* initialized(bound);
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy },
    });
    yield* seed(bound);
    const group = yield* run(bound, owner, create([owner.memberId, humanId, agentId]));
    yield* takeTurnJobs(workspaceId);
    return {
      bound,
      owner,
      group,
      human: actorFor(humanId),
      other: actorFor(otherId),
      agent: actorFor(agentId),
    };
  });

  it.effect(
    "a thread started as a task creates it at its second position, admitting triage or its assignee",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group, human } = yield* prepare();
            const groupTarget: Target.Reference = {
              _tag: "Group",
              workspaceId,
              groupId: group.id,
            };
            yield* TestClock.adjust("1 second");
            const now = yield* DateTime.now;
            // Unassigned, a task awaits triage, which joins the thread and is told at the task.
            const triaged = yield* run(
              bound,
              owner,
              start({ groupId: group.id, title: "Launch", task: {} }),
            );
            expect(triaged.task).toEqual({
              threadId: triaged.thread.id,
              workspaceId,
              groupId: group.id,
              status: "triage",
              priority: "none",
              assignee: null,
              createdBy: { _tag: "Member", memberId: owner.memberId },
              createdAt: now,
            });
            expect(yield* bound.tasks.get(triaged.thread.id)).toEqual(Option.some(triaged.task));
            expect(yield* kinds(bound, triaged.thread.id)).toEqual([
              [1, "message.published"],
              [2, "task.created"],
            ]);
            expect(yield* participants(bound, triaged.thread.id)).toEqual([
              [`Member:${owner.memberId}`, 1],
              ["Triage", 2],
            ]);
            expect(yield* toldOf(bound, { _tag: "Triage" })).toEqual([
              { sequence: 2, state: "Pending" },
            ]);
            expect(yield* takeTurnJobs(workspaceId)).toEqual([]);
            // Assigned at creation, a task is to do, and its agent assignee is asked to work it.
            yield* TestClock.adjust("1 second");
            const assigned = yield* run(
              bound,
              owner,
              start({
                groupId: group.id,
                origin: triaged.thread.id,
                task: { assignee: agentId, priority: "high" },
              }),
            );
            expect(assigned.thread.origin).toBe(triaged.thread.id);
            expect(assigned.task).toMatchObject({
              status: "todo",
              priority: "high",
              assignee: agentId,
            });
            expect(yield* participants(bound, assigned.thread.id)).toEqual([
              [`Member:${owner.memberId}`, 1],
              [`Member:${agentId}`, 2],
            ]);
            expect(yield* told(bound, agentId)).toEqual([{ sequence: 2, state: "Pending" }]);
            expect(yield* takeTurnJobs(workspaceId)).toEqual([
              { kind: "run", memberId: agentId, threadId: assigned.thread.id },
            ]);
            // The timeline shows the task's creation with its initial values.
            const timeline = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.readTimeline(assigned.thread.id, { limit: 10 }),
              ),
            );
            expect(timeline[1]).toMatchObject({
              activity: {
                kind: "task.created",
                sequence: 2,
                details: {
                  status: "todo",
                  priority: "high",
                  assignee: agentId,
                  createdBy: { _tag: "Member", memberId: owner.memberId },
                },
              },
            });
            // A keyed start names the same thread and task on its retry.
            yield* TestClock.adjust("1 second");
            const key = Request.Key.make("task-1");
            const first = yield* run(
              bound,
              owner,
              start({ groupId: group.id, task: {} }, { requestKey: key }),
            );
            expect(
              yield* run(bound, owner, start({ groupId: group.id, task: {} }, { requestKey: key })),
            ).toEqual(first);
            // Lists carry each thread's task, and the group's tasks list by creation and status.
            const listed = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.listOpenings(group.id, { limit: 10 }),
              ),
            );
            expect(listed.map((item) => [item.thread.id, item.task?.status ?? null])).toEqual([
              [first.thread.id, "triage"],
              [assigned.thread.id, "todo"],
              [triaged.thread.id, "triage"],
            ]);
            const inTriage = yield* run(
              bound,
              owner,
              Effect.flatMap(TaskService.TaskService, (taskService) =>
                taskService.listInGroup(group.id, { status: "triage", limit: 1 }),
              ),
            );
            expect(inTriage.map((item) => item.thread.id)).toEqual([first.thread.id]);
            const [cursor] = inTriage;
            const next = yield* run(
              bound,
              owner,
              Effect.flatMap(TaskService.TaskService, (taskService) =>
                taskService.listInGroup(group.id, {
                  status: "triage",
                  before: { createdAt: cursor!.task!.createdAt, threadId: cursor!.thread.id },
                  limit: 5,
                }),
              ),
            );
            expect(next.map((item) => [item.thread.id, item.task?.status])).toEqual([
              [triaged.thread.id, "triage"],
            ]);
            // Starting a task needs task.create beside thread.start, and assigning an agent needs
            // agent use; work splits out of a thread its author can read.
            yield* grant(bound, humanId, ThreadPermissions.Start, groupTarget);
            expect(
              yield* Effect.flip(run(bound, human, start({ groupId: group.id, task: {} }))),
            ).toMatchObject({
              _tag: "Authorization.Denied",
              requirement: { permission: { name: TaskPermissions.Create.name } },
            });
            yield* grant(bound, humanId, TaskPermissions.Create, groupTarget);
            const hidden = yield* run(bound, owner, create([owner.memberId]));
            const secret = yield* run(bound, owner, start({ groupId: hidden.id }));
            const before = yield* history(bound);
            expect(
              yield* Effect.flip(
                run(bound, human, start({ groupId: group.id, task: { assignee: agentId } })),
              ),
            ).toMatchObject({
              _tag: "Authorization.Denied",
              requirement: { permission: { name: AgentPermissions.Use.name } },
            });
            expect(
              yield* Effect.flip(
                run(bound, human, start({ groupId: group.id, task: { assignee: otherId } })),
              ),
            ).toEqual(new ThreadService.ParticipantUnavailable({ memberId: otherId }));
            expect(
              yield* Effect.flip(
                run(bound, human, start({ groupId: group.id, origin: secret.thread.id })),
              ),
            ).toEqual(new ThreadService.NotFound({ threadId: secret.thread.id }));
            expect(yield* history(bound)).toEqual(before);
            expect(yield* Effect.flip(run(bound, human, taskOf(secret.thread.id)))).toEqual(
              new TaskService.NotFound({ threadId: secret.thread.id }),
            );
            expect(yield* Effect.flip(run(bound, owner, taskOf(secret.thread.id)))).toEqual(
              new TaskService.NotFound({ threadId: secret.thread.id }),
            );
          }),
        ),
      ),
  );

  it.effect(
    "a conversation becomes a task, and each change admits and tells by its kind, refusing a stale one",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group, human, other, agent } = yield* prepare();
            const started = yield* run(
              bound,
              owner,
              start({
                groupId: group.id,
                text: "Can someone own the launch?",
                mentions: [humanId],
              }),
            );
            const threadId = started.thread.id;
            expect(started.task).toBeNull();
            yield* takeTurnJobs(workspaceId);
            const humanTold = (yield* told(bound, humanId)).length;
            // The conversation's opening message becomes the description; the task awaits triage.
            yield* TestClock.adjust("1 second");
            const task = yield* run(bound, owner, createTask({ threadId }));
            expect(task).toMatchObject({ threadId, status: "triage", assignee: null });
            expect(yield* run(bound, owner, taskOf(threadId))).toEqual(task);
            expect(yield* Effect.flip(run(bound, owner, createTask({ threadId })))).toEqual(
              new TaskService.AlreadyTask({ threadId }),
            );
            expect(yield* Effect.flip(run(bound, other, createTask({ threadId })))).toEqual(
              new TaskService.NotFound({ threadId }),
            );
            expect(yield* Effect.flip(run(bound, human, createTask({ threadId })))).toMatchObject({
              _tag: "Authorization.Denied",
              requirement: { permission: { name: TaskPermissions.Create.name } },
            });
            expect(yield* participants(bound, threadId)).toEqual([
              [`Member:${owner.memberId}`, 1],
              [`Member:${humanId}`, 1],
              ["Triage", 2],
            ]);
            // Assigning admits the assignee and tells them; in triage, no work is asked yet.
            const assigned = yield* run(
              bound,
              owner,
              update(threadId, { _tag: "Assignee", from: null, to: agentId }),
            );
            expect(assigned).toMatchObject({ status: "triage", assignee: agentId });
            expect(yield* participants(bound, threadId)).toEqual([
              [`Member:${owner.memberId}`, 1],
              [`Member:${humanId}`, 1],
              ["Triage", 2],
              [`Member:${agentId}`, 3],
            ]);
            expect(yield* told(bound, agentId)).toEqual([{ sequence: 3, state: "Informational" }]);
            expect(yield* takeTurnJobs(workspaceId)).toEqual([]);
            // Work begins: every participant is told, and the assignee agent asked to work.
            yield* run(
              bound,
              owner,
              update(threadId, { _tag: "Status", from: "triage", to: "todo" }),
            );
            expect(yield* told(bound, agentId)).toEqual([
              { sequence: 3, state: "Informational" },
              { sequence: 4, state: "Pending" },
            ]);
            expect((yield* told(bound, humanId)).slice(humanTold)).toEqual([
              { sequence: 4, state: "Pending" },
            ]);
            expect(yield* takeTurnJobs(workspaceId)).toEqual([
              { kind: "run", memberId: agentId, threadId },
            ]);
            // The task's title and description are its requirements: changing either tells every
            // participant and asks the assignee anew.
            yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.rename({ threadId, title: "Own the launch", expectedTitle: null }),
              ),
            );
            yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
                threadMessageService.edit({
                  messageId: started.message.id,
                  text: "Own the launch, end to end.",
                  mentions: [humanId],
                  expectedRevision: 1,
                }),
              ),
            );
            expect((yield* told(bound, agentId)).slice(2)).toEqual([
              { sequence: 5, state: "Pending" },
              { sequence: 6, state: "Pending" },
            ]);
            expect((yield* told(bound, humanId)).slice(humanTold + 1)).toEqual([
              { sequence: 5, state: "Pending" },
              { sequence: 6, state: "Pending" },
            ]);
            expect(yield* told(bound, owner.memberId)).toEqual([]);
            expect(yield* takeTurnJobs(workspaceId)).toEqual([
              { kind: "run", memberId: agentId, threadId },
              { kind: "run", memberId: agentId, threadId },
            ]);
            // A priority informs everyone; a stale change is refused, and the same value again
            // records nothing.
            const before = yield* history(bound);
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  owner,
                  update(threadId, { _tag: "Status", from: "triage", to: "doing" }),
                ),
              ),
            ).toEqual(new TaskService.Changed({ threadId }));
            expect(
              yield* run(
                bound,
                owner,
                update(threadId, { _tag: "Status", from: "triage", to: "todo" }),
              ),
            ).toMatchObject({ status: "todo" });
            expect(yield* history(bound)).toEqual(before);
            yield* grant(bound, humanId, TaskPermissions.Update, {
              _tag: "Thread",
              workspaceId,
              threadId,
            });
            yield* run(
              bound,
              human,
              update(threadId, { _tag: "Priority", from: "none", to: "urgent" }),
            );
            expect((yield* told(bound, agentId)).slice(4)).toEqual([
              { sequence: 7, state: "Informational" },
            ]);
            expect(yield* told(bound, owner.memberId)).toEqual([{ sequence: 7, state: "Pending" }]);
            // Finishing informs everyone and asks no more work; the task's thread goes on.
            const done = yield* run(
              bound,
              owner,
              update(threadId, { _tag: "Status", from: "todo", to: "done" }),
            );
            expect(done).toMatchObject({ status: "done", priority: "urgent", assignee: agentId });
            expect(yield* bound.tasks.get(threadId)).toEqual(Option.some(done));
            expect((yield* told(bound, agentId)).slice(5)).toEqual([
              { sequence: 8, state: "Informational" },
            ]);
            expect(yield* kinds(bound, threadId)).toEqual([
              [1, "message.published"],
              [2, "task.created"],
              [3, "task.updated"],
              [4, "task.updated"],
              [5, "thread.renamed"],
              [6, "message.edited"],
              [7, "task.updated"],
              [8, "task.updated"],
            ]);
            const timeline = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.readTimeline(threadId, { limit: 10 }),
              ),
            );
            expect(timeline[7]).toMatchObject({
              activity: {
                kind: "task.updated",
                details: { _tag: "Status", from: "todo", to: "done" },
              },
            });
            // Changing needs task.update on the thread; agents change tasks as members do.
            expect(
              yield* Effect.flip(
                run(bound, agent, update(threadId, { _tag: "Status", from: "done", to: "doing" })),
              ),
            ).toMatchObject({
              _tag: "Authorization.Denied",
              requirement: { permission: { name: TaskPermissions.Update.name } },
            });
            yield* grant(bound, agentId, TaskPermissions.Update, {
              _tag: "Thread",
              workspaceId,
              threadId,
            });
            expect(
              yield* run(
                bound,
                agent,
                update(threadId, { _tag: "Status", from: "done", to: "doing" }),
              ),
            ).toMatchObject({ status: "doing" });
            // Its own change asks the agent nothing.
            expect((yield* told(bound, agentId)).length).toBe(6);
            expect(yield* takeTurnJobs(workspaceId)).toEqual([]);
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  other,
                  update(threadId, { _tag: "Priority", from: "urgent", to: "low" }),
                ),
              ),
            ).toEqual(new TaskService.NotFound({ threadId }));
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  owner,
                  update(threadId, { _tag: "Assignee", from: agentId, to: otherId }),
                ),
              ),
            ).toEqual(new TaskService.ParticipantUnavailable({ memberId: otherId }));
          }),
        ),
      ),
  );

  it.effect("the task store rejects foreign and second tasks, and a change to another value", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, group } = yield* prepare();
          const started = yield* run(bound, owner, start({ groupId: group.id, task: {} }));
          const task = started.task!;
          const foreign = yield* boundTo(otherWorkspaceId);
          for (const [store, write] of [
            [bound, bound.tasks.insert(Object.assign({}, task, { workspaceId: otherWorkspaceId }))],
            [bound, bound.tasks.insert(task)],
            [
              bound,
              bound.tasks.apply(task.threadId, { _tag: "Status", from: "todo", to: "doing" }),
            ],
            [
              bound,
              bound.tasks.apply(Thread.Id.make("missing"), {
                _tag: "Priority",
                from: "none",
                to: "low",
              }),
            ],
            [foreign, foreign.tasks.insert(task)],
          ] as const) {
            expect(yield* Effect.flip(store.store.transaction(write))).toMatchObject({
              _tag: "TaskStore.Conflict",
            });
          }
          expect(yield* bound.tasks.get(task.threadId)).toEqual(Option.some(task));
          expect(yield* foreign.tasks.get(task.threadId)).toEqual(Option.none());
          expect(yield* bound.tasks.getMany([task.threadId, Thread.Id.make("missing")])).toEqual([
            task,
          ]);
          yield* bound.store.transaction(
            bound.tasks.apply(task.threadId, {
              _tag: "Assignee",
              from: null,
              to: owner.memberId,
            }),
          );
          expect(yield* bound.tasks.get(task.threadId)).toEqual(
            Option.some(Object.assign({}, task, { assignee: owner.memberId })),
          );
        }),
      ),
    ),
  );
});
