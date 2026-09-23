import { describe, expect, it } from "@effect/vitest";
import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  RoleFacts,
  type Permission,
  type Target,
} from "@amends/core/authorization";
import { Group, GroupApplication, GroupMembershipApplication } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Event, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Member, MemberApplication, MemberFacts } from "@amends/core/workspace";
import { Notification, NotificationStore } from "@amends/core/notification";
import {
  Thread,
  ThreadApplication,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadActivityRecording,
  ThreadActivityStore,
  ThreadMessage,
  ThreadMessageApplication,
  ThreadMessageFacts,
  ThreadMessagePermissions,
  ThreadParticipation,
  ThreadParticipationAdmission,
  ThreadParticipationFacts,
  ThreadParticipationApplication,
  ThreadParticipationPermissions,
  ThreadParticipationStore,
  ThreadPermissions,
} from "@amends/core/thread";
import { Gateway } from "@amends/gateway";
import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Option } from "effect";
import { TestClock } from "effect/testing";
import { SqlClient } from "effect/unstable/sql";
import {
  setup,
  boundTo,
  initialized,
  inDatabase,
  core,
  host,
  type Bound,
  workspaceId,
  otherWorkspaceId,
  testProvenance,
} from "./support.ts";

/** Narrow a stored participation to its member participant for assertions. */
const memberParticipant = (record: ThreadParticipation.Record) => {
  if (record.participant._tag !== "Member") throw new Error("Expected a member participant");
  return record.participant;
};

const humanId = Member.Id.make("human");
const otherId = Member.Id.make("other");
const agentId = Member.Id.make("agent");
const identityFor = (id: Member.Id): Identity.MemberReference =>
  id === agentId
    ? { _tag: "Agent", id: Identity.AgentId.make("agent") }
    : { _tag: "Human", id: Identity.HumanId.make(id) };
const actorFor = (memberId: Member.Id) =>
  Actor.Value.make({ workspaceId, memberId, identity: identityFor(memberId) });
const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor.Value) =>
  effect.pipe(Effect.provideService(Actor.Service, actor));
const run = <A, E, R>(bound: Bound, actor: Actor.Value, effect: Effect.Effect<A, E, R>) =>
  asActor(effect, actor).pipe(Effect.provide(core(bound)));
const facts = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
    Effect.provide(core(bound)),
  );
const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 100 });
const notifications = (bound: Bound, id: Member.Id) =>
  bound.notifications.listByRecipient(identityFor(id), { limit: 100 });
const create = (memberIds: ReadonlyArray<Member.Id>) =>
  Effect.flatMap(GroupApplication.Service, (s) =>
    s.createPrivateTeam({ name: "Engineering", memberIds }),
  );
const start = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
  Effect.flatMap(ThreadApplication.Service, (s) =>
    s.startInGroup({ groupId, mentions, text: "Opening" }),
  );
const reply = (threadId: Thread.Id, mentions: ReadonlyArray<Member.Id> = [], text = "Reply") =>
  Effect.flatMap(ThreadMessageApplication.Service, (s) => s.publish({ threadId, mentions, text }));
const threadTarget = (threadId: Thread.Id): Target.Reference => ({
  _tag: "Thread",
  workspaceId,
  threadId,
});
const grant = (
  bound: Bound,
  memberId: Member.Id,
  permission: Permission.Definition,
  target?: Target.Reference,
) =>
  facts(
    bound,
    Effect.flatMap(Journal.Service, (j) =>
      j.publish(AssignmentFacts.Created, {
        workspaceId: bound.workspace.workspaceId,
        assignmentId: Assignment.Id.make(
          `${memberId}:${permission.name}:${JSON.stringify(target ?? "workspace")}`,
        ),
        memberId,
        source: {
          _tag: "Direct",
          grant: Grant.make(
            permission,
            target === undefined
              ? { _tag: "Workspace", workspaceId: bound.workspace.workspaceId }
              : { _tag: "Target", target },
          ),
        },
      }),
    ),
  );
const seed = (bound: Bound) =>
  facts(
    bound,
    Effect.flatMap(Journal.Service, (j) =>
      j.commit(
        Effect.gen(function* () {
          for (const memberId of [humanId, otherId, agentId])
            yield* j.publish(MemberFacts.Added, {
              workspaceId: bound.workspace.workspaceId,
              memberId,
              identity: identityFor(memberId),
            });
        }),
      ),
    ),
  );
const prepare = Effect.fnUntraced(function* () {
  const bound = yield* boundTo(workspaceId);
  const workspace = yield* initialized(bound);
  const owner = Actor.Value.make({
    workspaceId,
    memberId: workspace.ownerMemberId,
    identity: { _tag: "Human", id: workspace.createdBy },
  });
  yield* seed(bound);
  const group = yield* run(bound, owner, create([owner.memberId, humanId, agentId]));
  const first = yield* run(bound, owner, start(group.id, [agentId]));
  return { bound, owner, group, first, human: actorFor(humanId), agent: actorFor(agentId) };
});

const follow = (threadId: Thread.Id) =>
  Effect.flatMap(ThreadParticipationApplication.Service, (s) => s.follow(threadId));
const unfollow = (threadId: Thread.Id, participationId: ThreadParticipation.Id) =>
  Effect.flatMap(ThreadParticipationApplication.Service, (s) =>
    s.unfollow({ threadId, participationId }),
  );
const timeline = (threadId: Thread.Id, afterSequence = 0) =>
  Effect.flatMap(ThreadApplication.Service, (s) =>
    s.readTimeline(threadId, { limit: 100, afterSequence }),
  );
const snapshot = Effect.fnUntraced(function* (bound: Bound, threadId: Thread.Id) {
  return {
    history: yield* history(bound),
    participants: yield* bound.participations.listByThread(threadId),
    activities: yield* bound.activities.listByThread(threadId),
    human: yield* notifications(bound, humanId),
    agent: yield* notifications(bound, agentId),
    checkpoint: yield* bound.checkpoints.get({
      logId: Log.Id.make("journal"),
      name: "notifications",
      version: 1,
    }),
  };
});

const { available, withDatabase } = setup();
describe.runIf(available)("PostgreSQL thread participation", () => {
  it.effect(
    "following records a quiet timeline boundary and returns only a public summary; repeated follow is a no-op",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, first, human } = yield* prepare();
            yield* grant(
              bound,
              humanId,
              ThreadParticipationPermissions.Follow,
              threadTarget(first.thread.id),
            );
            const before = yield* snapshot(bound, first.thread.id);
            yield* TestClock.adjust("1 second");
            const result = yield* run(bound, human, follow(first.thread.id));
            expect(Object.keys(result).sort()).toEqual([
              "id",
              "joinedAt",
              "joinedAtSequence",
              "participant",
              "threadId",
              "workspaceId",
            ]);
            expect(Object.keys(result.participant).sort()).toEqual(["_tag", "memberId"]);
            expect(result).toMatchObject({
              participant: { _tag: "Member", memberId: humanId },
              threadId: first.thread.id,
              joinedAtSequence: 2,
              joinedAt: yield* DateTime.now,
            });
            const after = yield* snapshot(bound, first.thread.id);
            expect(after.history).toHaveLength(before.history.length + 1);
            expect(after.history.at(-1)?.entries).toHaveLength(2);
            expect(after.human).toEqual(before.human);
            expect(after.agent).toEqual(before.agent);
            expect(after.activities[1]).toMatchObject({
              kind: "ParticipationFollowed",
              participationId: result.id,
              sequence: 2,
            });
            expect(yield* run(bound, owner, timeline(first.thread.id, 1))).toEqual([
              { activity: after.activities[1], participant: result },
            ]);
            yield* TestClock.adjust("1 second");
            expect(yield* run(bound, human, follow(first.thread.id))).toEqual(result);
            expect(yield* snapshot(bound, first.thread.id)).toEqual(after);
            const replyResult = yield* run(bound, owner, reply(first.thread.id));
            expect(replyResult.activity.sequence).toBe(3);
            expect(yield* notifications(bound, humanId)).toHaveLength(1);
            expect((yield* notifications(bound, humanId))[0]?.participationId).toBe(result.id);
            const firstOwnerFollow = yield* run(bound, owner, follow(first.thread.id));
            expect(firstOwnerFollow.joinedAtSequence).toBe(1);
            expect(yield* bound.activities.listByThread(first.thread.id)).toHaveLength(3);
          }),
        ),
      ),
  );

  it.effect(
    "unfollowing keeps read access and human notification history while stopping broadcasts until a fresh rejoin",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, first, human } = yield* prepare();
            yield* grant(bound, humanId, ThreadParticipationPermissions.Follow);
            yield* grant(bound, humanId, ThreadPermissions.Read);
            const initial = yield* run(bound, human, follow(first.thread.id));
            yield* run(bound, owner, reply(first.thread.id));
            yield* TestClock.adjust("2 seconds");
            yield* run(bound, human, unfollow(first.thread.id, initial.id));
            expect(yield* bound.participations.get(initial.id)).toMatchObject({
              value: { status: "ended", endedAt: yield* DateTime.now },
            });
            const retained = yield* notifications(bound, humanId);
            expect(retained).toHaveLength(1);
            expect(retained[0]?.state._tag).toBe("Pending");
            yield* run(bound, owner, reply(first.thread.id));
            expect(yield* notifications(bound, humanId)).toEqual(retained);
            expect(yield* run(bound, human, timeline(first.thread.id))).toHaveLength(5);
            const returned = yield* run(bound, human, follow(first.thread.id));
            expect(returned.id).not.toBe(initial.id);
            expect(returned.joinedAtSequence).toBe(6);
            const oldRecord = Option.getOrThrow(yield* bound.participations.get(initial.id));
            const newRecord = Option.getOrThrow(yield* bound.participations.get(returned.id));
            expect(memberParticipant(newRecord).groupMembershipId).toBe(
              memberParticipant(oldRecord).groupMembershipId,
            );
            expect(
              yield* Effect.flip(run(bound, human, unfollow(first.thread.id, initial.id))),
            ).toEqual(
              new ThreadParticipationApplication.AlreadyEnded({
                threadId: first.thread.id,
                participationId: initial.id,
              }),
            );
            expect(yield* bound.participations.get(returned.id)).toMatchObject({
              value: { status: "active" },
            });
            expect((yield* run(bound, human, timeline(first.thread.id, 1)))[0]).toMatchObject({
              participant: initial,
            });
            yield* run(bound, owner, reply(first.thread.id));
            expect(yield* notifications(bound, humanId)).toHaveLength(2);
          }),
        ),
      ),
  );

  it.effect(
    "agent unfollow discards only that participation's pending input; following is not a work request",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, group, first, agent } = yield* prepare();
            const other = yield* run(bound, owner, start(group.id));
            const initial = (yield* bound.participations.listByThread(first.thread.id)).find(
              (p) => ThreadParticipation.memberOf(p.participant) === agentId,
            );
            if (initial === undefined) return yield* Effect.die("Missing agent");
            // Agent has no read, follow, publish, management, or agent-use grants.
            yield* run(bound, agent, unfollow(first.thread.id, initial.id));
            expect(
              (yield* notifications(bound, agentId))
                .filter((n) => n.participationId === initial.id)
                .every((n) => n.state._tag === "Discarded"),
            ).toBe(true);
            const pending = yield* bound.notifications.listPendingByRecipient(agent.identity, {
              limit: 100,
            });
            expect(pending).toHaveLength(1);
            expect(
              (yield* bound.participations.listByThread(other.thread.id)).some(
                (p) => p.id === pending[0]?.participationId,
              ),
            ).toBe(true);
            yield* grant(
              bound,
              agentId,
              ThreadParticipationPermissions.Follow,
              threadTarget(first.thread.id),
            );
            const returned = yield* run(bound, agent, follow(first.thread.id));
            expect(returned.id).not.toBe(initial.id);
            expect(
              yield* bound.notifications.listPendingByRecipient(agent.identity, { limit: 100 }),
            ).toEqual(pending);
            yield* run(bound, owner, reply(first.thread.id));
            expect(
              (yield* notifications(bound, agentId)).filter(
                (n) => n.participationId === returned.id,
              ),
            ).toHaveLength(1);
          }),
        ),
      ),
  );

  it.effect("replies and mentions can readmit an unfollowed member without a follow grant", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner, first, human } = yield* prepare();
          yield* run(bound, owner, reply(first.thread.id, [humanId]));
          const firstParticipation = (yield* bound.participations.listByThread(
            first.thread.id,
          )).find((p) => ThreadParticipation.memberOf(p.participant) === humanId);
          if (firstParticipation === undefined) return yield* Effect.die("Missing human");
          yield* run(bound, human, unfollow(first.thread.id, firstParticipation.id));
          yield* run(bound, owner, reply(first.thread.id));
          expect(yield* notifications(bound, humanId)).toHaveLength(1);
          const mentioned = yield* run(bound, owner, reply(first.thread.id, [humanId]));
          const rejoined = (yield* bound.participations.listByThread(first.thread.id)).find(
            (p) => ThreadParticipation.memberOf(p.participant) === humanId && p.status === "active",
          );
          if (rejoined === undefined) return yield* Effect.die("Missing readmission");
          expect(rejoined.id).not.toBe(firstParticipation.id);
          expect(rejoined.joinedAtSequence).toBe(mentioned.activity.sequence);
          yield* run(bound, human, unfollow(first.thread.id, rejoined.id));
          yield* grant(bound, humanId, ThreadMessagePermissions.Publish);
          const authored = yield* run(bound, human, reply(first.thread.id, [humanId]));
          expect(
            (yield* bound.participations.listByThread(first.thread.id)).find(
              (p) =>
                ThreadParticipation.memberOf(p.participant) === humanId && p.status === "active",
            )?.joinedAtSequence,
          ).toBe(authored.activity.sequence);
          expect(yield* notifications(bound, humanId)).toHaveLength(3);
        }),
      ),
    ),
  );

  it.effect(
    "follow grants are scoped and live; unfollow remains self-service after grants are revoked",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, group, first, human } = yield* prepare();
            const second = yield* run(bound, owner, start(group.id, [agentId]));
            yield* grant(bound, humanId, ThreadPermissions.Read);
            yield* grant(bound, humanId, ThreadMessagePermissions.Publish);
            expect(yield* Effect.flip(run(bound, human, follow(first.thread.id)))).toMatchObject({
              _tag: "Authorization.Denied",
            });
            const assignment = yield* grant(
              bound,
              humanId,
              ThreadParticipationPermissions.Follow,
              threadTarget(first.thread.id),
            );
            const service = yield* ThreadParticipationApplication.Service.pipe(
              Effect.provide(core(bound)),
            );
            const participant = yield* asActor(service.follow(first.thread.id), human);
            expect(
              yield* Effect.flip(asActor(service.follow(second.thread.id), human)),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) =>
                j.publish(AssignmentFacts.Revoked, {
                  workspaceId,
                  assignmentId: assignment.payload.assignmentId,
                }),
              ),
            );
            expect(
              yield* Effect.flip(asActor(service.follow(first.thread.id), human)),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            yield* asActor(
              service.unfollow({ threadId: first.thread.id, participationId: participant.id }),
              human,
            );
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) =>
                j.publish(AssignmentFacts.Created, {
                  workspaceId,
                  assignmentId: Assignment.Id.make("viewer"),
                  memberId: humanId,
                  source: {
                    _tag: "Role",
                    roleId: BuiltinRoles.ViewerId,
                    scope: { _tag: "Workspace", workspaceId },
                  },
                }),
              ),
            );
            yield* run(bound, human, follow(second.thread.id));
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) =>
                j.publish(RoleFacts.PermissionsChanged, {
                  workspaceId,
                  roleId: BuiltinRoles.ViewerId,
                  permissions: [],
                }),
              ),
            );
            expect(yield* Effect.flip(run(bound, human, follow(second.thread.id)))).toMatchObject({
              _tag: "Authorization.Denied",
            });
            const hidden = yield* run(bound, owner, create([otherId]));
            yield* grant(bound, otherId, ThreadPermissions.Start);
            const secret = yield* run(bound, actorFor(otherId), start(hidden.id));
            expect(yield* Effect.flip(run(bound, owner, follow(secret.thread.id)))).toEqual(
              new ThreadParticipationApplication.ThreadNotFound({ threadId: secret.thread.id }),
            );
          }),
        ),
      ),
  );

  it.effect(
    "unfollow cannot address another member, thread, workspace, or missing participation",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, group, first, human } = yield* prepare();
            const agentPart = (yield* bound.participations.listByThread(first.thread.id)).find(
              (p) => ThreadParticipation.memberOf(p.participant) === agentId,
            );
            if (agentPart === undefined) return yield* Effect.die("Missing agent");
            for (const actor of [human, owner])
              expect(
                yield* Effect.flip(run(bound, actor, unfollow(first.thread.id, agentPart.id))),
              ).toEqual(
                new ThreadParticipationApplication.NotFound({
                  threadId: first.thread.id,
                  participationId: agentPart.id,
                }),
              );
            yield* grant(bound, humanId, ThreadParticipationPermissions.Follow);
            const own = yield* run(bound, human, follow(first.thread.id));
            const second = yield* run(bound, owner, start(group.id));
            for (const [threadId, id] of [
              [second.thread.id, own.id],
              [first.thread.id, ThreadParticipation.Id.make("missing")],
            ] as const)
              expect(yield* Effect.flip(run(bound, human, unfollow(threadId, id)))).toEqual(
                new ThreadParticipationApplication.NotFound({ threadId, participationId: id }),
              );
            const foreign = yield* boundTo(otherWorkspaceId);
            const workspace = yield* initialized(foreign);
            const actor = Actor.Value.make({
              workspaceId: otherWorkspaceId,
              memberId: workspace.ownerMemberId,
              identity: { _tag: "Human", id: workspace.createdBy },
            });
            expect(yield* Effect.flip(run(foreign, actor, follow(first.thread.id)))).toMatchObject({
              _tag: "ThreadParticipationApplication.ThreadNotFound",
            });
            expect(
              yield* Effect.flip(
                run(bound, { ...human, identity: owner.identity }, follow(first.thread.id)),
              ),
            ).toMatchObject({ _tag: "Authorization.InvalidActor" });
            const record = Option.getOrThrow(yield* bound.participations.get(own.id));
            yield* run(
              bound,
              human,
              Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                s.leave({
                  groupId: group.id,
                  membershipId: memberParticipant(record).groupMembershipId,
                }),
              ),
            );
            expect(yield* Effect.flip(run(bound, human, follow(first.thread.id)))).toMatchObject({
              _tag: "ThreadParticipationApplication.ThreadNotFound",
            });
            expect(
              yield* Effect.flip(run(bound, human, unfollow(first.thread.id, own.id))),
            ).toMatchObject({ _tag: "ThreadParticipationApplication.ThreadNotFound" });
            yield* run(
              bound,
              owner,
              Effect.flatMap(MemberApplication.Service, (s) => s.remove(humanId)),
            );
            expect(yield* Effect.flip(run(bound, human, follow(first.thread.id)))).toMatchObject({
              _tag: "Authorization.InvalidActor",
            });
          }),
        ),
      ),
  );

  it.effect(
    "follow and unfollow roll back participation, timeline, input cleanup, and checkpoints together",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, first, human, agent } = yield* prepare();
            yield* grant(bound, humanId, ThreadParticipationPermissions.Follow);
            const before = yield* snapshot(bound, first.thread.id);
            const failingCheckpoint = Context.add(bound.context, Checkpoint.Service, {
              ...bound.checkpoints,
              set: (key, cursor) =>
                key.name === "notifications"
                  ? Effect.fail(
                      new Store.Failure({ operation: "checkpoint.set", cause: "injected" }),
                    )
                  : bound.checkpoints.set(key, cursor),
            });
            const failingActivity = Context.add(bound.context, ThreadActivityStore.Service, {
              ...bound.activities,
              insert: () =>
                Effect.fail(
                  new ThreadActivityStore.Failure({ operation: "insert", cause: "injected" }),
                ),
            });
            for (const context of [failingCheckpoint, failingActivity]) {
              expect(
                Exit.isFailure(
                  yield* Effect.exit(run({ ...bound, context }, human, follow(first.thread.id))),
                ),
              ).toBe(true);
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
            }
            const agentPart = before.participants.find(
              (p) => ThreadParticipation.memberOf(p.participant) === agentId,
            );
            if (agentPart === undefined) return yield* Effect.die("Missing agent");
            const failingCleanup = Context.add(bound.context, NotificationStore.Service, {
              ...bound.notifications,
              discardPendingForParticipation: () =>
                Effect.fail(
                  new NotificationStore.Failure({ operation: "discard", cause: "injected" }),
                ),
            });
            for (const context of [failingCheckpoint, failingCleanup]) {
              expect(
                Exit.isFailure(
                  yield* Effect.exit(
                    run({ ...bound, context }, agent, unfollow(first.thread.id, agentPart.id)),
                  ),
                ),
              ).toBe(true);
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
            }
            yield* run(bound, human, follow(first.thread.id));
            yield* run(bound, agent, unfollow(first.thread.id, agentPart.id));
          }),
        ),
      ),
  );

  it.effect(
    "outer commits observe follow, unfollow, and replies in order, and staged revocation fails atomically",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, first, human } = yield* prepare();
            const assignment = yield* grant(bound, humanId, ThreadParticipationPermissions.Follow);
            const before = yield* snapshot(bound, first.thread.id);
            const operation = Effect.flatMap(Journal.Service, (j) =>
              j.commit(
                Effect.gen(function* () {
                  const p = yield* asActor(follow(first.thread.id), human);
                  expect(p.joinedAtSequence).toBe(2);
                  expect((yield* reply(first.thread.id)).activity.sequence).toBe(3);
                  yield* asActor(unfollow(first.thread.id, p.id), human);
                  expect((yield* reply(first.thread.id)).activity.sequence).toBe(5);
                  const p2 = yield* asActor(follow(first.thread.id), human);
                  expect(p2.joinedAtSequence).toBe(6);
                  expect(yield* notifications(bound, humanId)).toHaveLength(1);
                  return yield* Effect.fail("rollback");
                }),
              ),
            );
            expect(yield* Effect.flip(run(bound, owner, operation))).toBe("rollback");
            expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
            const revoked = Effect.flatMap(Journal.Service, (j) =>
              j.commit(
                Effect.gen(function* () {
                  yield* j.publish(AssignmentFacts.Revoked, {
                    workspaceId,
                    assignmentId: assignment.payload.assignmentId,
                  });
                  yield* asActor(follow(first.thread.id), human);
                }).pipe(Publication.withActor),
              ),
            );
            expect(yield* Effect.flip(run(bound, owner, revoked))).toMatchObject({
              _tag: "Authorization.Denied",
            });
            expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
          }),
        ),
      ),
  );

  it.effect(
    "concurrent follows and publication produce ordered activity and one active participation",
    () =>
      withDatabase((location) =>
        Effect.gen(function* () {
          const saved = yield* inDatabase(
            location,
            Effect.gen(function* () {
              const p = yield* prepare();
              yield* grant(p.bound, humanId, ThreadParticipationPermissions.Follow);
              return p;
            }),
          );
          const gate = yield* Deferred.make<void>();
          const ready = [
            yield* Deferred.make<void>(),
            yield* Deferred.make<void>(),
            yield* Deferred.make<void>(),
          ];
          const fibers = yield* Effect.forEach(ready, (signal, index) =>
            inDatabase(
              location,
              Effect.gen(function* () {
                const bound = yield* boundTo(workspaceId);
                yield* Deferred.succeed(signal, undefined);
                yield* Deferred.await(gate);
                if (index === 2) yield* run(bound, saved.owner, reply(saved.first.thread.id));
                else yield* run(bound, saved.human, follow(saved.first.thread.id));
              }),
            ).pipe(Effect.exit, Effect.forkChild),
          );
          yield* Effect.forEach(ready, Deferred.await);
          yield* Deferred.succeed(gate, undefined);
          const results = yield* Effect.forEach(fibers, Fiber.join);
          expect(results.some(Exit.isSuccess)).toBe(true);
          for (const result of results)
            if (Exit.isFailure(result))
              expect(Cause.findErrorOption(result.cause)).toMatchObject({
                value: { _tag: "JournalStore.Conflict" },
              });
          yield* inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const active = yield* run(bound, saved.human, follow(saved.first.thread.id));
              const rows = yield* bound.activities.listByThread(saved.first.thread.id);
              expect(rows.map((r) => r.sequence)).toEqual(rows.map((_, i) => i + 1));
              expect(rows.filter((r) => r.kind === "ParticipationFollowed")).toHaveLength(1);
              expect(
                (yield* bound.participations.listByThread(saved.first.thread.id)).filter(
                  (p) => ThreadParticipation.memberOf(p.participant) === humanId,
                ),
              ).toHaveLength(1);
              for (const n of yield* notifications(bound, humanId))
                expect(n.participationId).toBe(active.id);
            }),
          );
        }),
      ),
  );

  it.effect(
    "concurrent unfollow and broadcast cannot leave pending input for an ended agent participation",
    () =>
      withDatabase((location) =>
        Effect.gen(function* () {
          const saved = yield* inDatabase(
            location,
            Effect.gen(function* () {
              const p = yield* prepare();
              const part = (yield* p.bound.participations.listByThread(p.first.thread.id)).find(
                (r) => ThreadParticipation.memberOf(r.participant) === agentId,
              );
              if (!part) return yield* Effect.die("Missing agent");
              return { ...p, part };
            }),
          );
          const gate = yield* Deferred.make<void>();
          const ready = [yield* Deferred.make<void>(), yield* Deferred.make<void>()];
          const fibers = yield* Effect.forEach(ready, (signal, index) =>
            inDatabase(
              location,
              Effect.gen(function* () {
                const bound = yield* boundTo(workspaceId);
                yield* Deferred.succeed(signal, undefined);
                yield* Deferred.await(gate);
                if (index === 0)
                  yield* run(bound, saved.agent, unfollow(saved.first.thread.id, saved.part.id));
                else yield* run(bound, saved.owner, reply(saved.first.thread.id));
              }),
            ).pipe(Effect.exit, Effect.forkChild),
          );
          yield* Effect.forEach(ready, Deferred.await);
          yield* Deferred.succeed(gate, undefined);
          const results = yield* Effect.forEach(fibers, Fiber.join);
          for (const result of results)
            if (Exit.isFailure(result))
              expect(Cause.findErrorOption(result.cause)).toMatchObject({
                value: { _tag: "JournalStore.Conflict" },
              });
          yield* inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              if (
                Option.getOrThrow(yield* bound.participations.get(saved.part.id)).status ===
                "active"
              )
                yield* run(bound, saved.agent, unfollow(saved.first.thread.id, saved.part.id));
              expect(
                yield* bound.notifications.listPendingByRecipient(saved.agent.identity, {
                  limit: 100,
                }),
              ).toEqual([]);
              expect(yield* bound.participations.get(saved.part.id)).toMatchObject({
                value: { status: "ended" },
              });
            }),
          );
        }),
      ),
  );

  it.effect(
    "reopening and replay preserve quiet boundaries, repeated rejoining, and ended input after permissions change",
    () =>
      withDatabase((location) =>
        Effect.gen(function* () {
          const saved = yield* inDatabase(
            location,
            Effect.gen(function* () {
              const { bound, owner, first, agent } = yield* prepare();
              const old = (yield* bound.participations.listByThread(first.thread.id)).find(
                (p) => ThreadParticipation.memberOf(p.participant) === agentId,
              );
              if (!old) return yield* Effect.die("Missing agent");
              yield* run(bound, agent, unfollow(first.thread.id, old.id));
              yield* grant(bound, agentId, ThreadParticipationPermissions.Follow);
              const next = yield* run(bound, agent, follow(first.thread.id));
              yield* run(bound, owner, reply(first.thread.id));
              yield* run(bound, agent, unfollow(first.thread.id, next.id));
              yield* run(bound, agent, follow(first.thread.id));
              yield* run(
                bound,
                owner,
                Effect.flatMap(MemberApplication.Service, (s) => s.remove(agentId)),
              );
              yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) =>
                  j.publish(RoleFacts.PermissionsChanged, {
                    workspaceId,
                    roleId: BuiltinRoles.OwnerId,
                    permissions: [],
                  }),
                ),
              );
              return {
                threadId: first.thread.id,
                snapshot: yield* snapshot(bound, first.thread.id),
              };
            }),
          );
          yield* inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              expect(yield* snapshot(bound, saved.threadId)).toEqual(saved.snapshot);
              const sql = yield* SqlClient.SqlClient;
              yield* bound.store.transaction(
                Effect.gen(function* () {
                  for (const table of [
                    "notifications",
                    "thread_activities",
                    "thread_messages",
                    "thread_participations",
                    "threads",
                  ])
                    yield* sql.unsafe(`DELETE FROM ${table}`);
                  yield* sql.unsafe(
                    "DELETE FROM checkpoints WHERE name IN ('threads','thread.participation','thread.message','thread.activity','notifications')",
                  );
                }),
              );
              yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) => j.replay),
              );
              expect(yield* snapshot(bound, saved.threadId)).toEqual(saved.snapshot);
            }),
          );
        }),
      ),
  );

  it.effect("gateway returns public participation summaries and opaque self-service errors", () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const gateway = yield* Gateway.Service;
        const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("owner"), {
          name: "Workspace",
        });
        const bound = yield* boundTo(workspace.id);
        yield* seed(bound);
        const owner = { _tag: "Human" as const, id: workspace.createdBy };
        const group = yield* gateway.asMember(
          workspace.id,
          owner,
          create([workspace.ownerMemberId, humanId]),
        );
        const first = yield* gateway.asMember(workspace.id, owner, start(group.id));
        const result = yield* gateway.asMember(workspace.id, owner, follow(first.thread.id));
        expect(Object.keys(result).sort()).toEqual([
          "id",
          "joinedAt",
          "joinedAtSequence",
          "participant",
          "threadId",
          "workspaceId",
        ]);
        expect(Object.keys(result.participant).sort()).toEqual(["_tag", "memberId"]);
        yield* gateway.asMember(workspace.id, owner, unfollow(first.thread.id, result.id));
        expect(
          yield* Effect.flip(
            gateway.asMember(workspace.id, owner, unfollow(first.thread.id, result.id)),
          ),
        ).toMatchObject({ _tag: "ThreadParticipationApplication.AlreadyEnded" });
        expect(
          yield* Effect.flip(
            gateway.asMember(workspace.id, owner, follow(Thread.Id.make("missing"))),
          ),
        ).toMatchObject({ _tag: "ThreadParticipationApplication.ThreadNotFound" });
        expect(
          yield* Effect.flip(gateway.asMember(workspace.id, owner, follow("" as Thread.Id))),
        ).toMatchObject({ _tag: "Gateway.InvalidInput" });
        expect(
          yield* Effect.flip(
            gateway.asMember(
              workspace.id,
              owner,
              unfollow(first.thread.id, ThreadParticipation.Id.make("missing")),
            ),
          ),
        ).toMatchObject({ _tag: "ThreadParticipationApplication.NotFound" });
      }).pipe(Effect.provide(host(location))),
    ),
  );

  it.effect("stores and readers reject mismatched follow references and stale departures", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner, first, human } = yield* prepare();
          yield* grant(bound, humanId, ThreadParticipationPermissions.Follow);
          const before = yield* snapshot(bound, first.thread.id);
          for (const latest of [
            { ...first.activity, threadId: Thread.Id.make("foreign") },
            { ...first.activity, sequence: Number.MAX_SAFE_INTEGER },
          ]) {
            const context = Context.add(bound.context, ThreadActivityStore.Service, {
              ...bound.activities,
              latest: () => Effect.succeedSome(latest),
            });
            expect(
              yield* Effect.flip(run({ ...bound, context }, human, follow(first.thread.id))),
            ).toMatchObject({ _tag: "ThreadActivityRecording.InvalidReference" });
            expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
          }
          const participant = yield* run(bound, human, follow(first.thread.id));
          const activity = Option.getOrThrow(yield* bound.activities.latest(first.thread.id));
          if (activity.kind !== "ParticipationFollowed")
            return yield* Effect.die("Missing follow activity");
          for (const bad of [
            { ...activity, id: ThreadActivity.Id.make("bad-follow"), sequence: 3 },
            {
              ...activity,
              id: ThreadActivity.Id.make("bad-follow"),
              participationId: ThreadParticipation.Id.make("missing"),
              sequence: 3,
            },
          ])
            expect(
              yield* Effect.flip(bound.store.transaction(bound.activities.insert(bad))),
            ).toMatchObject({ _tag: "ThreadActivityStore.Conflict" });
          const departure = {
            workspaceId,
            threadId: first.thread.id,
            participationId: participant.id,
          };
          for (const bad of [
            { ...departure, workspaceId: otherWorkspaceId },
            { ...departure, participationId: ThreadParticipation.Id.make("missing") },
            { ...departure, threadId: Thread.Id.make("foreign") },
          ])
            expect(
              yield* Effect.flip(
                bound.store.transaction(bound.participations.end(bad, yield* DateTime.now)),
              ),
            ).toMatchObject({ _tag: "ThreadParticipationStore.Conflict" });
          const context = Context.add(bound.context, ThreadParticipationStore.Service, {
            ...bound.participations,
            get: () => Effect.succeedNone,
            getMany: () => Effect.succeed([]),
          });
          expect(
            yield* Effect.flip(run({ ...bound, context }, owner, timeline(first.thread.id))),
          ).toMatchObject({ _tag: "ThreadApplication.InvalidResponse" });
          yield* run(bound, human, unfollow(first.thread.id, participant.id));
          expect(
            yield* Effect.flip(
              bound.store.transaction(bound.participations.end(departure, yield* DateTime.now)),
            ),
          ).toMatchObject({ _tag: "ThreadParticipationStore.Conflict" });
        }),
      ),
    ),
  );

  it.effect(
    "one activity notification handler supports message, follow, and ending recipients and replays their selection",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, first } = yield* prepare();
            const ownerPart = (yield* bound.participations.listByThread(first.thread.id)).find(
              (p) => ThreadParticipation.memberOf(p.participant) === owner.memberId,
            );
            if (!ownerPart) return yield* Effect.die("Missing owner participation");
            const recorded = yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    const recorder = yield* ThreadActivityRecording.make();
                    const admissions = yield* ThreadParticipationAdmission.make();
                    const occurredAt = yield* DateTime.now;
                    const sequence = yield* recorder.nextSequence(first.thread.id);
                    const admitted = yield* admissions.ensure(
                      first.thread,
                      [{ _tag: "Member", memberId: humanId }],
                      sequence,
                      occurredAt,
                    );
                    const participant = admitted.participants[0];
                    if (!participant) return yield* Effect.die("Missing fixture participant");
                    const recipients = [
                      {
                        participationId: ownerPart.id,
                        recipient: ThreadParticipation.recipientOf(ownerPart.participant),
                      },
                    ];
                    // Deliberately address non-message activity to exercise the generic generator.
                    // Production follow/unfollow workflows select an empty recipient list.
                    const followed = yield* recorder.record({
                      threadId: first.thread.id,
                      sequence,
                      occurredAt,
                      subject: { kind: "ParticipationFollowed", participationId: participant.id },
                      recipients,
                    });
                    const ended = yield* journal
                      .publish(ThreadParticipationFacts.Ended, {
                        workspaceId,
                        threadId: first.thread.id,
                        participationId: participant.id,
                        reason: "unfollowed",
                      })
                      .pipe(Publication.withOccurredAt(occurredAt));
                    const departure = yield* recorder
                      .record({
                        threadId: first.thread.id,
                        sequence: yield* recorder.nextSequence(first.thread.id),
                        occurredAt,
                        subject: {
                          kind: "ParticipationEnded",
                          participationId: participant.id,
                          reason: "unfollowed",
                        },
                        recipients,
                      })
                      .pipe(Publication.withCause(ended, occurredAt));
                    return [followed, departure];
                  }),
                ),
              ),
            );
            const selected = yield* bound.notifications.listByRecipient(owner.identity, {
              limit: 100,
            });
            expect(selected).toHaveLength(2);
            expect(selected.map((n) => n.source.entryId).sort()).toEqual(
              recorded.map((e) => e.id).sort(),
            );
            for (const notification of selected)
              expect(notification).toMatchObject({
                participationId: ownerPart.id,
                state: { _tag: "Pending" },
              });
            expect(yield* notifications(bound, agentId)).toHaveLength(1);
            yield* run(
              bound,
              owner,
              Effect.flatMap(MemberApplication.Service, (s) => s.remove(humanId)),
            );
            const sql = yield* SqlClient.SqlClient;
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* sql.unsafe("DELETE FROM notifications");
                yield* sql.unsafe("DELETE FROM checkpoints WHERE name = 'notifications'");
              }),
            );
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) => j.replay),
            );
            expect(
              yield* bound.notifications.listByRecipient(owner.identity, { limit: 100 }),
            ).toEqual(selected);
            expect(yield* notifications(bound, agentId)).toHaveLength(1);
          }),
        ),
      ),
  );

  it.effect(
    "group and workspace departures record one ending per active participation and roll back a partial cascade",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, group, first, agent } = yield* prepare();
            const second = yield* run(bound, owner, start(group.id));
            const otherGroup = yield* run(bound, owner, create([owner.memberId, agentId]));
            const third = yield* run(bound, owner, start(otherGroup.id));
            const threads = [first.thread.id, second.thread.id, third.thread.id];
            const before = yield* Effect.forEach(threads, (id) => snapshot(bound, id));
            let endings = 0;
            const context = Context.add(bound.context, ThreadActivityStore.Service, {
              ...bound.activities,
              insert: (activity) =>
                activity.kind === "ParticipationEnded" && ++endings === 2
                  ? Effect.fail(
                      new ThreadActivityStore.Failure({
                        operation: "insert",
                        cause: "second ending failed",
                      }),
                    )
                  : bound.activities.insert(activity),
            });
            expect(
              Exit.isFailure(
                yield* Effect.exit(
                  run(
                    { ...bound, context },
                    owner,
                    Effect.flatMap(MemberApplication.Service, (s) => s.remove(agentId)),
                  ),
                ),
              ),
            ).toBe(true);
            expect(yield* Effect.forEach(threads, (id) => snapshot(bound, id))).toEqual(before);
            expect(yield* bound.members.get(agentId)).toMatchObject({
              value: { status: "active" },
            });
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(group.id, agentId),
            );
            yield* run(
              bound,
              owner,
              Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                s.remove({ groupId: group.id, membershipId: admission.id }),
              ),
            );
            const otherAdmission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(otherGroup.id, agentId),
            );
            yield* run(
              bound,
              agent,
              Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                s.leave({ groupId: otherGroup.id, membershipId: otherAdmission.id }),
              ),
            );
            for (const [index, threadId] of threads.entries()) {
              const activities = yield* bound.activities.listByThread(threadId);
              expect(activities).toHaveLength(2);
              expect(activities[1]).toMatchObject({
                kind: "ParticipationEnded",
                sequence: 2,
                reason: index < 2 ? "group-removed" : "group-left",
              });
              expect(yield* run(bound, owner, timeline(threadId))).toHaveLength(2);
            }
            yield* run(
              bound,
              owner,
              Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                s.add({ groupId: group.id, memberId: agentId }),
              ),
            );
            yield* run(bound, owner, reply(first.thread.id, [agentId]));
            yield* run(
              bound,
              owner,
              Effect.flatMap(MemberApplication.Service, (s) => s.remove(agentId)),
            );
            const final = yield* bound.activities.listByThread(first.thread.id);
            expect(final.map((a) => a.kind)).toEqual([
              "MessagePublished",
              "ParticipationEnded",
              "MessagePublished",
              "ParticipationEnded",
            ]);
            expect(final[3]).toMatchObject({ reason: "workspace-removed", sequence: 4 });
            expect(
              yield* bound.notifications.listPendingByRecipient(agent.identity, { limit: 100 }),
            ).toEqual([]);
            const events = yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) =>
                j
                  .read({ name: ThreadActivityFacts.Recorded.name, limit: 100 })
                  .pipe(
                    Effect.flatMap((rows) =>
                      Effect.forEach(rows, (r) => Event.decode(ThreadActivityFacts.Recorded, r)),
                    ),
                  ),
              ),
            );
            expect(events).toHaveLength(8);
            for (const event of events.filter(
              (e) => e.payload.activity.kind === "ParticipationEnded",
            )) {
              expect(event.payload.recipients).toEqual([]);
              expect(event.provenance.causedBy).not.toBeNull();
            }
          }),
        ),
      ),
  );

  it.effect(
    "ending activity settles pending input with no recipients; the preceding domain fact does not",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, first, agent } = yield* prepare();
            const participant = (yield* bound.participations.listByThread(first.thread.id)).find(
              (p) => ThreadParticipation.memberOf(p.participant) === agentId,
            );
            if (participant === undefined) return yield* Effect.die("Missing agent participation");
            const pending = yield* bound.notifications.listPendingByRecipient(agent.identity, {
              limit: 100,
            });
            expect(pending).toHaveLength(1);
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    const recorder = yield* ThreadActivityRecording.make();
                    const occurredAt = yield* DateTime.now;
                    const ended = yield* journal
                      .publish(ThreadParticipationFacts.Ended, {
                        workspaceId,
                        threadId: first.thread.id,
                        participationId: participant.id,
                        reason: "unfollowed",
                      })
                      .pipe(Publication.withOccurredAt(occurredAt));
                    expect(yield* bound.participations.get(participant.id)).toMatchObject({
                      value: { status: "ended" },
                    });
                    expect(
                      yield* bound.notifications.listPendingByRecipient(agent.identity, {
                        limit: 100,
                      }),
                    ).toEqual(pending);
                    yield* recorder
                      .record({
                        threadId: first.thread.id,
                        sequence: yield* recorder.nextSequence(first.thread.id),
                        occurredAt,
                        subject: {
                          kind: "ParticipationEnded",
                          participationId: participant.id,
                          reason: "unfollowed",
                        },
                        recipients: [],
                      })
                      .pipe(Publication.withCause(ended, occurredAt));
                    expect(
                      yield* bound.notifications.listPendingByRecipient(agent.identity, {
                        limit: 100,
                      }),
                    ).toEqual([]);
                  }),
                ),
              ),
            );
            const settled = yield* notifications(bound, agentId);
            expect(settled).toHaveLength(1);
            expect(settled[0]).toMatchObject({
              id: pending[0]?.id,
              source: pending[0]?.source,
              participationId: participant.id,
              state: { _tag: "Discarded", reason: "participation-ended" },
            });
            const sql = yield* SqlClient.SqlClient;
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* sql.unsafe("DELETE FROM notifications");
                yield* sql.unsafe("DELETE FROM checkpoints WHERE name = 'notifications'");
              }),
            );
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (j) => j.replay),
            );
            expect(yield* notifications(bound, agentId)).toEqual(settled);
          }),
        ),
      ),
  );
  it.effect(
    "contacts and triage participate without group admission, author messages, and receive notifications",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, first } = yield* prepare();
            const threadId = first.thread.id;
            const at = first.message.publishedAt;
            const contactId = Identity.ContactId.make("customer");
            const contact = {
              id: ThreadParticipation.Id.make("contact-participation"),
              workspaceId,
              threadId,
              participant: { _tag: "Contact", contactId },
              joinedAt: at,
              joinedAtSequence: 2,
              status: "active",
              endedAt: null,
            } satisfies ThreadParticipation.Record;
            const triage = {
              ...contact,
              id: ThreadParticipation.Id.make("triage-participation"),
              participant: { _tag: "Triage" },
            } satisfies ThreadParticipation.Record;
            const message = {
              id: ThreadMessage.Id.make("contact-message"),
              workspaceId,
              threadId,
              author: { _tag: "Contact", contactId },
              kind: "User",
              text: "Hello from outside",
              mentions: [],
              publishedAt: at,
            } satisfies ThreadMessage.Record;
            yield* facts(
              bound,
              Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    yield* journal.publish(ThreadParticipationFacts.Added, contact);
                    yield* journal.publish(ThreadParticipationFacts.Added, triage);
                    yield* journal.publish(ThreadMessageFacts.Published, message);
                    yield* journal.publish(ThreadActivityFacts.Recorded, {
                      activity: {
                        id: ThreadActivity.Id.make("contact-activity"),
                        workspaceId,
                        threadId,
                        sequence: 2,
                        kind: "MessagePublished",
                        messageId: message.id,
                        occurredAt: at,
                      },
                      recipients: [
                        {
                          participationId: contact.id,
                          recipient: { _tag: "Contact", id: contactId },
                        },
                        { participationId: triage.id, recipient: { _tag: "Triage" } },
                      ],
                    });
                  }),
                ),
              ),
            );
            expect(yield* bound.participations.get(contact.id)).toEqual(Option.some(contact));
            expect(yield* bound.participations.get(triage.id)).toEqual(Option.some(triage));
            expect(yield* bound.messages.get(message.id)).toEqual(Option.some(message));
            const participants = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadApplication.Service, (s) => s.listParticipants(threadId)),
            );
            expect(
              participants.map((p) => p.participant).filter((p) => p._tag !== "Member"),
            ).toEqual(
              [{ _tag: "Contact", contactId }, { _tag: "Triage" }].sort((left, right) =>
                left._tag < right._tag ? -1 : 1,
              ),
            );
            for (const recipient of [
              { _tag: "Contact", id: contactId },
              { _tag: "Triage" },
            ] satisfies ReadonlyArray<Notification.Recipient>)
              expect(
                (yield* bound.notifications.listByRecipient(recipient, { limit: 10 })).map(
                  (note) => [note.participationId, note.state._tag],
                ),
              ).toEqual([[recipient._tag === "Triage" ? triage.id : contact.id, "Pending"]]);
            // One active participation per contact and per thread's triage; references are enforced.
            for (const invalid of [
              { ...contact, id: ThreadParticipation.Id.make("contact-again") },
              { ...triage, id: ThreadParticipation.Id.make("triage-again") },
              {
                ...contact,
                id: ThreadParticipation.Id.make("elsewhere"),
                threadId: Thread.Id.make("missing"),
              },
            ])
              expect(
                yield* Effect.flip(bound.store.transaction(bound.participations.insert(invalid))),
              ).toMatchObject({ _tag: "ThreadParticipationStore.Conflict" });
            expect(
              yield* Effect.flip(
                bound.store.transaction(
                  bound.messages.insert({
                    ...message,
                    id: ThreadMessage.Id.make("stranger-message"),
                    author: { _tag: "Contact", contactId: Identity.ContactId.make("stranger") },
                  }),
                ),
              ),
            ).toMatchObject({ _tag: "ThreadMessageStore.Conflict" });
          }),
        ),
      ),
  );
});
