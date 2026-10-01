import { describe, expect, expectTypeOf, it } from "@effect/vitest";

import type * as Core from "@amends/core";
import { AgentPermissions } from "@amends/core/agent";

import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  RoleFacts,
  type Permission,
  type Target,
} from "@amends/core/authorization";

import {
  Group,
  GroupApplication,
  GroupMembershipApplication,
  GroupMembershipDeparture,
  GroupMembershipFacts,
} from "@amends/core/group";

import { Actor, Identity } from "@amends/core/identity";

import { Event, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Member, MemberApplication, MemberFacts } from "@amends/core/workspace";

import { Notification, NotificationStore } from "@amends/core/notification";

import {
  Thread,
  ThreadApplication,
  ThreadAccess,
  ThreadActivityFacts,
  ThreadActivityPublisher,
  ThreadActivityRecording,
  ThreadParticipationDeparture,
  ThreadActivityStore,
  ThreadMessage,
  ThreadMessageApplication,
  ThreadMessagePermissions,
  ThreadMessagePublication,
  ThreadMessageStore,
  ThreadParticipation,
  ThreadParticipationAdmission,
  ThreadPermissions,
} from "@amends/core/thread";

import { Gateway } from "@amends/gateway";

import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Layer, Option } from "effect";

import { TestClock } from "effect/testing";

import {
  type Bound,
  boundTo,
  failingLate,
  journalLog,
  otherWorkspaceId,
  placed,
  publishedMessage,
  runHost,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";

import type { Harness } from "./harness.ts";

/** Replies: admission, recipients, concurrent sequencing, rollback, and replay. */

export const threadReplies = (harness: Harness) => {
  const { core, initialized, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: thread replies`, () => {
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
        Effect.provideService(Publication.Service, testProvenance(bound.store.workspaceId)),
        Effect.provide(core(bound)),
      );
    const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 100 });
    const notifications = (bound: Bound, id: Member.Id) =>
      bound.notifications.listByRecipient(Notification.ofMember(id, identityFor(id)), {
        limit: 100,
      });
    const create = (memberIds: ReadonlyArray<Member.Id>) =>
      Effect.flatMap(GroupApplication.Service, (s) =>
        s.createTeam({ name: "Engineering", memberIds }),
      );
    const opening = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
      Effect.flatMap(ThreadApplication.Service, (s) =>
        s.startInGroup({ groupId, mentions, text: "Opening" }),
      );
    const answer = (threadId: Thread.Id, mentions: ReadonlyArray<Member.Id> = [], text = "Reply") =>
      Effect.flatMap(ThreadMessageApplication.Service, (s) =>
        s.publish({ threadId, mentions, text }),
      );
    /** A start or reply, with the activity that placed its message, for position assertions. */
    const start = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
      Effect.flatMap(opening(groupId, mentions), placed);
    const reply = (threadId: Thread.Id, mentions: ReadonlyArray<Member.Id> = [], text = "Reply") =>
      Effect.flatMap(answer(threadId, mentions, text), (message) => placed({ message }));
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
            workspaceId: bound.store.workspaceId,
            assignmentId: Assignment.Id.make(
              `${memberId}:${permission.name}:${JSON.stringify(target ?? "workspace")}`,
            ),
            memberId,
            source: {
              _tag: "Direct",
              grant: Grant.make(
                permission,
                target === undefined
                  ? { _tag: "Workspace", workspaceId: bound.store.workspaceId }
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
                  workspaceId: bound.store.workspaceId,
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
    /** A thread's messages in ID order, found through its activities: each message has one. */
    const messages = Effect.fnUntraced(function* (bound: Bound, threadId: Thread.Id) {
      const ids = (yield* bound.activities.listByThread(threadId))
        .flatMap((activity) => publishedMessage(activity) ?? [])
        .toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0));
      return yield* Effect.forEach(ids, (id) => bound.messages.get(id));
    });
    const snapshot = Effect.fnUntraced(function* (bound: Bound, threadId: Thread.Id) {
      return {
        history: yield* history(bound),
        messages: yield* messages(bound, threadId),
        activities: yield* bound.activities.listByThread(threadId),
        participants: yield* bound.participations.listByThread(threadId),
        human: yield* notifications(bound, humanId),
        agent: yield* notifications(bound, agentId),
        live: yield* bound.checkpoints.listLive(journalLog),
      };
    });

    it.effect(
      "a human reply joins its author and broadcasts only to current thread participants",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              expectTypeOf<
                Extract<
                  Core.Operations,
                  | ThreadAccess.Service
                  | ThreadParticipationAdmission.Service
                  | ThreadMessagePublication.Service
                  | ThreadActivityRecording.Service
                  | ThreadParticipationDeparture.Service
                  | GroupMembershipDeparture.Service
                >
              >().toEqualTypeOf<never>();
              const { bound, owner, group, first, human } = yield* prepare();
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.add({ groupId: group.id, memberId: otherId }),
                ),
              );
              yield* grant(
                bound,
                humanId,
                ThreadMessagePermissions.Publish,
                threadTarget(first.thread.id),
              );
              yield* grant(bound, humanId, AgentPermissions.Use, {
                _tag: "Member",
                workspaceId,
                memberId: agentId,
              });
              const before = yield* history(bound);
              yield* TestClock.adjust("1 second");
              const result = yield* run(
                bound,
                human,
                reply(first.thread.id, [], "  Reply\nverbatim  "),
              );
              expect(yield* bound.messages.get(result.message.id)).toEqual(
                Option.some(result.message),
              );
              expect(result.message).toMatchObject({
                author: { _tag: "Member", memberId: humanId },
                text: "  Reply\nverbatim  ",
                mentions: [],
                publishedAt: yield* DateTime.now,
              });
              expect(result.activity).toMatchObject({
                threadId: first.thread.id,
                details: { messageId: result.message.id },
                sequence: 2,
              });
              const participants = yield* bound.participations.listByThread(first.thread.id);
              expect(
                participants
                  .flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? [])
                  .sort(),
              ).toEqual([owner.memberId, humanId, agentId].sort());
              const introduced = participants.find(
                (p) => ThreadParticipation.memberOf(p.participant) === humanId,
              );
              expect(introduced).toMatchObject({
                joinedAtSequence: 2,
                joinedAt: result.message.publishedAt,
                status: "active",
              });
              // A message never notifies its author.
              expect(yield* notifications(bound, humanId)).toEqual([]);
              expect(yield* notifications(bound, agentId)).toHaveLength(2);
              expect(yield* notifications(bound, otherId)).toEqual([]);
              expect(
                yield* bound.notifications.listByRecipient(
                  Notification.ofMember(owner.memberId, owner.identity),
                  { limit: 100 },
                ),
              ).toHaveLength(1);
              expect(yield* history(bound)).toHaveLength(before.length + 1);
              const again = yield* run(bound, human, reply(first.thread.id));
              expect(again.activity.sequence).toBe(3);
              expect(yield* bound.participations.listByThread(first.thread.id)).toEqual(
                participants,
              );
              const page = yield* run(
                bound,
                owner,
                Effect.flatMap(ThreadApplication.Service, (s) =>
                  s.readTimeline(first.thread.id, { afterSequence: 1, limit: 1 }),
                ),
              );
              expect(page).toEqual([result]);
              expect(yield* bound.activities.latest(first.thread.id)).toEqual(
                Option.some(again.activity),
              );
              expect(
                yield* (yield* boundTo(otherWorkspaceId)).activities.latest(first.thread.id),
              ).toEqual(Option.none());
              const entries = (yield* history(bound)).at(-1)?.entries ?? [];
              expect(entries).toHaveLength(2);
              const events = yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) =>
                  j
                    .read({ name: ThreadActivityFacts.Recorded.name, limit: 100 })
                    .pipe(
                      Effect.flatMap((entries) =>
                        Effect.forEach(entries, (entry) =>
                          Event.decode(ThreadActivityFacts.Recorded, entry),
                        ),
                      ),
                    ),
                ),
              );
              const event = events.at(-1);
              if (event === undefined) return yield* Effect.die("Missing activity");
              expect(event.provenance.performedBy).toMatchObject({ memberId: humanId });
              expect(event.provenance.causedBy?.id).toBe(entries[0]?.id);
              // Every participant except the replying author.
              expect(event.payload.recipients.map((r) => r.participationId).sort()).toEqual(
                participants
                  .filter((p) => ThreadParticipation.memberOf(p.participant) !== humanId)
                  .map((p) => p.id)
                  .sort(),
              );
            }),
          ),
        ),
    );

    it.effect(
      "mentions admit eligible members and narrow recipients without removing existing participants",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, human } = yield* prepare();
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.add({ groupId: group.id, memberId: otherId }),
                ),
              );
              yield* grant(
                bound,
                humanId,
                ThreadMessagePermissions.Publish,
                threadTarget(first.thread.id),
              );
              // No read, start, agent-use, or group-management permission is needed for this human-only address.
              const result = yield* run(bound, human, reply(first.thread.id, [otherId]));
              expect(result.activity.sequence).toBe(2);
              expect(
                (yield* bound.participations.listByThread(first.thread.id))
                  .flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? [])
                  .sort(),
              ).toEqual([owner.memberId, humanId, otherId, agentId].sort());
              expect(yield* notifications(bound, otherId)).toHaveLength(1);
              expect(yield* notifications(bound, humanId)).toEqual([]);
              expect(yield* notifications(bound, agentId)).toHaveLength(1);
              yield* run(bound, human, reply(first.thread.id, [humanId]));
              // Mentioning oneself does not notify the author either.
              expect(yield* notifications(bound, humanId)).toEqual([]);
              expect(
                (yield* bound.participations.listByThread(first.thread.id)).filter(
                  (p) => ThreadParticipation.memberOf(p.participant) === humanId,
                ),
              ).toHaveLength(1);
              // Mentioning an agent directs it and needs agent-use authority; nothing is recorded without it.
              const before = yield* snapshot(bound, first.thread.id);
              expect(
                yield* Effect.flip(run(bound, human, reply(first.thread.id, [agentId]))),
              ).toMatchObject({ _tag: "Authorization.Denied" });
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
              // Replying where the agent already takes part reaches it without that authority.
              yield* run(bound, human, reply(first.thread.id));
              expect(yield* notifications(bound, agentId)).toHaveLength(2);
            }),
          ),
        ),
    );

    it.effect(
      "start and publish remain separate permissions, default Viewer grants publish, and scoped grants are live",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, human } = yield* prepare();
              yield* grant(bound, humanId, ThreadPermissions.Start, {
                _tag: "Group",
                workspaceId,
                groupId: group.id,
              });
              yield* grant(bound, humanId, ThreadPermissions.Read);
              const own = yield* run(bound, human, start(group.id, [humanId]));
              expect(yield* Effect.flip(run(bound, human, reply(own.thread.id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
              const assignment = yield* grant(
                bound,
                humanId,
                ThreadMessagePermissions.Publish,
                threadTarget(first.thread.id),
              );
              yield* run(bound, human, reply(first.thread.id, [humanId]));
              expect(yield* Effect.flip(run(bound, human, reply(own.thread.id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
              const revoke = Effect.flatMap(Journal.Service, (j) =>
                j.publish(AssignmentFacts.Revoked, {
                  workspaceId,
                  assignmentId: assignment.payload.assignmentId,
                  memberId: assignment.payload.memberId,
                }),
              );
              yield* facts(bound, revoke);
              expect(
                yield* Effect.flip(run(bound, human, reply(first.thread.id, [humanId]))),
              ).toMatchObject({ _tag: "Authorization.Denied" });
              yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) =>
                  j.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("viewer"),
                    memberId: humanId,
                    source: {
                      _tag: "Role",
                      roleId: BuiltinRoles.MemberId,
                      scope: { _tag: "Workspace", workspaceId },
                    },
                  }),
                ),
              );
              yield* run(bound, human, reply(first.thread.id));
              yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) =>
                  j.publish(RoleFacts.PermissionsChanged, {
                    workspaceId,
                    roleId: BuiltinRoles.MemberId,
                    permissions: [ThreadPermissions.Read.name],
                  }),
                ),
              );
              expect(
                yield* Effect.flip(run(bound, human, reply(first.thread.id, [humanId]))),
              ).toMatchObject({ _tag: "Authorization.Denied" });
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
              expect(yield* Effect.flip(run(bound, owner, reply(first.thread.id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
            }),
          ),
        ),
    );

    it.effect(
      "invalid content, outsiders, inactive members, foreign threads, and agent authors fail without writes",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, human, agent } = yield* prepare();
              yield* grant(bound, agentId, ThreadMessagePermissions.Publish);
              const before = yield* snapshot(bound, first.thread.id);
              for (const memberId of [otherId, Member.Id.make("missing")])
                expect(
                  yield* Effect.flip(run(bound, owner, reply(first.thread.id, [memberId]))),
                ).toEqual(new ThreadMessageApplication.ParticipantUnavailable({ memberId }));
              for (const operation of [
                reply(first.thread.id, [], " \n"),
                reply(first.thread.id, [humanId, humanId]),
              ])
                expect(yield* Effect.flip(run(bound, owner, operation))).toMatchObject({
                  _tag: "SchemaError",
                });
              expect(yield* Effect.flip(run(bound, agent, reply(first.thread.id)))).toEqual(
                new ThreadMessageApplication.HumanAuthorRequired({ memberId: agentId }),
              );
              expect(
                yield* Effect.flip(
                  run(bound, { ...human, identity: owner.identity }, reply(first.thread.id)),
                ),
              ).toMatchObject({ _tag: "Authorization.InvalidActor" });
              const hidden = yield* run(bound, owner, create([otherId]));
              yield* grant(bound, otherId, ThreadPermissions.Start);
              const secret = yield* run(bound, actorFor(otherId), start(hidden.id));
              for (const id of [secret.thread.id, Thread.Id.make("missing")])
                expect(yield* Effect.flip(run(bound, owner, reply(id)))).toEqual(
                  new ThreadMessageApplication.NotFound({ threadId: id }),
                );
              const foreign = yield* boundTo(otherWorkspaceId);
              const foreignWorkspace = yield* initialized(foreign);
              const foreignOwner = Actor.Value.make({
                workspaceId: otherWorkspaceId,
                memberId: foreignWorkspace.ownerMemberId,
                identity: { _tag: "Human", id: foreignWorkspace.createdBy },
              });
              expect(
                yield* Effect.flip(run(foreign, foreignOwner, reply(first.thread.id))),
              ).toEqual(new ThreadMessageApplication.NotFound({ threadId: first.thread.id }));
              expect(yield* messages(bound, first.thread.id)).toEqual(before.messages);
              expect(yield* bound.participations.listByThread(first.thread.id)).toEqual(
                before.participants,
              );
              yield* run(
                bound,
                owner,
                Effect.flatMap(MemberApplication.Service, (s) => s.remove(humanId)),
              );
              expect(
                yield* Effect.flip(run(bound, owner, reply(first.thread.id, [humanId]))),
              ).toEqual(new ThreadMessageApplication.ParticipantUnavailable({ memberId: humanId }));
              expect(yield* Effect.flip(run(bound, human, reply(first.thread.id)))).toMatchObject({
                _tag: "Authorization.InvalidActor",
              });
              expect(yield* bound.activities.listByThread(first.thread.id)).toEqual([
                first.activity,
              ]);
              expect(
                (yield* bound.groupMemberships.listByGroup(group.id)).filter(
                  (g) => g.memberId === humanId,
                )[0]?.status,
              ).toBe("removed");
            }),
          ),
        ),
    );

    it.effect(
      "group readmission restores access without participation; a later mention creates a fresh boundary",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, agent } = yield* prepare();
              const old = (yield* bound.participations.listByThread(first.thread.id)).find(
                (p) => ThreadParticipation.memberOf(p.participant) === agentId,
              );
              if (old === undefined) return yield* Effect.die("Missing agent");
              yield* run(
                bound,
                agent,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.leave({
                    groupId: group.id,
                    membershipId: memberParticipant(old).groupMembershipId,
                  }),
                ),
              );
              yield* run(bound, owner, reply(first.thread.id));
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.add({ groupId: group.id, memberId: agentId }),
                ),
              );
              yield* run(bound, owner, reply(first.thread.id));
              expect(yield* notifications(bound, agentId)).toHaveLength(1);
              expect((yield* notifications(bound, agentId))[0]?.state).toEqual({
                _tag: "Discarded",
                reason: "participation-ended",
              });
              yield* TestClock.adjust("2 seconds");
              const addressed = yield* run(bound, owner, reply(first.thread.id, [agentId]));
              // The opening and two replies; leaving took no place in the timeline.
              expect(addressed.activity.sequence).toBe(4);
              const current = (yield* bound.participations.listByThread(first.thread.id)).find(
                (p) =>
                  ThreadParticipation.memberOf(p.participant) === agentId && p.status === "active",
              );
              expect(current).toMatchObject({
                joinedAtSequence: 4,
                joinedAt: addressed.message.publishedAt,
              });
              expect(current?.id).not.toBe(old.id);
              expect(
                current === undefined ? undefined : memberParticipant(current).groupMembershipId,
              ).not.toBe(memberParticipant(old).groupMembershipId);
              expect(
                (yield* notifications(bound, agentId)).map((n) => n.state._tag).sort(),
              ).toEqual(["Discarded", "Pending"]);
              yield* run(bound, owner, reply(first.thread.id));
              expect(
                (yield* bound.participations.listByThread(first.thread.id)).filter(
                  (p) => ThreadParticipation.memberOf(p.participant) === agentId,
                ),
              ).toHaveLength(2);
              expect(yield* notifications(bound, agentId)).toHaveLength(3);
            }),
          ),
        ),
    );

    it.effect(
      "projection and late failures roll back author admission, message, activity, and notifications",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, first, human } = yield* prepare();
              yield* grant(bound, humanId, ThreadMessagePermissions.Publish);
              const before = yield* snapshot(bound, first.thread.id);
              const contexts = [
                Context.add(bound.context, ThreadMessageStore.Service, {
                  ...bound.messages,
                  insert: () =>
                    Effect.fail(
                      new ThreadMessageStore.Failure({ operation: "insert", cause: "injected" }),
                    ),
                }),
                Context.add(bound.context, ThreadActivityStore.Service, {
                  ...bound.activities,
                  insert: () =>
                    Effect.fail(
                      new ThreadActivityStore.Failure({ operation: "insert", cause: "injected" }),
                    ),
                }),
                Context.add(bound.context, NotificationStore.Service, {
                  ...bound.notifications,
                  insertMany: () =>
                    Effect.fail(
                      new NotificationStore.Failure({ operation: "insertMany", cause: "injected" }),
                    ),
                }),
                failingLate(bound, new Store.Failure({ operation: "commit", cause: "injected" }))
                  .context,
              ];
              for (const context of contexts) {
                const outcome = yield* Effect.exit(
                  run({ ...bound, context }, human, reply(first.thread.id, [humanId])),
                );
                expect(Exit.isFailure(outcome)).toBe(true);
                expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
              }
              expect(
                (yield* run(bound, human, reply(first.thread.id, [humanId]))).activity.sequence,
              ).toBe(2);
            }),
          ),
        ),
    );

    it.effect(
      "an enclosing commit sees staged publications, permissions, and departures and can roll everything back",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first } = yield* prepare();
              const before = yield* snapshot(bound, first.thread.id);
              const operation = Effect.flatMap(Journal.Service, (j) =>
                j.commit(
                  Effect.gen(function* () {
                    expect((yield* reply(first.thread.id, [humanId])).activity.sequence).toBe(2);
                    expect((yield* reply(first.thread.id)).activity.sequence).toBe(3);
                    return yield* Effect.fail("rollback");
                  }),
                ),
              );
              expect(yield* Effect.flip(run(bound, owner, operation))).toBe("rollback");
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
              const admission = Option.getOrThrow(
                yield* bound.groupMemberships.findActive(group.id, owner.memberId),
              );
              for (const change of [
                Effect.flatMap(Journal.Service, (j) =>
                  j.publish(RoleFacts.PermissionsChanged, {
                    workspaceId,
                    roleId: BuiltinRoles.OwnerId,
                    permissions: [],
                  }),
                ).pipe(Effect.asVoid),
                Effect.flatMap(Journal.Service, (j) =>
                  j.publish(GroupMembershipFacts.Removed, {
                    workspaceId,
                    groupId: group.id,
                    membershipId: admission.id,
                    memberId: owner.memberId,
                    reason: "left",
                  }),
                ).pipe(Effect.asVoid),
              ]) {
                const changed = Effect.flatMap(Journal.Service, (j) =>
                  j.commit(
                    change.pipe(Effect.andThen(reply(first.thread.id)), Publication.withActor),
                  ),
                );
                expect(Exit.isFailure(yield* Effect.exit(run(bound, owner, changed)))).toBe(true);
                expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
              }
              yield* run(
                bound,
                owner,
                Effect.flatMap(Journal.Service, (j) =>
                  j.commit(
                    Effect.gen(function* () {
                      yield* reply(first.thread.id, [humanId]);
                      yield* reply(first.thread.id);
                    }),
                  ),
                ),
              );
              expect(yield* history(bound)).toHaveLength(before.history.length + 1);
              expect(
                (yield* bound.activities.listByThread(first.thread.id)).map((a) => a.sequence),
              ).toEqual([1, 2, 3]);
            }),
          ),
        ),
    );

    it.effect(
      "concurrent replies serialize sequence allocation and admit a new author only once",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const prepared = yield* prepare();
                  yield* grant(prepared.bound, humanId, ThreadMessagePermissions.Publish);
                  return prepared;
                }),
              ),
            );
            const gate = yield* Deferred.make<void>();
            const ready = [yield* Deferred.make<void>(), yield* Deferred.make<void>()];
            const fibers = yield* Effect.forEach(ready, (signal) =>
              Effect.scoped(
                runHost(
                  storage,
                  Effect.gen(function* () {
                    const bound = yield* boundTo(workspaceId);
                    yield* Deferred.succeed(signal, undefined);
                    yield* Deferred.await(gate);
                    return yield* run(bound, saved.human, reply(saved.first.thread.id, [humanId]));
                  }),
                ),
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
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const bound = yield* boundTo(workspaceId);
                  const successful = results.filter(Exit.isSuccess);
                  const activities = yield* bound.activities.listByThread(saved.first.thread.id);
                  expect(activities.map((a) => a.sequence)).toEqual(
                    Array.from({ length: successful.length + 1 }, (_, i) => i + 1),
                  );
                  expect(new Set(successful.map((r) => r.value.activity.sequence)).size).toBe(
                    successful.length,
                  );
                  expect(
                    (yield* bound.participations.listByThread(saved.first.thread.id)).filter(
                      (p) => ThreadParticipation.memberOf(p.participant) === humanId,
                    ),
                  ).toHaveLength(1);
                  // Authors are never notified of their own replies, even when they mention themselves.
                  expect(yield* notifications(bound, humanId)).toEqual([]);
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "reopening and replay preserve later admissions, recipients, sequence, and departure settlement",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const { bound, owner, group, first } = yield* prepare();
                  yield* run(bound, owner, reply(first.thread.id, [humanId]));
                  yield* run(bound, owner, reply(first.thread.id));
                  yield* run(
                    bound,
                    owner,
                    Effect.flatMap(MemberApplication.Service, (s) => s.remove(agentId)),
                  );
                  yield* run(
                    bound,
                    owner,
                    Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                      s.add({ groupId: group.id, memberId: otherId }),
                    ),
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
                    state: yield* snapshot(bound, first.thread.id),
                  };
                }),
              ),
            );
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const bound = yield* boundTo(workspaceId);
                  expect(yield* snapshot(bound, saved.threadId)).toEqual(saved.state);
                  yield* storage.discardProjections;
                  yield* facts(
                    bound,
                    Effect.flatMap(Journal.Service, (j) => j.replay),
                  );
                  expect(yield* snapshot(bound, saved.threadId)).toEqual(saved.state);
                  expect(yield* notifications(bound, otherId)).toEqual([]);
                }),
              ),
            );
          }),
        ),
    );

    it.effect("gateway exposes human reply outcomes without internal participation snapshots", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const gateway = yield* Gateway.Service;
            const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("owner"), {
              name: "Workspace",
            });
            const bound = yield* boundTo(workspace.id);
            yield* seed(bound);
            const identity = { _tag: "Human" as const, id: workspace.createdBy };
            const group = yield* gateway.asMember(
              workspace.id,
              identity,
              create([workspace.ownerMemberId, humanId]),
            );
            const first = yield* gateway.asMember(
              workspace.id,
              identity,
              opening(group.id, [workspace.ownerMemberId, humanId]),
            );
            // A reply returns the message it published, as stored.
            const result = yield* gateway.asMember(workspace.id, identity, answer(first.thread.id));
            expect(yield* bound.messages.get(result.id)).toEqual(Option.some(result));
            expect(
              Option.getOrThrow(yield* bound.activities.latest(first.thread.id)),
            ).toMatchObject({
              sequence: 2,
              details: { messageId: result.id },
            });
            expect(
              yield* Effect.flip(
                gateway.asMember(workspace.id, identity, answer(first.thread.id, [otherId])),
              ),
            ).toMatchObject({ _tag: "ThreadMessageApplication.ParticipantUnavailable" });
            expect(
              yield* Effect.flip(
                gateway.asMember(workspace.id, identity, answer(Thread.Id.make("missing"))),
              ),
            ).toMatchObject({ _tag: "ThreadMessageApplication.NotFound" });
            expect(
              yield* Effect.flip(
                gateway.asMember(workspace.id, identity, answer(first.thread.id, [], " ")),
              ),
            ).toMatchObject({ _tag: "Gateway.InvalidInput" });
          }),
        ),
      ),
    );

    it.effect("a storage failure before a reply commits leaves nothing behind", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, first } = yield* prepare();
            const before = yield* snapshot(bound, first.thread.id);
            const context = Context.add(bound.context, ThreadActivityStore.Service, {
              ...bound.activities,
              latest: () =>
                Effect.fail(
                  new ThreadActivityStore.Failure({ operation: "latest", cause: "injected" }),
                ),
            });
            expect(
              yield* Effect.flip(run({ ...bound, context }, owner, reply(first.thread.id))),
            ).toMatchObject({ _tag: "ThreadActivityStore.Failure" });
            expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
          }),
        ),
      ),
    );

    it.effect(
      "a captured reply service checks live group access and gives a returning author fresh participation",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, human } = yield* prepare();
              yield* grant(bound, humanId, ThreadMessagePermissions.Publish);
              const service = yield* ThreadMessageApplication.Service.pipe(
                Effect.provide(core(bound)),
              );
              const ownReply = service.publish({
                threadId: first.thread.id,
                text: "My reply",
                mentions: [humanId],
              });
              yield* asActor(ownReply, human);
              const old = (yield* bound.participations.listByThread(first.thread.id)).find(
                (p) => ThreadParticipation.memberOf(p.participant) === humanId,
              );
              if (old === undefined) return yield* Effect.die("Missing author");
              yield* run(
                bound,
                human,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.leave({
                    groupId: group.id,
                    membershipId: memberParticipant(old).groupMembershipId,
                  }),
                ),
              );
              expect(yield* Effect.flip(asActor(ownReply, human))).toEqual(
                new ThreadMessageApplication.NotFound({ threadId: first.thread.id }),
              );
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.add({ groupId: group.id, memberId: humanId }),
                ),
              );
              yield* run(bound, owner, reply(first.thread.id));
              expect(yield* notifications(bound, humanId)).toEqual([]);
              const returned = yield* asActor(ownReply, human);
              const current = (yield* bound.participations.listByThread(first.thread.id)).find(
                (p) =>
                  ThreadParticipation.memberOf(p.participant) === humanId && p.status === "active",
              );
              expect(current?.id).not.toBe(old.id);
              expect(
                current === undefined ? undefined : memberParticipant(current).groupMembershipId,
              ).not.toBe(memberParticipant(old).groupMembershipId);
              const own = Option.getOrThrow(yield* bound.activities.latest(first.thread.id));
              expect(publishedMessage(own)).toBe(returned.id);
              expect(current?.joinedAtSequence).toBe(own.sequence);
              // Their own reply does not notify them; the next unmentioned reply reaches the fresh participation.
              expect(yield* notifications(bound, humanId)).toEqual([]);
              yield* run(bound, owner, reply(first.thread.id));
              expect(yield* notifications(bound, humanId)).toHaveLength(1);
              expect(yield* bound.participations.get(old.id)).toMatchObject({
                value: { status: "ended" },
              });
            }),
          ),
        ),
    );

    it.effect(
      "a concurrent reply and removal cannot leave actionable input for the removed agent",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(runHost(storage, prepare()));
            const gate = yield* Deferred.make<void>();
            const ready = [yield* Deferred.make<void>(), yield* Deferred.make<void>()];
            const fibers = yield* Effect.forEach(ready, (signal, index) =>
              Effect.scoped(
                runHost(
                  storage,
                  Effect.gen(function* () {
                    const bound = yield* boundTo(workspaceId);
                    yield* Deferred.succeed(signal, undefined);
                    yield* Deferred.await(gate);
                    return yield* run(
                      bound,
                      saved.owner,
                      Effect.gen(function* () {
                        if (index === 0) yield* reply(saved.first.thread.id, [agentId]);
                        else
                          yield* Effect.flatMap(MemberApplication.Service, (s) =>
                            s.remove(agentId),
                          );
                      }),
                    );
                  }),
                ),
              ).pipe(Effect.exit, Effect.forkChild),
            );
            yield* Effect.forEach(ready, Deferred.await);
            yield* Deferred.succeed(gate, undefined);
            const results = yield* Effect.forEach(fibers, Fiber.join);
            expect(results.some(Exit.isSuccess)).toBe(true);
            for (const result of results)
              if (Exit.isFailure(result))
                expect(Cause.findErrorOption(result.cause)).toMatchObject({
                  value: {
                    _tag: expect.stringMatching(
                      /^(JournalStore.Conflict|ThreadMessageApplication.ParticipantUnavailable)$/,
                    ),
                  },
                });
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const bound = yield* boundTo(workspaceId);
                  if (Option.getOrThrow(yield* bound.members.get(agentId)).status === "active")
                    yield* run(
                      bound,
                      saved.owner,
                      Effect.flatMap(MemberApplication.Service, (s) => s.remove(agentId)),
                    );
                  expect(
                    (yield* bound.participations.listByThread(saved.first.thread.id))
                      .filter((p) => ThreadParticipation.memberOf(p.participant) === agentId)
                      .every((p) => p.status === "ended"),
                  ).toBe(true);
                  expect(
                    yield* bound.notifications.listPendingByRecipient(
                      Notification.ofMember(agentId, identityFor(agentId)),
                      {
                        limit: 100,
                      },
                    ),
                  ).toEqual([]);
                  const before = yield* snapshot(bound, saved.first.thread.id);
                  expect(
                    yield* Effect.flip(
                      run(bound, saved.owner, reply(saved.first.thread.id, [agentId])),
                    ),
                  ).toMatchObject({ _tag: "ThreadMessageApplication.ParticipantUnavailable" });
                  expect(yield* snapshot(bound, saved.first.thread.id)).toEqual(before);
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "an agent's message tells other agents without asking them for work, and people as usual",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const workspace = yield* initialized(bound);
              const owner = Actor.Value.make({
                workspaceId,
                memberId: workspace.ownerMemberId,
                identity: { _tag: "Human", id: workspace.createdBy },
              });
              const helperId = Member.Id.make("helper");
              const helper: Identity.MemberReference = {
                _tag: "Agent",
                id: Identity.AgentId.make("helper"),
              };
              yield* seed(bound);
              yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) =>
                  j.publish(MemberFacts.Added, {
                    workspaceId,
                    memberId: helperId,
                    identity: helper,
                  }),
                ),
              );
              const group = yield* run(bound, owner, create([owner.memberId, agentId, helperId]));
              // A person's message asks each agent it reaches for work.
              const first = yield* run(bound, owner, start(group.id, [agentId, helperId]));
              const participants = (yield* bound.participations.listByThread(first.thread.id))
                .filter((p) => p.status === "active")
                .flatMap((p) => {
                  const memberId = ThreadParticipation.memberOf(p.participant);
                  return memberId === undefined ? [] : [{ _tag: "Member" as const, memberId }];
                });
              // Agents cannot reply through the application yet; their turns will publish this way.
              const internal = ThreadMessagePublication.layer.pipe(
                Layer.provide(
                  ThreadActivityPublisher.layer.pipe(
                    Layer.provide(
                      Layer.mergeAll(
                        ThreadParticipationAdmission.layer,
                        ThreadActivityRecording.layer,
                      ),
                    ),
                  ),
                ),
              );
              yield* Effect.gen(function* () {
                const journal = yield* Journal.Service;
                const publication = yield* ThreadMessagePublication.Service;
                yield* journal.commit(
                  publication.publish({
                    messageId: ThreadMessage.Id.make("done"),
                    threadId: first.thread.id,
                    author: { _tag: "Member", memberId: agentId },
                    text: "Done",
                    mentions: [],
                    participants,
                    occurredAt: yield* DateTime.now,
                  }),
                );
              }).pipe(
                Effect.provideService(Publication.Service, testProvenance(workspaceId)),
                Effect.provide(internal.pipe(Layer.provideMerge(core(bound)))),
              );
              const inbox = Effect.fnUntraced(function* (
                memberId: Member.Id,
                identity: Identity.MemberReference,
              ) {
                const recipient = Notification.ofMember(memberId, identity);
                return {
                  // In timeline order, whatever order the inbox lists them in.
                  all: (yield* bound.notifications.listByRecipient(recipient, { limit: 10 }))
                    .toSorted((a, b) => (a.thread?.sequence ?? 0) - (b.thread?.sequence ?? 0))
                    .map((n) => [n.thread?.sequence, n.state._tag]),
                  pending: (yield* bound.notifications.listPendingByRecipient(recipient, {
                    limit: 10,
                  })).map((n) => n.thread?.sequence),
                };
              });
              const inboxes = Effect.gen(function* () {
                return {
                  helper: yield* inbox(helperId, helper),
                  agent: yield* inbox(agentId, identityFor(agentId)),
                  owner: yield* inbox(owner.memberId, owner.identity),
                };
              });
              const expected = {
                // The other agent is told of the agent's message, settled, and has only the
                // person's request to take up.
                helper: {
                  all: [
                    [1, "Pending"],
                    [2, "Informational"],
                  ],
                  pending: [1],
                },
                // An author is never notified of its own message.
                agent: { all: [[1, "Pending"]], pending: [1] },
                // People are told as usual, whoever writes.
                owner: { all: [[2, "Pending"]], pending: [2] },
              };
              expect(yield* inboxes).toEqual(expected);
              yield* storage.discardProjections;
              yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) => j.replay),
              );
              expect(yield* inboxes).toEqual(expected);
            }),
          ),
        ),
    );
  });
};
