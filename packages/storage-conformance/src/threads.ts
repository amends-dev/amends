import { describe, expect, expectTypeOf, it } from "@effect/vitest";

import type * as Core from "@amends-dev/core";
import { AgentPermissions } from "@amends-dev/core/agent";

import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  RoleFacts,
} from "@amends-dev/core/authorization";

import {
  Group,
  GroupService,
  GroupMembershipService,
  GroupMembershipFacts,
} from "@amends-dev/core/group";

import { Actor, Identity } from "@amends-dev/core/identity";

import { Event, Journal, Log, Publication, Store } from "@amends-dev/core/journal";
import { Member, MemberService, MemberFacts } from "@amends-dev/core/workspace";

import { Notification, NotificationStore } from "@amends-dev/core/notification";

import {
  Thread,
  ThreadService,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadActivityKind,
  ThreadFacts,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadParticipation,
  ThreadParticipationActivity,
  ThreadParticipationStore,
  ThreadPermissions,
  ThreadCommand,
  ThreadTitleActivity,
} from "@amends-dev/core/thread";

import { Gateway } from "@amends-dev/gateway";

import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Option } from "effect";

import { TestClock } from "effect/testing";

import {
  type Bound,
  boundTo,
  failingLate,
  journalLog,
  listOldestFirst,
  otherWorkspaceId,
  placed,
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
      if (!ThreadParticipation.Participant.isAnyOf(["Member"])(record.participant))
        throw new Error("Expected a member participant");
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
        Effect.provideService(Publication.Service, testProvenance(bound.store.workspaceId)),
        Effect.provide(core(bound)),
      );
    const startOnly = (
      groupId: Group.Id,
      mentions: ReadonlyArray<Member.Id> = [],
      text = "Here's the proposal",
    ) =>
      Effect.flatMap(ThreadService.Service, (threadService) =>
        threadService.startInGroup({ groupId, mentions, text }),
      );
    // Inspect persisted participation through the internal test binding, not the public result.
    const start = Effect.fnUntraced(function* (
      groupId: Group.Id,
      mentions: ReadonlyArray<Member.Id> = [],
      text = "Here's the proposal",
    ) {
      const started = yield* startOnly(groupId, mentions, text);
      // A start returns its thread and opening message; the activity is read back from the store.
      expect(Object.keys(started).sort()).toEqual(["message", "task", "thread"]);
      const result = yield* placed(started);
      const threadParticipationStore = yield* ThreadParticipationStore.Service;
      return Object.assign({}, result, {
        participants: yield* threadParticipationStore.listByThread(result.thread.id),
      });
    });
    const create = (members: ReadonlyArray<Member.Id>, name = "Engineering") =>
      Effect.flatMap(GroupService.Service, (groupService) =>
        groupService.createTeam({ name, memberIds: members }),
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
                  workspaceId: bound.store.workspaceId,
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
    const notifications = (bound: Bound, memberId: Member.Id, identity: Identity.MemberReference) =>
      listOldestFirst(bound.notifications, Notification.ofMember(memberId, identity), {
        limit: 100,
      });
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
                Extract<Core.Operations, ThreadCommand.Service>
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
              expect(result.message.content).toEqual(
                ThreadMessage.published("  Here's the proposal\n", []),
              );
              expect(result.message.via).toBeNull();
              expect(result.activity).toMatchObject({
                threadId: result.thread.id,
                details: { messageId: result.message.id },
                sequence: 1,
                kind: ThreadMessageActivity.Published.name,
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
              for (const [memberId, identity] of [
                [owner.memberId, owner.identity],
                [humanId, humanIdentity],
                [agentId, agentIdentity],
              ] as const)
                expect(yield* notifications(bound, memberId, identity)).toEqual([]);
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
              expect(yield* notifications(bound, owner.memberId, owner.identity)).toEqual([]);
              expect(yield* notifications(bound, humanId, humanIdentity)).toEqual([]);
              expect(yield* notifications(bound, agentId, agentIdentity)).toHaveLength(1);
              expect(yield* bound.groupMemberships.findActive(group.id, otherId)).toEqual(
                Option.none(),
              );
              const before = yield* history(bound);
              for (const id of [otherId, Member.Id.make("missing")])
                expect(yield* Effect.flip(run(bound, owner, start(group.id, [id])))).toEqual(
                  new ThreadService.ParticipantUnavailable({ memberId: id }),
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
                new ThreadService.GroupNotFound({ groupId: hidden.id }),
              );
              expect(
                yield* Effect.flip(run(bound, owner, start(Group.Id.make("missing")))),
              ).toMatchObject({ _tag: "ThreadService.GroupNotFound" });
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
                _tag: "ThreadService.HumanAuthorRequired",
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

    it.effect(
      "a direct group needs agent-use authority for its agents when created, and later only for mentioned ones",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, human } = yield* prepare();
              const direct = (
                memberIds: ReadonlyArray<Member.Id>,
                mentions: ReadonlyArray<Member.Id> = [],
              ) =>
                Effect.flatMap(ThreadService.Service, (threadService) =>
                  threadService.startDirect({ memberIds, text: "Hello", mentions }),
                );
              // The human may start threads anywhere, but may not use the agent.
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("start-anywhere"),
                    memberId: humanId,
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
              const denied = {
                _tag: "Authorization.Denied",
                requirement: {
                  permission: { name: AgentPermissions.Use.name },
                  target: { memberId: agentId },
                },
              };
              // Creating a direct group with an agent gives it a place in every thread.
              const before = yield* history(bound);
              expect(
                yield* Effect.flip(run(bound, human, direct([owner.memberId, agentId]))),
              ).toMatchObject(denied);
              expect(yield* history(bound)).toEqual(before);
              const created = yield* run(bound, owner, direct([humanId, agentId]));
              // Its members then start threads there without it, through either operation.
              const reused = yield* run(bound, human, direct([owner.memberId, agentId]));
              expect(reused.thread.groupId).toBe(created.thread.groupId);
              const again = yield* run(bound, human, start(created.thread.groupId));
              for (const { thread } of [reused, again])
                expect(
                  (yield* bound.participations.listByThread(thread.id)).map(
                    (record) => ThreadParticipation.memberOf(record.participant) ?? null,
                  ),
                ).toContain(agentId);
              // Mentioning the agent directs it, which still needs the authority.
              for (const mentioning of [
                direct([owner.memberId, agentId], [agentId]),
                startOnly(created.thread.groupId, [agentId]),
              ])
                expect(yield* Effect.flip(run(bound, human, mentioning))).toMatchObject(denied);
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
                      records.filter(
                        (record) => !Notification.Recipient.isAnyOf(["Human"])(record.recipient),
                      ),
                    ),
                    records.some((record) =>
                      Notification.Recipient.isAnyOf(["Human"])(record.recipient),
                    )
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
            for (const [memberId, identity] of [
              [owner.memberId, owner.identity],
              [humanId, humanIdentity],
              [agentId, agentIdentity],
            ] as const)
              expect(yield* notifications(bound, memberId, identity)).toEqual([]);
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
                Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
                  groupMembershipService.leave({
                    groupId: group.id,
                    membershipId: memberParticipant(participant).groupMembershipId,
                  }),
                ),
              );
              expect(yield* bound.participations.get(participant.id)).toMatchObject({
                value: { status: "ended", endedAt: yield* DateTime.now },
              });
              expect((yield* notifications(bound, agentId, agentIdentity))[0]?.state).toEqual({
                _tag: "Discarded",
                reason: "participation-ended",
              });
              expect(
                yield* bound.notifications.listPendingByRecipient(
                  Notification.ofMember(agentId, agentIdentity),
                  { limit: 100 },
                ),
              ).toEqual([]);
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
                  groupMembershipService.add({ groupId: group.id, memberId: agentId }),
                ),
              );
              expect(yield* bound.participations.get(participant.id)).toMatchObject({
                value: { status: "ended" },
              });
              expect((yield* notifications(bound, agentId, agentIdentity))[0]?.state._tag).toBe(
                "Discarded",
              );
              const next = yield* run(bound, owner, start(group.id, everyone(owner.memberId)));
              expect(
                next.participants
                  .filter((p) => ThreadParticipation.memberOf(p.participant) === agentId)
                  .map((p) => memberParticipant(p).groupMembershipId)[0],
              ).not.toBe(memberParticipant(participant).groupMembershipId);
              yield* run(
                bound,
                owner,
                Effect.flatMap(MemberService.Service, (memberService) =>
                  memberService.remove(agentId),
                ),
              );
              expect(
                (yield* notifications(bound, agentId, agentIdentity)).every((row) =>
                  Notification.State.isAnyOf(["Discarded"])(row.state),
                ),
              ).toBe(true);
              expect(
                (yield* bound.participations.listByThread(next.thread.id)).find(
                  (p) => ThreadParticipation.memberOf(p.participant) === agentId,
                )?.status,
              ).toBe("ended");
              expect(
                (yield* notifications(bound, humanId, humanIdentity)).every((row) =>
                  Notification.State.isAnyOf(["Pending"])(row.state),
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
            ).toMatchObject({ _tag: "ThreadService.ParticipantUnavailable" });
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
                    Effect.flatMap(MemberService.Service, (memberService) =>
                      memberService.remove(agentId),
                    ),
                  );
                  yield* run(
                    bound,
                    owner,
                    Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
                      groupMembershipService.add({ groupId: group.id, memberId: otherId }),
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
                    notifications: yield* notifications(bound, agentId, agentIdentity),
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
                  expect(yield* notifications(bound, agentId, agentIdentity)).toEqual(
                    saved.notifications,
                  );
                  expect(
                    yield* notifications(bound, otherId, {
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
              expect(Object.keys(result).sort()).toEqual(["message", "task", "thread"]);
              expect(yield* bound.participations.listByThread(result.thread.id)).toHaveLength(3);
              expect(
                yield* Effect.flip(
                  gateway.asMember(workspace.id, owner, startOnly(group.id, [otherId])),
                ),
              ).toMatchObject({ _tag: "ThreadService.ParticipantUnavailable" });
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
                        content: ThreadMessage.published("  ", []),
                      }),
                    ),
                  ),
                ),
              ).toMatchObject({ _tag: "ThreadMessageStore.Conflict" });
              const firstRow = Option.getOrThrow(yield* bound.activities.get(first.activity.id));
              for (const record of [
                // A message has one activity, even in the next position of another thread.
                Object.assign({}, firstRow, {
                  id: ThreadActivity.Id.make("same-message"),
                  threadId: second.thread.id,
                  sequence: 2,
                }),
                Object.assign({}, firstRow, {
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
                          yield* Effect.flatMap(MemberService.Service, (memberService) =>
                            memberService.remove(agentId),
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
                      /^(JournalStore.Conflict|ThreadService.ParticipantUnavailable)$/,
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
                      Effect.flatMap(MemberService.Service, (memberService) =>
                        memberService.remove(agentId),
                      ),
                    );
                  for (const thread of yield* bound.threads.listByGroup(saved.group.id))
                    expect(
                      (yield* bound.participations.listByThread(thread.id))
                        .filter((p) => ThreadParticipation.memberOf(p.participant) === agentId)
                        .every((p) => p.status === "ended"),
                    ).toBe(true);
                  expect(
                    yield* bound.notifications.listPendingByRecipient(
                      Notification.ofMember(agentId, agentIdentity),
                      {
                        limit: 100,
                      },
                    ),
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
                  // Leaving settles the agent's pending input with the departure itself.
                  discardPendingForGroup: () =>
                    Effect.fail(
                      new NotificationStore.Failure({
                        operation: "discardPendingForGroup",
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
                    Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
                      groupMembershipService.leave({
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
                yield* bound.notifications.listPendingByRecipient(
                  Notification.ofMember(agentId, agentIdentity),
                  { limit: 100 },
                ),
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
              ThreadActivityKind.makeRecordUnsafe(
                ThreadMessageActivity.Published,
                {
                  id: ThreadActivity.Id.make(id),
                  workspaceId,
                  threadId: first.thread.id,
                  sequence,
                  occurredAt: first.activity.occurredAt,
                },
                { messageId },
              );
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
            const ended = ThreadActivityKind.makeRecordUnsafe(
              ThreadParticipationActivity.Ended,
              {
                id: ThreadActivity.Id.make("ended"),
                workspaceId,
                threadId: first.thread.id,
                sequence: 3,
                occurredAt,
              },
              { participationId: agentParticipation.id, reason: "unfollowed" },
            );
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

    it.effect("renaming a thread records one fact and a quiet activity that replay applies", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group, human } = yield* prepare();
            const other = Actor.Value.make({
              workspaceId,
              memberId: otherId,
              identity: { _tag: "Human", id: Identity.HumanId.make("other") },
            });
            const rename = (
              by: Actor.Value,
              threadId: Thread.Id,
              title: string,
              expectedTitle: string | null = null,
            ) =>
              run(
                bound,
                by,
                Effect.flatMap(ThreadService.Service, (threadService) =>
                  threadService.rename({ threadId, title, expectedTitle }),
                ),
              );
            // A start titles its thread only when asked; a thread derives from no other at a start.
            const started = yield* run(bound, owner, startOnly(group.id));
            expect(started.thread).toMatchObject({ title: null, origin: null });
            const before = yield* history(bound);
            // Only a member granted thread.rename may rename; belonging to the group is not enough.
            expect(
              yield* Effect.flip(rename(human, started.thread.id, "Launch plan")),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            // To anyone outside the group, the thread is missing.
            expect(yield* Effect.flip(rename(other, started.thread.id, "Launch plan"))).toEqual(
              new ThreadService.NotFound({ threadId: started.thread.id }),
            );
            expect(yield* history(bound)).toEqual(before);
            const renamed = yield* rename(owner, started.thread.id, "Launch plan");
            expect(renamed).toEqual(Object.assign({}, started.thread, { title: "Launch plan" }));
            expect(yield* bound.threads.get(started.thread.id)).toEqual(Option.some(renamed));
            // One commit holds the fact and the quiet activity it causes, at the next position.
            expect(yield* history(bound)).toHaveLength(before.length + 1);
            const batches = yield* publish(
              bound,
              Effect.flatMap(Journal.Service, (journal) => journal.log.read({ limit: 100 })),
            );
            const entries = batches.at(-1)?.entries ?? [];
            expect(entries.map((entry) => entry.payload.name)).toEqual([
              ThreadFacts.Renamed.name,
              ThreadActivityFacts.Recorded.name,
            ]);
            expect(entries[0]?.payload.provenance.performedBy).toMatchObject({
              _tag: "Member",
              memberId: owner.memberId,
            });
            const recorded = (yield* bound.activities.listByThread(started.thread.id)).at(-1);
            if (recorded === undefined) return yield* Effect.die("Missing rename activity");
            const activity = yield* ThreadActivityKind.decode(
              ThreadTitleActivity.Renamed,
              recorded,
            );
            expect(activity).toMatchObject({
              sequence: 2,
              kind: ThreadTitleActivity.Renamed.name,
              version: 1,
              newActivity: false,
              occurrence: null,
              details: { title: "Launch plan", previous: null },
            });
            // Quiet: the latest activity stays the opening message, and no one hears of it.
            expect(yield* bound.threads.getLatest([started.thread.id])).toMatchObject([
              { sequence: 1 },
            ]);
            for (const [memberId, identity] of [
              [humanId, humanIdentity],
              [agentId, agentIdentity],
            ] as const)
              expect(yield* notifications(bound, memberId, identity)).toEqual([]);
            // The timeline shows the rename from its own details.
            const items = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.Service, (threadService) =>
                threadService.readTimeline(started.thread.id, { limit: 10 }),
              ),
            );
            expect(items.at(-1)).toEqual({ activity });
            // The same title again records nothing, whatever title the renamer last saw.
            expect(yield* rename(owner, started.thread.id, "Launch plan", "Other")).toEqual(
              renamed,
            );
            expect(yield* history(bound)).toHaveLength(before.length + 1);
            // Another title from a renamer who last saw none would replace the rename made
            // meanwhile, so it is refused, and nothing is recorded; from the current one, it is not.
            expect(yield* Effect.flip(rename(owner, started.thread.id, "Launch review"))).toEqual(
              new ThreadService.Changed({ threadId: started.thread.id }),
            );
            expect(yield* history(bound)).toHaveLength(before.length + 1);
            const reviewed = yield* rename(
              owner,
              started.thread.id,
              "Launch review",
              "Launch plan",
            );
            expect(reviewed).toEqual(Object.assign({}, renamed, { title: "Launch review" }));
            expect(yield* history(bound)).toHaveLength(before.length + 2);
            // A title is a trimmed line of 1 to 200 characters without hidden ones.
            for (const title of ["", " Launch", "x".repeat(201), "Launch\u0000 plan"])
              expect(
                (yield* Effect.flip(rename(owner, started.thread.id, title, "Launch review")))._tag,
              ).toBe("SchemaError");
            expect(
              yield* Effect.flip(rename(owner, Thread.Id.make("missing"), "Launch plan")),
            ).toEqual(new ThreadService.NotFound({ threadId: Thread.Id.make("missing") }));
            // A start may title the thread; the title is the thread's own, apart from its message.
            const titled = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.Service, (threadService) =>
                threadService.startInGroup({
                  groupId: group.id,
                  mentions: [],
                  text: "Here's the proposal",
                  title: "Proposal",
                }),
              ),
            );
            expect(titled.thread.title).toBe("Proposal");
            expect(yield* bound.threads.get(titled.thread.id)).toEqual(Option.some(titled.thread));
            // The store refuses a rename of a missing thread, or of one in another workspace.
            const foreign = yield* boundTo(otherWorkspaceId);
            for (const [space, input] of [
              [bound, { threadId: Thread.Id.make("missing") }],
              [foreign, { threadId: started.thread.id }],
            ] as const)
              expect(
                yield* Effect.flip(
                  space.store.transaction(
                    space.threads.rename({
                      workspaceId,
                      groupId: group.id,
                      title: "Elsewhere",
                      ...input,
                    }),
                  ),
                ),
              ).toMatchObject({ _tag: "ThreadStore.Conflict" });
            expect(yield* bound.threads.get(started.thread.id)).toEqual(Option.some(reviewed));
          }),
        ),
      ),
    );
  });
};
