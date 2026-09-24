import { describe, expect, expectTypeOf, it } from "@effect/vitest";

import type * as Core from "@amends/core";
import { AgentPermissions } from "@amends/core/agent";

import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  RoleFacts,
} from "@amends/core/authorization";

import {
  Group,
  GroupApplication,
  GroupMembershipApplication,
  GroupMembershipFacts,
} from "@amends/core/group";

import { Actor, Identity } from "@amends/core/identity";

import { Event, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Member, MemberApplication, MemberFacts } from "@amends/core/workspace";

import { NotificationStore } from "@amends/core/notification";

import {
  Thread,
  ThreadApplication,
  ThreadCreation,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadMessage,
  ThreadParticipation,
  ThreadParticipationStore,
  ThreadPermissions,
} from "@amends/core/thread";

import { Gateway } from "@amends/gateway";

import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Option } from "effect";

import { TestClock } from "effect/testing";

import {
  type Bound,
  boundTo,
  failingLate,
  journalLog,
  otherWorkspaceId,
  runHost,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";

import type { Harness } from "./harness.ts";

/** Thread starts in private groups: records, participation, activity, rollback, and replay. */

export const threads = (harness: Harness) => {
  const { core, initialized, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: threads`, () => {
    /** Narrow a stored participation to its member participant for assertions. */
    const memberParticipant = (record: ThreadParticipation.Record) => {
      if (record.participant._tag !== "Member") throw new Error("Expected a member participant");
      return record.participant;
    };
    const humanId = Member.Id.make("human");
    const otherId = Member.Id.make("other");
    const agentId = Member.Id.make("agent");
    const humanIdentity = Identity.MemberReference.cases.Human.make({
      id: Identity.HumanId.make("human"),
    });
    const agentIdentity = Identity.MemberReference.cases.Agent.make({
      id: Identity.AgentId.make("agent"),
    });
    const asActor = <A, E, R>(program: Effect.Effect<A, E, R>, actor: Actor.Value) =>
      program.pipe(Effect.provideService(Actor.Service, actor));
    const run = <A, E, R>(bound: Bound, actor: Actor.Value, program: Effect.Effect<A, E, R>) =>
      asActor(program, actor).pipe(Effect.provide(core(bound)));
    const publish = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
      program.pipe(
        Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
        Effect.provide(core(bound)),
      );
    const startOnly = (
      groupId: Group.Id,
      mentions: ReadonlyArray<Member.Id> = [],
      text = "Here's the proposal",
    ) =>
      Effect.flatMap(ThreadApplication.Service, (service) =>
        service.startInGroup({ groupId, mentions, text }),
      );
    // Inspect persisted participation through the internal test binding, not the public result.
    const start = Effect.fnUntraced(function* (
      groupId: Group.Id,
      mentions: ReadonlyArray<Member.Id> = [],
      text = "Here's the proposal",
    ) {
      const result = yield* startOnly(groupId, mentions, text);
      const store = yield* ThreadParticipationStore.Service;
      return Object.assign({}, result, {
        participants: yield* store.listByThread(result.thread.id),
      });
    });
    const create = (members: ReadonlyArray<Member.Id>, name = "Engineering") =>
      Effect.flatMap(GroupApplication.Service, (service) =>
        service.createPrivateTeam({ name, memberIds: members }),
      );
    const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 100 });
    const seed = (bound: Bound) =>
      publish(
        bound,
        Effect.flatMap(Journal.Service, (journal) =>
          journal.commit(
            Effect.gen(function* () {
              for (const [memberId, identity] of [
                [humanId, humanIdentity],
                [agentId, agentIdentity],
                [otherId, { _tag: "Human", id: Identity.HumanId.make("other") }],
              ] as const)
                yield* journal.publish(MemberFacts.Added, {
                  workspaceId: bound.workspace.workspaceId,
                  memberId,
                  identity,
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
      const hidden = yield* run(bound, owner, create([otherId], "Private"));
      return {
        bound,
        workspace,
        owner,
        group,
        hidden,
        human: Actor.Value.make({ workspaceId, memberId: humanId, identity: humanIdentity }),
        agent: Actor.Value.make({ workspaceId, memberId: agentId, identity: agentIdentity }),
      };
    });
    const notifications = (bound: Bound, identity: Identity.MemberReference) =>
      bound.notifications.listByRecipient(identity, { limit: 100 });
    const sorted = (values: ReadonlyArray<ThreadParticipation.Record>) =>
      values.toSorted((a, b) => (a.id < b.id ? -1 : 1));
    /** Mentioning every member of the fixture group, the author included, enrolls and notifies them all. */
    const everyone = (ownerId: Member.Id) => [ownerId, humanId, agentId];

    it.effect(
      "an unmentioned team opening enrolls only its author and notifies no one, atomically and in order",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              expectTypeOf<
                Extract<Core.Operations, ThreadCreation.Service>
              >().toEqualTypeOf<never>();
              const { bound, owner, group } = yield* prepare();
              yield* TestClock.adjust("5 seconds");
              const before = yield* history(bound);
              const result = yield* run(
                bound,
                owner,
                start(group.id, [], "  Here's the proposal\n"),
              );
              expect(result.thread).toMatchObject({
                groupId: group.id,
                workspaceId,
                createdBy: { _tag: "Member", memberId: owner.memberId },
              });
              expect(result.message.text).toBe("  Here's the proposal\n");
              expect(result.message.mentions).toEqual([]);
              expect(result.activity).toMatchObject({
                threadId: result.thread.id,
                messageId: result.message.id,
                sequence: 1,
                kind: "MessagePublished",
              });
              expect(
                result.participants
                  .flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? [])
                  .sort(),
              ).toEqual([owner.memberId]);
              expect(yield* bound.threads.get(result.thread.id)).toEqual(
                Option.some(result.thread),
              );
              expect(yield* bound.messages.get(result.message.id)).toEqual(
                Option.some(result.message),
              );
              expect(yield* bound.participations.listByThread(result.thread.id)).toEqual(
                sorted(result.participants),
              );
              expect(yield* bound.activities.listByThread(result.thread.id)).toEqual([
                result.activity,
              ]);
              const events = yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal
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
              const event = events[0];
              if (event === undefined) return yield* Effect.die("Missing opening activity");
              expect(event.provenance.performedBy).toMatchObject({ memberId: owner.memberId });
              expect(event.payload.recipients).toEqual([]);
              // A message never notifies its author; the rest of the group is neither enrolled nor notified.
              for (const identity of [owner.identity, humanIdentity, agentIdentity])
                expect(yield* notifications(bound, identity)).toEqual([]);
              // Posting reads the thread through the author's own message.
              expect(
                yield* bound.readStates.getThreadPositions(owner.memberId, [result.thread.id]),
              ).toMatchObject([{ readThrough: 1 }]);
              const after = yield* history(bound);
              expect(after).toHaveLength(before.length + 1);
              expect(after.at(-1)?.entries).toHaveLength(4);
              expect((yield* run(bound, owner, start(group.id, [humanId]))).thread.id).not.toBe(
                result.thread.id,
              );
            }),
          ),
        ),
    );

    it.effect(
      "mentions narrow initial participation and recipients without admitting outsiders",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group } = yield* prepare();
              const result = yield* run(bound, owner, start(group.id, [agentId]));
              expect(
                result.participants
                  .flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? [])
                  .sort(),
              ).toEqual([owner.memberId, agentId].sort());
              expect(yield* notifications(bound, owner.identity)).toEqual([]);
              expect(yield* notifications(bound, humanIdentity)).toEqual([]);
              expect(yield* notifications(bound, agentIdentity)).toHaveLength(1);
              expect(yield* bound.groupMemberships.findActive(group.id, otherId)).toEqual(
                Option.none(),
              );
              const before = yield* history(bound);
              for (const id of [otherId, Member.Id.make("missing")])
                expect(yield* Effect.flip(run(bound, owner, start(group.id, [id])))).toEqual(
                  new ThreadApplication.ParticipantUnavailable({ memberId: id }),
                );
              expect(
                yield* Effect.flip(run(bound, owner, start(group.id, [humanId, humanId]))),
              ).toMatchObject({ _tag: "SchemaError" });
              expect(
                yield* Effect.flip(run(bound, owner, start(group.id, [], " \n "))),
              ).toMatchObject({
                _tag: "SchemaError",
              });
              expect(yield* history(bound)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect(
      "starting requires current audience, scoped start permission, and agent-use authority for mentioned agents",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, human, agent, group, hidden } = yield* prepare();
              const before = yield* history(bound);
              expect(yield* Effect.flip(run(bound, human, start(group.id)))).toMatchObject({
                _tag: "Authorization.Denied",
                requirement: { permission: { name: ThreadPermissions.Start.name } },
              });
              expect(yield* Effect.flip(run(bound, owner, start(hidden.id)))).toEqual(
                new ThreadApplication.GroupNotFound({ groupId: hidden.id }),
              );
              expect(
                yield* Effect.flip(run(bound, owner, start(Group.Id.make("missing")))),
              ).toMatchObject({ _tag: "ThreadApplication.GroupNotFound" });
              expect(yield* history(bound)).toEqual(before);
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("start"),
                    memberId: humanId,
                    source: {
                      _tag: "Direct",
                      grant: Grant.make(ThreadPermissions.Start, {
                        _tag: "Target",
                        target: { _tag: "Group", workspaceId, groupId: group.id },
                      }),
                    },
                  }),
                ),
              );
              // An unmentioned post names no agent, so it needs no agent-use authority.
              yield* run(bound, human, start(group.id));
              expect(
                yield* Effect.flip(run(bound, human, start(group.id, [agentId]))),
              ).toMatchObject({
                _tag: "Authorization.Denied",
                requirement: {
                  permission: { name: AgentPermissions.Use.name },
                  target: { memberId: agentId },
                },
              });
              // A narrowed human-only message does not need authority over unselected agents or group.read.
              yield* run(bound, human, start(group.id, [owner.memberId]));
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("use-agent"),
                    memberId: humanId,
                    source: {
                      _tag: "Direct",
                      grant: Grant.make(AgentPermissions.Use, {
                        _tag: "Target",
                        target: { _tag: "Member", workspaceId, memberId: agentId },
                      }),
                    },
                  }),
                ),
              );
              yield* run(bound, human, start(group.id, [agentId]));
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("agent-start"),
                    memberId: agentId,
                    source: {
                      _tag: "Direct",
                      grant: Grant.make(ThreadPermissions.Start, {
                        _tag: "Workspace",
                        workspaceId,
                      }),
                    },
                  }),
                ),
              );
              expect(yield* Effect.flip(run(bound, agent, start(group.id)))).toMatchObject({
                _tag: "ThreadApplication.HumanAuthorRequired",
              });
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(RoleFacts.PermissionsChanged, {
                    workspaceId,
                    roleId: BuiltinRoles.OwnerId,
                    permissions: [],
                  }),
                ),
              );
              expect(yield* Effect.flip(run(bound, owner, start(group.id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
            }),
          ),
        ),
    );

    it.effect("notification failure after earlier inserts rolls back all thread records", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group } = yield* prepare();
            const before = yield* history(bound);
            const failure = new NotificationStore.Failure({
              operation: "insert",
              cause: "injected",
            });
            const broken = {
              ...bound,
              context: Context.add(bound.context, NotificationStore.Service, {
                ...bound.notifications,
                insertMany: (records) =>
                  Effect.andThen(
                    bound.notifications.insertMany(
                      records.filter((record) => record.recipient._tag !== "Human"),
                    ),
                    records.some((record) => record.recipient._tag === "Human")
                      ? Effect.fail(failure)
                      : Effect.void,
                  ),
              }),
            };
            expect(
              yield* Effect.flip(run(broken, owner, start(group.id, everyone(owner.memberId)))),
            ).toMatchObject({
              _tag: "Projection.Failure",
            });
            expect(yield* bound.threads.listByGroup(group.id)).toEqual([]);
            for (const identity of [owner.identity, humanIdentity, agentIdentity])
              expect(yield* notifications(bound, identity)).toEqual([]);
            expect(yield* history(bound)).toEqual(before);
            // A subsequent valid operation can use the same connection and all projections.
            yield* run(bound, owner, start(group.id, everyone(owner.memberId)));
          }),
        ),
      ),
    );

    it.effect(
      "group and workspace departures end participation and discard pending agent input without reviving it on readmission",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, agent, group } = yield* prepare();
              const result = yield* run(bound, owner, start(group.id, everyone(owner.memberId)));
              const participant = result.participants.find(
                (p) => ThreadParticipation.memberOf(p.participant) === agentId,
              );
              if (participant === undefined) return yield* Effect.die("No agent participation");
              yield* TestClock.adjust("1 second");
              yield* run(
                bound,
                agent,
                Effect.flatMap(GroupMembershipApplication.Service, (service) =>
                  service.leave({
                    groupId: group.id,
                    membershipId: memberParticipant(participant).groupMembershipId,
                  }),
                ),
              );
              expect(yield* bound.participations.get(participant.id)).toMatchObject({
                value: { status: "ended", endedAt: yield* DateTime.now },
              });
              expect((yield* notifications(bound, agentIdentity))[0]?.state).toEqual({
                _tag: "Discarded",
                reason: "participation-ended",
              });
              expect(
                yield* bound.notifications.listPendingByRecipient(agentIdentity, { limit: 100 }),
              ).toEqual([]);
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipApplication.Service, (service) =>
                  service.add({ groupId: group.id, memberId: agentId }),
                ),
              );
              expect(yield* bound.participations.get(participant.id)).toMatchObject({
                value: { status: "ended" },
              });
              expect((yield* notifications(bound, agentIdentity))[0]?.state._tag).toBe("Discarded");
              const next = yield* run(bound, owner, start(group.id, everyone(owner.memberId)));
              expect(
                next.participants
                  .filter((p) => ThreadParticipation.memberOf(p.participant) === agentId)
                  .map((p) => memberParticipant(p).groupMembershipId)[0],
              ).not.toBe(memberParticipant(participant).groupMembershipId);
              yield* run(
                bound,
                owner,
                Effect.flatMap(MemberApplication.Service, (service) => service.remove(agentId)),
              );
              expect(
                (yield* notifications(bound, agentIdentity)).every(
                  (row) => row.state._tag === "Discarded",
                ),
              ).toBe(true);
              expect(
                (yield* bound.participations.listByThread(next.thread.id)).find(
                  (p) => ThreadParticipation.memberOf(p.participant) === agentId,
                )?.status,
              ).toBe("ended");
              expect(
                (yield* notifications(bound, humanIdentity)).every(
                  (row) => row.state._tag === "Pending",
                ),
              ).toBe(true);
            }),
          ),
        ),
    );

    it.effect("outer rollback and staged revocation or departure remain authoritative", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group } = yield* prepare();
            const before = yield* history(bound);
            const outer = Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(
                start(group.id, everyone(owner.memberId)).pipe(
                  Effect.andThen(Effect.fail("rollback")),
                ),
              ),
            );
            expect(yield* Effect.flip(run(bound, owner, outer))).toBe("rollback");
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  owner,
                  Effect.flatMap(Journal.Service, (journal) =>
                    journal.commit(
                      Effect.gen(function* () {
                        yield* journal.publish(RoleFacts.PermissionsChanged, {
                          workspaceId,
                          roleId: BuiltinRoles.OwnerId,
                          permissions: [],
                        });
                        return yield* start(group.id, everyone(owner.memberId));
                      }).pipe(Publication.withActor),
                    ),
                  ),
                ),
              ),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(group.id, humanId),
            );
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  owner,
                  Effect.flatMap(Journal.Service, (journal) =>
                    journal.commit(
                      Effect.gen(function* () {
                        yield* journal.publish(GroupMembershipFacts.Removed, {
                          workspaceId,
                          groupId: group.id,
                          membershipId: admission.id,
                          memberId: humanId,
                          reason: "removed",
                        });
                        return yield* start(group.id, [humanId]);
                      }).pipe(Publication.withActor),
                    ),
                  ),
                ),
              ),
            ).toMatchObject({ _tag: "ThreadApplication.ParticipantUnavailable" });
            expect(yield* history(bound)).toEqual(before);
            expect(yield* bound.threads.listByGroup(group.id)).toEqual([]);
          }),
        ),
      ),
    );

    it.effect(
      "reopening and replay retain initial selection, attribution, sequence, and later departure outcomes",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const { bound, owner, group } = yield* prepare();
                  const started = yield* run(
                    bound,
                    owner,
                    start(group.id, everyone(owner.memberId)),
                  );
                  yield* run(
                    bound,
                    owner,
                    Effect.flatMap(MemberApplication.Service, (service) => service.remove(agentId)),
                  );
                  yield* run(
                    bound,
                    owner,
                    Effect.flatMap(GroupMembershipApplication.Service, (service) =>
                      service.add({ groupId: group.id, memberId: otherId }),
                    ),
                  );
                  yield* publish(
                    bound,
                    Effect.flatMap(Journal.Service, (journal) =>
                      journal.publish(RoleFacts.PermissionsChanged, {
                        workspaceId,
                        roleId: BuiltinRoles.OwnerId,
                        permissions: [],
                      }),
                    ),
                  );
                  return {
                    started,
                    activities: yield* bound.activities.listByThread(started.thread.id),
                    participants: yield* bound.participations.listByThread(started.thread.id),
                    notifications: yield* notifications(bound, agentIdentity),
                    history: yield* history(bound),
                  };
                }),
              ),
            );
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const bound = yield* boundTo(workspaceId);
                  const foreign = yield* boundTo(otherWorkspaceId);
                  expect(yield* bound.threads.get(saved.started.thread.id)).toEqual(
                    Option.some(saved.started.thread),
                  );
                  expect(yield* foreign.threads.get(saved.started.thread.id)).toEqual(
                    Option.none(),
                  );
                  yield* storage.discardProjections;
                  yield* publish(
                    bound,
                    Effect.flatMap(Journal.Service, (journal) => journal.replay),
                  );
                  expect(yield* bound.participations.listByThread(saved.started.thread.id)).toEqual(
                    saved.participants,
                  );
                  expect(yield* bound.messages.get(saved.started.message.id)).toEqual(
                    Option.some(saved.started.message),
                  );
                  expect(yield* bound.activities.listByThread(saved.started.thread.id)).toEqual(
                    saved.activities,
                  );
                  expect(yield* notifications(bound, agentIdentity)).toEqual(saved.notifications);
                  expect(
                    yield* notifications(bound, {
                      _tag: "Human",
                      id: Identity.HumanId.make("other"),
                    }),
                  ).toEqual([]);
                  expect(yield* history(bound)).toEqual(saved.history);
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "gateway exposes unavailable-participant outcomes and rejects invalid opening content",
      () =>
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
              const owner = { _tag: "Human" as const, id: workspace.createdBy };
              const group = yield* gateway.asMember(
                workspace.id,
                owner,
                create([workspace.ownerMemberId, humanId, agentId]),
              );
              const result = yield* gateway.asMember(
                workspace.id,
                owner,
                startOnly(group.id, [workspace.ownerMemberId, humanId, agentId]),
              );
              expect(Object.keys(result).sort()).toEqual(["activity", "message", "thread"]);
              expect(yield* bound.participations.listByThread(result.thread.id)).toHaveLength(3);
              expect(
                yield* Effect.flip(
                  gateway.asMember(workspace.id, owner, startOnly(group.id, [otherId])),
                ),
              ).toMatchObject({ _tag: "ThreadApplication.ParticipantUnavailable" });
              expect(
                yield* Effect.flip(
                  gateway.asMember(workspace.id, owner, startOnly(group.id, [], " ")),
                ),
              ).toMatchObject({ _tag: "Gateway.InvalidInput" });
            }),
          ),
        ),
    );

    it.effect(
      "direct stores reject foreign records, a second active participation, a message's second activity, and timeline gaps",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group } = yield* prepare();
              const first = yield* run(bound, owner, start(group.id, everyone(owner.memberId)));
              const second = yield* run(bound, owner, start(group.id, [humanId]));
              const participation = first.participants.find(
                (participant) => ThreadParticipation.memberOf(participant.participant) === agentId,
              );
              if (participation === undefined) return yield* Effect.die("Missing participant");
              const foreign = yield* boundTo(otherWorkspaceId);
              for (const record of [
                Object.assign({}, first.thread, {
                  id: Thread.Id.make("wrong-workspace"),
                  workspaceId: otherWorkspaceId,
                }),
              ]) {
                expect(
                  yield* Effect.flip(bound.store.transaction(bound.threads.insert(record))),
                ).toMatchObject({ _tag: "ThreadStore.Conflict" });
              }
              expect(
                yield* Effect.flip(
                  bound.store.transaction(
                    bound.participations.insert(
                      Object.assign({}, participation, {
                        id: ThreadParticipation.Id.make("duplicate-participation"),
                      }),
                    ),
                  ),
                ),
              ).toMatchObject({ _tag: "ThreadParticipationStore.Conflict" });
              expect(
                yield* Effect.flip(
                  bound.store.transaction(
                    bound.messages.insert(
                      Object.assign({}, first.message, {
                        id: ThreadMessage.Id.make("blank"),
                        text: "  ",
                      }),
                    ),
                  ),
                ),
              ).toMatchObject({ _tag: "ThreadMessageStore.Conflict" });
              for (const record of [
                // A message has one activity, even in the next position of another thread.
                Object.assign({}, first.activity, {
                  id: ThreadActivity.Id.make("same-message"),
                  threadId: second.thread.id,
                  sequence: 2,
                }),
                Object.assign({}, first.activity, {
                  id: ThreadActivity.Id.make("gap"),
                  sequence: 3,
                }),
              ]) {
                expect(
                  yield* Effect.flip(bound.store.transaction(bound.activities.insert(record))),
                ).toMatchObject({ _tag: "ThreadActivityStore.Conflict" });
              }
              expect(
                yield* Effect.flip(foreign.store.transaction(foreign.threads.insert(first.thread))),
              ).toMatchObject({ _tag: "ThreadStore.Conflict" });
              expect(yield* bound.activities.listByThread(first.thread.id)).toEqual([
                first.activity,
              ]);
              expect(yield* bound.participations.listByThread(first.thread.id)).toEqual(
                sorted(first.participants),
              );
            }),
          ),
        ),
    );

    it.effect(
      "concurrent opening and removal cannot retain active participation for an ended admission",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(runHost(storage, prepare()));
            const readyOne = yield* Deferred.make<void>();
            const readyTwo = yield* Deferred.make<void>();
            const startGate = yield* Deferred.make<void>();
            const attempt = (remove: boolean, ready: Deferred.Deferred<void>) =>
              Effect.scoped(
                runHost(
                  storage,
                  Effect.gen(function* () {
                    const bound = yield* boundTo(workspaceId);
                    return yield* run(
                      bound,
                      saved.owner,
                      Effect.gen(function* () {
                        yield* Deferred.succeed(ready, undefined);
                        yield* Deferred.await(startGate);
                        if (remove) {
                          yield* Effect.flatMap(MemberApplication.Service, (service) =>
                            service.remove(agentId),
                          );
                        } else {
                          yield* start(saved.group.id, [agentId]);
                        }
                      }),
                    );
                  }),
                ),
              ).pipe(Effect.exit);
            const one = yield* attempt(false, readyOne).pipe(Effect.forkChild);
            const two = yield* attempt(true, readyTwo).pipe(Effect.forkChild);
            yield* Deferred.await(readyOne);
            yield* Deferred.await(readyTwo);
            yield* Deferred.succeed(startGate, undefined);
            const results = yield* Effect.all([Fiber.join(one), Fiber.join(two)]);
            expect(results.some(Exit.isSuccess)).toBe(true);
            for (const result of results)
              if (Exit.isFailure(result))
                expect(Cause.findErrorOption(result.cause)).toMatchObject({
                  value: {
                    _tag: expect.stringMatching(
                      /^(JournalStore.Conflict|ThreadApplication.ParticipantUnavailable)$/,
                    ),
                  },
                });
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const bound = yield* boundTo(workspaceId);
                  const member = Option.getOrThrow(yield* bound.members.get(agentId));
                  if (member.status === "active")
                    yield* run(
                      bound,
                      saved.owner,
                      Effect.flatMap(MemberApplication.Service, (service) =>
                        service.remove(agentId),
                      ),
                    );
                  for (const thread of yield* bound.threads.listByGroup(saved.group.id))
                    expect(
                      (yield* bound.participations.listByThread(thread.id))
                        .filter((p) => ThreadParticipation.memberOf(p.participant) === agentId)
                        .every((p) => p.status === "ended"),
                    ).toBe(true);
                  expect(
                    yield* bound.notifications.listPendingByRecipient(agentIdentity, {
                      limit: 100,
                    }),
                  ).toEqual([]);
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "a late failure rolls back an opening, and group-departure failure restores input and participation",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, agent, group } = yield* prepare();
              const before = yield* history(bound);
              const live = yield* bound.checkpoints.listLive(journalLog);
              const broken = failingLate(
                bound,
                new Store.Failure({ operation: "commit", cause: "injected" }),
              );
              expect(
                yield* Effect.flip(run(broken, owner, start(group.id, everyone(owner.memberId)))),
              ).toMatchObject({
                _tag: "JournalStore.Failure",
              });
              expect(yield* history(bound)).toEqual(before);
              expect(yield* bound.checkpoints.listLive(journalLog)).toEqual(live);
              const result = yield* run(bound, owner, start(group.id, everyone(owner.memberId)));
              const participation = result.participants.find(
                (p) => ThreadParticipation.memberOf(p.participant) === agentId,
              );
              if (participation === undefined) return yield* Effect.die("Missing agent");
              const snapshot = yield* history(bound);
              const failing = {
                ...bound,
                context: Context.add(bound.context, NotificationStore.Service, {
                  ...bound.notifications,
                  discardPendingForParticipation: () =>
                    Effect.fail(
                      new NotificationStore.Failure({
                        operation: "discardPendingForParticipation",
                        cause: "injected",
                      }),
                    ),
                }),
              };
              expect(
                yield* Effect.flip(
                  run(
                    failing,
                    agent,
                    Effect.flatMap(GroupMembershipApplication.Service, (service) =>
                      service.leave({
                        groupId: group.id,
                        membershipId: memberParticipant(participation).groupMembershipId,
                      }),
                    ),
                  ),
                ),
              ).toMatchObject({ _tag: "Projection.Failure" });
              expect(yield* bound.participations.get(participation.id)).toEqual(
                Option.some(participation),
              );
              expect(yield* bound.groupMemberships.findActive(group.id, agentId)).toMatchObject({
                _tag: "Some",
              });
              expect(
                yield* bound.notifications.listPendingByRecipient(agentIdentity, { limit: 100 }),
              ).toHaveLength(1);
              expect(yield* history(bound)).toEqual(snapshot);
            }),
          ),
        ),
    );

    it.effect("direct stores refuse reused IDs and misplaced timeline entries", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group } = yield* prepare();
            const first = yield* run(bound, owner, start(group.id, [agentId]));
            const second = yield* run(bound, owner, start(group.id));
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(group.id, humanId),
            );
            const agentParticipation = first.participants.find(
              (participant) => ThreadParticipation.memberOf(participant.participant) === agentId,
            );
            if (agentParticipation === undefined) return yield* Effect.die("Missing agent");
            const write = <A, E, R>(program: Effect.Effect<A, E, R>) =>
              bound.store.transaction(program);
            const refused = <A, E, R>(program: Effect.Effect<A, E, R>) =>
              Effect.flip(write(program));

            // Threads: a reused ID.
            expect(yield* refused(bound.threads.insert(first.thread))).toMatchObject({
              _tag: "ThreadStore.Conflict",
            });

            // Participants: a reused ID.
            const joined: ThreadParticipation.Record = {
              id: ThreadParticipation.Id.make("joined"),
              workspaceId,
              threadId: second.thread.id,
              participant: {
                _tag: "Member",
                memberId: humanId,
                groupMembershipId: admission.id,
                identity: humanIdentity,
              },
              joinedAt: second.thread.createdAt,
              joinedAtSequence: 1,
              status: "active",
              endedAt: null,
            };
            yield* write(bound.participations.insert(joined));
            expect(yield* bound.participations.get(joined.id)).toEqual(Option.some(joined));
            expect(
              yield* refused(
                bound.participations.insert(
                  Object.assign({}, joined, { threadId: first.thread.id }),
                ),
              ),
            ).toMatchObject({ _tag: "ThreadParticipationStore.Conflict" });

            // Messages: a reused ID.
            expect(yield* refused(bound.messages.insert(first.message))).toMatchObject({
              _tag: "ThreadMessageStore.Conflict",
            });

            // Timeline: contiguous sequences and one entry per subject.
            const message = Object.assign({}, first.message, {
              id: ThreadMessage.Id.make("direct-message"),
            });
            yield* write(bound.messages.insert(message));
            const published = (id: string, messageId: ThreadMessage.Id, sequence: number) =>
              Object.assign({}, first.activity, {
                id: ThreadActivity.Id.make(id),
                messageId,
                sequence,
              });
            for (const record of [
              published("gap", message.id, 3),
              published("same-subject", first.message.id, 2),
            ])
              expect(yield* refused(bound.activities.insert(record))).toMatchObject({
                _tag: "ThreadActivityStore.Conflict",
              });
            yield* write(bound.activities.insert(published("next", message.id, 2)));
            const occurredAt = DateTime.makeUnsafe("2026-09-23T12:00:00.000Z");
            const departure = {
              workspaceId,
              threadId: first.thread.id,
              participationId: agentParticipation.id,
            };
            const ended: ThreadActivity.Record = {
              id: ThreadActivity.Id.make("ended"),
              workspaceId,
              threadId: first.thread.id,
              sequence: 3,
              occurredAt,
              kind: "ParticipationEnded",
              participationId: agentParticipation.id,
              reason: "unfollowed",
            };
            yield* write(
              Effect.andThen(
                bound.participations.end(departure, occurredAt),
                bound.activities.insert(ended),
              ),
            );
            // A participation ends once.
            expect(
              yield* refused(
                bound.activities.insert(
                  Object.assign({}, ended, { id: ThreadActivity.Id.make("again"), sequence: 4 }),
                ),
              ),
            ).toMatchObject({ _tag: "ThreadActivityStore.Conflict" });
            expect(
              (yield* bound.activities.listByThread(first.thread.id)).map(
                ({ sequence }) => sequence,
              ),
            ).toEqual([1, 2, 3]);
          }),
        ),
      ),
    );
  });
};
