import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  Role,
  RoleFacts,
  type Permission,
  type Target,
} from "@amends/core/authorization";
import {
  Group,
  GroupApplication,
  GroupMembershipApplication,
  GroupMembershipFacts,
  GroupMembershipStore,
  GroupPermissions,
  GroupMembership,
} from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Member, MemberApplication, MemberFacts, MemberStore } from "@amends/core/workspace";
import {
  Thread,
  ThreadApplication,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadActivityStore,
  ThreadMessage,
  ThreadMessageFacts,
  ThreadMessageStore,
  ThreadParticipation,
  ThreadParticipationStore,
  ThreadPermissions,
  ThreadStore,
} from "@amends/core/thread";
import { Gateway } from "@amends/gateway";
import { Context, DateTime, Effect, Option } from "effect";
import {
  type Bound,
  boundTo,
  otherWorkspaceId,
  replacing,
  runHost,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";
import type { Harness } from "./harness.ts";

/** Thread discovery, metadata, timeline pages, and participant summaries. */

export const threadReads = (harness: Harness) => {
  const { core, initialized, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: thread reads`, () => {
    const readerId = Member.Id.make("reader");
    const otherId = Member.Id.make("other");
    const agentId = Member.Id.make("agent");
    const readerIdentity = Identity.MemberReference.cases.Human.make({
      id: Identity.HumanId.make("reader"),
    });
    const identityFor = (id: Member.Id): Identity.MemberReference =>
      id === agentId
        ? { _tag: "Agent", id: Identity.AgentId.make("agent") }
        : { _tag: "Human", id: Identity.HumanId.make(id) };
    const actorFor = (memberId: Member.Id, workspace = workspaceId) =>
      Actor.Value.make({ workspaceId: workspace, memberId, identity: identityFor(memberId) });
    const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor.Value) =>
      effect.pipe(Effect.provideService(Actor.Service, actor));
    const run = <A, E, R>(bound: Bound, actor: Actor.Value, effect: Effect.Effect<A, E, R>) =>
      asActor(effect, actor).pipe(Effect.provide(core(bound)));
    const publish = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
        Effect.provide(core(bound)),
      );
    const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 100 });
    const get = (id: Thread.Id) =>
      Effect.flatMap(ThreadApplication.Service, (service) => service.get(id));
    /** Readable threads of a group as records in ID order; listing order has its own test. */
    const list = (id: Group.Id) =>
      Effect.flatMap(ThreadApplication.Service, (service) =>
        Effect.map(service.listInGroup(id, { limit: 100 }), (items) =>
          items.map((item) => item.thread).toSorted((a, b) => (a.id < b.id ? -1 : 1)),
        ),
      );
    const timeline = (id: Thread.Id, options: ThreadActivityStore.ReadOptions = { limit: 10 }) =>
      Effect.flatMap(ThreadApplication.Service, (service) => service.readTimeline(id, options));
    const participants = (id: Thread.Id) =>
      Effect.flatMap(ThreadApplication.Service, (service) => service.listParticipants(id));
    const create = (memberIds: ReadonlyArray<Member.Id>, name = "Engineering") =>
      Effect.flatMap(GroupApplication.Service, (service) =>
        service.createPrivateTeam({ name, memberIds }),
      );
    const start = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
      Effect.flatMap(ThreadApplication.Service, (service) =>
        service.startInGroup({ groupId, mentions, text: "Opening proposal" }),
      );
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
      publish(
        bound,
        Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(AssignmentFacts.Created, {
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
      publish(
        bound,
        Effect.flatMap(Journal.Service, (journal) =>
          journal.commit(
            Effect.gen(function* () {
              for (const memberId of [readerId, otherId, agentId])
                yield* journal.publish(MemberFacts.Added, {
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
      const group = yield* run(bound, owner, create([owner.memberId, readerId, otherId, agentId]));
      const hidden = yield* run(bound, owner, create([otherId], "Private"));
      const first = yield* run(bound, owner, start(group.id, [otherId]));
      // Mentioning every member, the author included, enrolls and notifies them all.
      const second = yield* run(
        bound,
        owner,
        start(group.id, [owner.memberId, readerId, otherId, agentId]),
      );
      yield* grant(bound, otherId, ThreadPermissions.Start, {
        _tag: "Group",
        workspaceId,
        groupId: hidden.id,
      });
      const secret = yield* run(bound, actorFor(otherId), start(hidden.id));
      return {
        bound,
        owner,
        group,
        hidden,
        first,
        second,
        secret,
        reader: actorFor(readerId),
        agent: actorFor(agentId),
      };
    });
    /** Seed nonmonotonic timestamps and canonical activity to isolate pagination behavior. */
    const append = (bound: Bound, thread: Thread.Record, sequence: number) =>
      publish(
        bound,
        Effect.flatMap(Journal.Service, (journal) =>
          journal.commit(
            Effect.gen(function* () {
              const time = DateTime.makeUnsafe(10_000 - sequence * 1000);
              const message: ThreadMessage.Record = {
                id: ThreadMessage.Id.make(`${thread.id}-message-${sequence}`),
                workspaceId: thread.workspaceId,
                threadId: thread.id,
                author: thread.createdBy,
                kind: "User",
                text: `Message ${sequence}`,
                mentions: [],
                publishedAt: time,
              };
              const activity: ThreadActivity.Record = {
                id: ThreadActivity.Id.make(`${thread.id}-activity-${sequence}`),
                workspaceId: thread.workspaceId,
                threadId: thread.id,
                sequence,
                kind: "MessagePublished",
                messageId: message.id,
                occurredAt: time,
              };
              yield* journal.publish(
                ThreadMessageFacts.Published,
                Object.assign({ groupId: thread.groupId }, message),
              );
              const recipients = (yield* bound.participations.listByThread(thread.id))
                .filter((p) => p.status === "active")
                .map((p) => ({
                  participationId: p.id,
                  recipient: ThreadParticipation.recipientOf(p.participant),
                }));
              yield* journal.publish(ThreadActivityFacts.Recorded, {
                groupId: thread.groupId,
                activity,
                recipients,
              });
              return { activity, message };
            }),
          ),
        ),
      );

    it.effect(
      "a default Viewer reads a narrowed thread without joining, exposing routing identities, or changing notifications",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, group, first, second } = yield* prepare();
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("viewer"),
                    memberId: readerId,
                    source: {
                      _tag: "Role",
                      roleId: BuiltinRoles.ViewerId,
                      scope: { _tag: "Workspace", workspaceId },
                    },
                  }),
                ),
              );
              const before = yield* history(bound);
              const beforeParts = yield* bound.participations.listByThread(first.thread.id);
              const beforeNotifications = yield* bound.notifications.listByRecipient(
                readerIdentity,
                {
                  limit: 100,
                },
              );
              expect(
                beforeParts.some((p) => ThreadParticipation.memberOf(p.participant) === readerId),
              ).toBe(false);
              expect(yield* run(bound, reader, get(first.thread.id))).toEqual(first.thread);
              expect(yield* run(bound, reader, list(group.id))).toEqual(
                [first.thread, second.thread].toSorted((a, b) => (a.id < b.id ? -1 : 1)),
              );
              expect(yield* run(bound, reader, timeline(first.thread.id))).toEqual([
                { activity: first.activity, message: first.message },
              ]);
              const current = yield* run(bound, reader, participants(first.thread.id));
              expect(
                current.flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? []).sort(),
              ).toEqual(
                beforeParts
                  .flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? [])
                  .sort(),
              );
              for (const p of current)
                expect(Object.keys(p).sort()).toEqual(
                  [
                    "id",
                    "workspaceId",
                    "threadId",
                    "participant",
                    "joinedAt",
                    "joinedAtSequence",
                  ].sort(),
                );
              expect(yield* bound.participations.listByThread(first.thread.id)).toEqual(
                beforeParts,
              );
              expect(
                yield* bound.notifications.listByRecipient(readerIdentity, { limit: 100 }),
              ).toEqual(beforeNotifications);
              expect(yield* history(bound)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect(
      "exact thread grants filter discovery and suffice without group-read, member-read, participation, or agent-use grants",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, agent, group, first, second } = yield* prepare();
              expect(yield* run(bound, reader, list(group.id))).toEqual([]);
              expect(yield* Effect.flip(run(bound, reader, get(first.thread.id)))).toMatchObject({
                _tag: "Authorization.Denied",
                requirement: { permission: { name: "thread.read" } },
              });
              yield* grant(bound, readerId, GroupPermissions.Read);
              expect(
                yield* Effect.flip(run(bound, reader, timeline(first.thread.id))),
              ).toMatchObject({
                _tag: "Authorization.Denied",
              });
              const assignment = yield* grant(
                bound,
                readerId,
                ThreadPermissions.Read,
                threadTarget(first.thread.id),
              );
              yield* grant(bound, agentId, ThreadPermissions.Read, threadTarget(first.thread.id));
              expect(yield* run(bound, reader, list(group.id))).toEqual([first.thread]);
              expect(yield* run(bound, agent, timeline(first.thread.id))).toHaveLength(1);
              expect(yield* run(bound, agent, participants(first.thread.id))).toHaveLength(2);
              expect(yield* Effect.flip(run(bound, reader, get(second.thread.id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Revoked, {
                    workspaceId,
                    assignmentId: assignment.payload.assignmentId,
                  }),
                ),
              );
              expect(yield* run(bound, reader, list(group.id))).toEqual([]);
            }),
          ),
        ),
    );

    it.effect(
      "ownership, group management, and broad read grants cannot bypass the audience or reveal private thread metadata",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, reader, hidden, secret, first } = yield* prepare();
              yield* grant(bound, readerId, ThreadPermissions.Read);
              for (const actor of [owner, reader])
                for (const id of [secret.thread.id, Thread.Id.make("missing")]) {
                  const calls: ReadonlyArray<
                    Effect.Effect<
                      unknown,
                      ThreadApplication.ReadError,
                      ThreadApplication.Service | Actor.Service
                    >
                  > = [get(id), timeline(id), participants(id)];
                  for (const call of calls)
                    expect(yield* Effect.flip(run(bound, actor, call))).toEqual(
                      new ThreadApplication.NotFound({ threadId: id }),
                    );
                }
              expect(yield* Effect.flip(run(bound, owner, list(hidden.id)))).toEqual(
                new ThreadApplication.GroupNotFound({ groupId: hidden.id }),
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
              expect(yield* Effect.flip(run(bound, owner, get(first.thread.id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
            }),
          ),
        ),
    );

    it.effect(
      "timeline pages follow sequence rather than timestamps, with exclusive cursors and no repeats across later appends",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, first, second } = yield* prepare();
              const added = [];
              for (const sequence of [2, 3, 4])
                added.push(yield* append(bound, first.thread, sequence));
              expect(
                DateTime.isGreaterThan(
                  added[0]?.activity.occurredAt ?? first.activity.occurredAt,
                  added[1]?.activity.occurredAt ?? first.activity.occurredAt,
                ),
              ).toBe(true);
              const page1 = yield* run(bound, owner, timeline(first.thread.id, { limit: 2 }));
              expect(page1).toEqual([
                { activity: first.activity, message: first.message },
                added[0],
              ]);
              const page2 = yield* run(
                bound,
                owner,
                timeline(first.thread.id, { afterSequence: 2, limit: 2 }),
              );
              expect(page2).toEqual(added.slice(1));
              expect(
                yield* run(bound, owner, timeline(first.thread.id, { afterSequence: 4, limit: 2 })),
              ).toEqual([]);
              const fifth = yield* append(bound, first.thread, 5);
              expect(
                yield* run(bound, owner, timeline(first.thread.id, { afterSequence: 4, limit: 2 })),
              ).toEqual([fifth]);
              expect(
                yield* run(
                  bound,
                  owner,
                  timeline(second.thread.id, { afterSequence: 0, limit: 2 }),
                ),
              ).toEqual([{ activity: second.activity, message: second.message }]);
              expect(
                yield* run(
                  bound,
                  owner,
                  timeline(first.thread.id, { afterSequence: 100, limit: 2 }),
                ),
              ).toEqual([]);
              expect(
                yield* run(
                  bound,
                  owner,
                  timeline(first.thread.id, {
                    afterSequence: Number.MAX_SAFE_INTEGER,
                    limit: Number.MAX_SAFE_INTEGER,
                  }),
                ),
              ).toEqual([]);
              for (const options of [
                { limit: 0 },
                { limit: 1.5 },
                { limit: 2, afterSequence: -1 },
                { limit: 2, afterSequence: 1.5 },
              ]) {
                expect(
                  yield* Effect.flip(run(bound, owner, timeline(first.thread.id, options))),
                ).toMatchObject({ _tag: "SchemaError" });
                expect(
                  yield* Effect.flip(bound.activities.readPage(first.thread.id, options)),
                ).toMatchObject({ _tag: "ThreadActivityStore.Failure" });
              }
              const foreign = yield* boundTo(otherWorkspaceId);
              expect(yield* foreign.activities.readPage(first.thread.id, { limit: 10 })).toEqual(
                [],
              );
            }),
          ),
        ),
    );

    it.effect(
      "departures and readmission change access and current participation without restoring old participation",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, reader, group, first, second } = yield* prepare();
              yield* grant(bound, readerId, ThreadPermissions.Read);
              yield* run(
                bound,
                reader,
                Effect.gen(function* () {
                  const service = yield* ThreadApplication.Service;
                  expect(yield* service.get(first.thread.id)).toEqual(first.thread);
                  const admission = Option.getOrThrow(
                    yield* bound.groupMemberships.findActive(group.id, readerId),
                  );
                  yield* Effect.flatMap(GroupMembershipApplication.Service, (groups) =>
                    groups.leave({ groupId: group.id, membershipId: admission.id }),
                  );
                  expect(yield* Effect.flip(service.get(first.thread.id))).toEqual(
                    new ThreadApplication.NotFound({ threadId: first.thread.id }),
                  );
                  expect(
                    yield* Effect.flip(service.listInGroup(group.id, { limit: 100 })),
                  ).toMatchObject({
                    _tag: "ThreadApplication.GroupNotFound",
                  });
                  yield* asActor(
                    Effect.flatMap(GroupMembershipApplication.Service, (groups) =>
                      groups.add({ groupId: group.id, memberId: readerId }),
                    ),
                    owner,
                  );
                  expect(yield* service.readTimeline(first.thread.id, { limit: 10 })).toHaveLength(
                    1,
                  );
                  expect(
                    (yield* service.listParticipants(second.thread.id)).some(
                      (p) => ThreadParticipation.memberOf(p.participant) === readerId,
                    ),
                  ).toBe(false);
                  yield* asActor(
                    Effect.flatMap(MemberApplication.Service, (members) =>
                      members.remove(readerId),
                    ),
                    owner,
                  );
                  const calls: ReadonlyArray<
                    Effect.Effect<unknown, ThreadApplication.ReadError, Actor.Service>
                  > = [
                    service.get(first.thread.id),
                    service.listInGroup(group.id, { limit: 100 }),
                    service.readTimeline(first.thread.id, { limit: 10 }),
                    service.listParticipants(first.thread.id),
                  ];
                  for (const call of calls)
                    expect(yield* Effect.flip(call)).toMatchObject({
                      _tag: "Authorization.InvalidActor",
                    });
                }),
              );
            }),
          ),
        ),
    );

    it.effect(
      "reads neither open a transaction nor advance checkpoints, and custom-role revocation stays live",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, first, group } = yield* prepare();
              const roleId = Role.Id.make("conversation-reader");
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.commit(
                    Effect.gen(function* () {
                      yield* journal.publish(RoleFacts.Created, {
                        workspaceId,
                        roleId,
                        name: "Conversation reader",
                        permissions: [ThreadPermissions.Read.name],
                      });
                      yield* journal.publish(AssignmentFacts.Created, {
                        workspaceId,
                        assignmentId: Assignment.Id.make("conversation-reader"),
                        memberId: readerId,
                        source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId } },
                      });
                    }),
                  ),
                ),
              );
              const before = yield* history(bound);
              const readOnly = {
                ...bound,
                context: bound.context.pipe(
                  Context.add(Store.Service, {
                    ...bound.store,
                    transaction: () => Effect.die("Read opened a transaction"),
                  }),
                  Context.add(Checkpoint.Service, {
                    ...bound.checkpoints,
                    set: () => Effect.die("Read advanced a checkpoint"),
                  }),
                ),
              };
              yield* run(
                readOnly,
                reader,
                Effect.gen(function* () {
                  expectTypeOf<
                    Effect.Services<ReturnType<ThreadApplication.Interface["get"]>>
                  >().toEqualTypeOf<Actor.Service>();
                  expectTypeOf<
                    Effect.Services<ReturnType<ThreadApplication.Interface["readTimeline"]>>
                  >().toEqualTypeOf<Actor.Service>();
                  yield* get(first.thread.id);
                  yield* list(group.id);
                  yield* timeline(first.thread.id);
                  yield* participants(first.thread.id);
                }),
              );
              expect(yield* history(bound)).toEqual(before);
              yield* run(
                bound,
                reader,
                Effect.gen(function* () {
                  const service = yield* ThreadApplication.Service;
                  yield* publish(
                    bound,
                    Effect.flatMap(Journal.Service, (journal) =>
                      journal.publish(RoleFacts.PermissionsChanged, {
                        workspaceId,
                        roleId,
                        permissions: [],
                      }),
                    ),
                  );
                  expect(yield* Effect.flip(service.get(first.thread.id))).toMatchObject({
                    _tag: "Authorization.Denied",
                  });
                  expect(yield* service.listInGroup(group.id, { limit: 100 })).toEqual([]);
                }),
              );
            }),
          ),
        ),
    );

    it.effect(
      "staged message activity, departure, and permission changes are visible inside the caller's transaction",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, reader, group, first } = yield* prepare();
              const assignment = yield* grant(bound, readerId, ThreadPermissions.Read);
              const before = yield* history(bound);
              const admission = Option.getOrThrow(
                yield* bound.groupMemberships.findActive(group.id, readerId),
              );
              const outer = Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    const message: ThreadMessage.Record = {
                      id: ThreadMessage.Id.make("staged-message"),
                      workspaceId,
                      threadId: first.thread.id,
                      author: { _tag: "Member", memberId: owner.memberId },
                      kind: "User",
                      text: "Staged text",
                      mentions: [],
                      publishedAt: first.message.publishedAt,
                    };
                    yield* journal.publish(
                      ThreadMessageFacts.Published,
                      Object.assign({ groupId: first.thread.groupId }, message),
                    );
                    yield* journal.publish(ThreadActivityFacts.Recorded, {
                      groupId: first.thread.groupId,
                      activity: {
                        id: ThreadActivity.Id.make("staged-activity"),
                        workspaceId,
                        threadId: first.thread.id,
                        sequence: 2,
                        kind: "MessagePublished",
                        messageId: message.id,
                        occurredAt: message.publishedAt,
                      },
                      recipients: [],
                    });
                    expect(
                      (yield* asActor(timeline(first.thread.id), reader)).map((item) =>
                        "message" in item ? item.message.text : null,
                      ),
                    ).toEqual([first.message.text, "Staged text"]);
                    yield* journal.publish(AssignmentFacts.Revoked, {
                      workspaceId,
                      assignmentId: assignment.payload.assignmentId,
                    });
                    expect(yield* asActor(list(group.id), reader)).toEqual([]);
                    expect(
                      yield* Effect.flip(asActor(timeline(first.thread.id), reader)),
                    ).toMatchObject({ _tag: "Authorization.Denied" });
                    yield* journal.publish(GroupMembershipFacts.Removed, {
                      workspaceId,
                      groupId: group.id,
                      membershipId: admission.id,
                      memberId: readerId,
                      reason: "removed",
                    });
                    expect(yield* Effect.flip(asActor(get(first.thread.id), reader))).toMatchObject(
                      {
                        _tag: "ThreadApplication.NotFound",
                      },
                    );
                    return yield* Effect.fail("rollback");
                  }).pipe(Publication.withActor),
                ),
              );
              expect(yield* Effect.flip(run(bound, owner, outer))).toBe("rollback");
              expect(yield* history(bound)).toEqual(before);
              expect(yield* run(bound, reader, timeline(first.thread.id))).toEqual([
                { activity: first.activity, message: first.message },
              ]);
            }),
          ),
        ),
    );

    it.effect(
      "new group members can read earlier history without joining or receiving earlier notifications",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first } = yield* prepare();
              const memberId = Member.Id.make("visitor");
              const identity = Identity.MemberReference.cases.Human.make({
                id: Identity.HumanId.make("visitor"),
              });
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(MemberFacts.Added, { workspaceId, memberId, identity }),
                ),
              );
              yield* grant(bound, memberId, ThreadPermissions.Read);
              const visitor = Actor.Value.make({ workspaceId, memberId, identity });
              expect(yield* Effect.flip(run(bound, visitor, get(first.thread.id)))).toMatchObject({
                _tag: "ThreadApplication.NotFound",
              });
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipApplication.Service, (groups) =>
                  groups.add({ groupId: group.id, memberId }),
                ),
              );
              expect(yield* run(bound, visitor, timeline(first.thread.id))).toHaveLength(1);
              expect(
                (yield* run(bound, visitor, participants(first.thread.id))).some(
                  (p) => ThreadParticipation.memberOf(p.participant) === memberId,
                ),
              ).toBe(false);
              expect(yield* bound.notifications.listByRecipient(identity, { limit: 10 })).toEqual(
                [],
              );
            }),
          ),
        ),
    );

    it.effect(
      "current-participant reads exclude inactive workspace members even with stale active admission projections",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, first, second } = yield* prepare();
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(MemberFacts.Removed, { workspaceId, memberId: agentId }),
                ),
              );
              expect(
                (yield* run(bound, owner, participants(second.thread.id))).some(
                  (p) => ThreadParticipation.memberOf(p.participant) === agentId,
                ),
              ).toBe(false);
              expect(
                yield* Effect.flip(run(bound, actorFor(agentId), get(first.thread.id))),
              ).toMatchObject({ _tag: "Authorization.InvalidActor" });
              const impostor = Actor.Value.make({
                workspaceId,
                memberId: owner.memberId,
                identity: readerIdentity,
              });
              expect(yield* Effect.flip(run(bound, impostor, get(first.thread.id)))).toMatchObject({
                _tag: "Authorization.InvalidActor",
                reason: "identity-mismatch",
              });
              expect(
                yield* Effect.flip(
                  run(bound, actorFor(readerId, otherWorkspaceId), get(first.thread.id)),
                ),
              ).toMatchObject({ _tag: "Authorization.WorkspaceMismatch" });
            }),
          ),
        ),
    );

    it.effect(
      "gateway reads expose not-found and input outcomes while rejecting foreign thread IDs",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const gateway = yield* Gateway.Service;
              const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("owner"), {
                name: "Workspace",
              });
              const other = yield* gateway.createWorkspace(Identity.HumanId.make("foreign-owner"), {
                name: "Foreign",
              });
              const bound = yield* boundTo(workspace.id);
              yield* seed(bound);
              const owner = { _tag: "Human" as const, id: workspace.createdBy };
              const foreignOwner = { _tag: "Human" as const, id: other.createdBy };
              const group = yield* gateway.asMember(
                workspace.id,
                owner,
                create([workspace.ownerMemberId, readerId]),
              );
              const opened = yield* gateway.asMember(
                workspace.id,
                owner,
                start(group.id, [workspace.ownerMemberId]),
              );
              const foreignGroup = yield* gateway.asMember(
                other.id,
                foreignOwner,
                create([other.ownerMemberId]),
              );
              const foreignThread = yield* gateway.asMember(
                other.id,
                foreignOwner,
                start(foreignGroup.id),
              );
              expect(
                yield* Effect.flip(
                  gateway.asMember(workspace.id, readerIdentity, get(opened.thread.id)),
                ),
              ).toMatchObject({ _tag: "Authorization.Denied" });
              yield* grant(bound, readerId, ThreadPermissions.Read);
              expect(
                yield* gateway.asMember(workspace.id, readerIdentity, get(opened.thread.id)),
              ).toEqual(opened.thread);
              expect(
                yield* gateway.asMember(workspace.id, readerIdentity, timeline(opened.thread.id)),
              ).toEqual([{ activity: opened.activity, message: opened.message }]);
              expect(
                yield* gateway.asMember(
                  workspace.id,
                  readerIdentity,
                  participants(opened.thread.id),
                ),
              ).toHaveLength(1);
              for (const id of [foreignThread.thread.id, Thread.Id.make("missing")])
                expect(
                  yield* Effect.flip(gateway.asMember(workspace.id, readerIdentity, get(id))),
                ).toEqual(new ThreadApplication.NotFound({ threadId: id }));
              expect(
                yield* Effect.flip(
                  gateway.asMember(
                    workspace.id,
                    readerIdentity,
                    timeline(opened.thread.id, { limit: 0 }),
                  ),
                ),
              ).toMatchObject({ _tag: "Gateway.InvalidInput" });
            }),
          ),
        ),
    );

    it.effect(
      "timeline reads reject oversized, unordered, mismatched, and orphaned storage results",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, first, second } = yield* prepare();
              const next = yield* append(bound, first.thread, 2);
              const before = yield* history(bound);
              for (const { rows, limit } of [
                { rows: [first.activity, next.activity], limit: 1 },
                { rows: [next.activity, first.activity], limit: 2 },
                { rows: [first.activity, first.activity], limit: 2 },
                {
                  rows: [Object.assign({}, first.activity, { workspaceId: otherWorkspaceId })],
                  limit: 1,
                },
                {
                  rows: [Object.assign({}, first.activity, { threadId: second.thread.id })],
                  limit: 1,
                },
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, ThreadActivityStore.Service, {
                    ...bound.activities,
                    readPage: () => Effect.succeed(rows),
                  }),
                };
                expect(
                  yield* Effect.flip(run(broken, owner, timeline(first.thread.id, { limit }))),
                ).toMatchObject({ _tag: "ThreadApplication.InvalidResponse" });
              }
              const stale = {
                ...bound,
                context: Context.add(bound.context, ThreadActivityStore.Service, {
                  ...bound.activities,
                  readPage: () => Effect.succeed([first.activity]),
                }),
              };
              expect(
                yield* Effect.flip(
                  run(stale, owner, timeline(first.thread.id, { afterSequence: 1, limit: 10 })),
                ),
              ).toMatchObject({ _tag: "ThreadApplication.InvalidResponse" });
              for (const message of [
                Option.none<ThreadMessage.Record>(),
                Option.some(second.message),
                Option.some(Object.assign({}, first.message, { workspaceId: otherWorkspaceId })),
                Option.some(Object.assign({}, first.message, { threadId: second.thread.id })),
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, ThreadMessageStore.Service, {
                    ...bound.messages,
                    ...replacing(bound.messages, first.message.id, message),
                  }),
                };
                expect(
                  yield* Effect.flip(run(broken, owner, timeline(first.thread.id))),
                ).toMatchObject({ _tag: "ThreadApplication.InvalidResponse" });
              }
              const failing = {
                ...bound,
                context: Context.add(bound.context, ThreadActivityStore.Service, {
                  ...bound.activities,
                  readPage: () =>
                    Effect.fail(
                      new ThreadActivityStore.Failure({
                        operation: "readPage",
                        cause: "failed storage",
                      }),
                    ),
                }),
              };
              expect(
                yield* Effect.flip(run(failing, owner, timeline(first.thread.id))),
              ).toMatchObject({
                _tag: "ThreadActivityStore.Failure",
              });
              expect(yield* history(bound)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect("batch reads return each stored record once and omit absent or foreign IDs", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group, first, second } = yield* prepare();
            const foreign = yield* boundTo(otherWorkspaceId);
            const byId = <A extends { readonly id: string }>(records: ReadonlyArray<A>) =>
              [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            const memberIds = [owner.memberId, agentId, agentId, Member.Id.make("missing")];
            const members = [
              ...Option.toArray(yield* bound.members.get(owner.memberId)),
              ...Option.toArray(yield* bound.members.get(agentId)),
            ];
            expect(byId(yield* bound.members.getMany(memberIds))).toEqual(byId(members));
            const admissions = yield* bound.groupMemberships.listByGroup(group.id);
            const admissionIds = admissions.map((admission) => admission.id);
            expect(
              byId(
                yield* bound.groupMemberships.getMany([
                  ...admissionIds,
                  GroupMembership.Id.make("missing"),
                ]),
              ),
            ).toEqual(byId(admissions));
            const participations = yield* bound.participations.listByThread(second.thread.id);
            const participationIds = participations.map((participation) => participation.id);
            expect(
              byId(
                yield* bound.participations.getMany([
                  ...participationIds,
                  ThreadParticipation.Id.make("missing"),
                ]),
              ),
            ).toEqual(byId(participations));
            const messageIds = [second.message.id, first.message.id];
            const messages = [
              ...Option.toArray(yield* bound.messages.get(first.message.id)),
              ...Option.toArray(yield* bound.messages.get(second.message.id)),
            ];
            expect(
              byId(
                yield* bound.messages.getMany([
                  ...messageIds,
                  first.message.id,
                  ThreadMessage.Id.make("missing"),
                ]),
              ),
            ).toEqual(byId(messages));
            expect(messages).toHaveLength(2);
            for (const empty of [
              bound.members.getMany([]),
              bound.groupMemberships.getMany([]),
              bound.participations.getMany([]),
              bound.messages.getMany([]),
              foreign.members.getMany(memberIds),
              foreign.groupMemberships.getMany(admissionIds),
              foreign.participations.getMany(participationIds),
              foreign.messages.getMany(messageIds),
            ])
              expect(yield* empty).toEqual([]);
          }),
        ),
      ),
    );

    it.effect(
      "thread and participation reads reject inconsistent references and duplicate rows",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, second, secret } = yield* prepare();
              const before = yield* history(bound);
              const participant = (yield* bound.participations.listByThread(second.thread.id)).find(
                (p) => ThreadParticipation.memberOf(p.participant) === agentId,
              );
              if (participant === undefined) return yield* Effect.die("Missing participant");
              for (const record of [
                second.thread,
                Object.assign({}, first.thread, { workspaceId: otherWorkspaceId }),
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, ThreadStore.Service, {
                    ...bound.threads,
                    get: () => Effect.succeedSome(record),
                  }),
                };
                expect(yield* Effect.flip(run(broken, owner, get(first.thread.id)))).toMatchObject({
                  _tag: "ThreadApplication.InvalidResponse",
                });
              }
              for (const rows of [[first.thread, first.thread], [secret.thread]]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, ThreadStore.Service, {
                    ...bound.threads,
                    listByLatest: () => Effect.succeed(rows),
                  }),
                };
                expect(yield* Effect.flip(run(broken, owner, list(group.id)))).toMatchObject({
                  _tag: "ThreadApplication.InvalidResponse",
                });
              }
              for (const rows of [
                [participant, participant],
                [
                  participant,
                  Object.assign({}, participant, { id: ThreadParticipation.Id.make("duplicate") }),
                ],
                [Object.assign({}, participant, { threadId: first.thread.id })],
                [Object.assign({}, participant, { workspaceId: otherWorkspaceId })],
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, ThreadParticipationStore.Service, {
                    ...bound.participations,
                    listByThread: () => Effect.succeed(rows),
                  }),
                };
                expect(
                  yield* Effect.flip(run(broken, owner, participants(second.thread.id))),
                ).toMatchObject({ _tag: "ThreadApplication.InvalidResponse" });
              }
              const wrongMember = {
                ...bound,
                context: Context.add(bound.context, MemberStore.Service, {
                  ...bound.members,
                  ...replacing(bound.members, agentId, yield* bound.members.get(otherId)),
                }),
              };
              expect(
                yield* Effect.flip(run(wrongMember, owner, participants(second.thread.id))),
              ).toMatchObject({ _tag: "ThreadApplication.InvalidResponse" });
              const admission = Option.getOrThrow(
                yield* bound.groupMemberships.findActive(group.id, agentId),
              );
              for (const row of [
                Option.none<typeof admission>(),
                Option.some(Object.assign({}, admission, { memberId: otherId })),
                Option.some(Object.assign({}, admission, { groupId: secret.thread.groupId })),
                Option.some(Object.assign({}, admission, { workspaceId: otherWorkspaceId })),
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, GroupMembershipStore.Service, {
                    ...bound.groupMemberships,
                    ...replacing(bound.groupMemberships, admission.id, row),
                  }),
                };
                expect(
                  yield* Effect.flip(run(broken, owner, participants(second.thread.id))),
                ).toMatchObject({ _tag: "ThreadApplication.InvalidResponse" });
              }
              const oldAdmission = {
                ...bound,
                context: Context.add(bound.context, GroupMembershipStore.Service, {
                  ...bound.groupMemberships,
                  ...replacing(
                    bound.groupMemberships,
                    admission.id,
                    Option.some(Object.assign({}, admission, { status: "removed" as const })),
                  ),
                }),
              };
              expect(
                (yield* run(oldAdmission, owner, participants(second.thread.id))).some(
                  (p) => ThreadParticipation.memberOf(p.participant) === agentId,
                ),
              ).toBe(false);
              expect(yield* history(bound)).toEqual(before);
            }),
          ),
        ),
    );
  });
};
