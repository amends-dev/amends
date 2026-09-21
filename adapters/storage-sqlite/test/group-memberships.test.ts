import { expect, it } from "@effect/vitest";
import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  Role,
  RoleFacts,
} from "@amends/core/authorization";
import {
  Group,
  GroupApplication,
  GroupMembership,
  GroupMembershipApplication,
  GroupMembershipFacts,
  GroupMembershipPermissions,
  GroupMembershipProjection,
  GroupMembershipStore,
  GroupPermissions,
  GroupStore,
} from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Event, Journal, Log, Publication, Store } from "@amends/core/journal";
import {
  Invitation,
  InvitationFacts,
  Member,
  MemberApplication,
  MemberFacts,
  MemberPermissions,
  MemberStore,
} from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Option } from "effect";
import { TestClock } from "effect/testing";
import { SqlClient } from "effect/unstable/sql";
import {
  temporary as withDatabase,
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

const journalId = Log.Id.make("journal");
const managerId = Member.Id.make("manager");
const humanId = Member.Id.make("new-human");
const agentId = Member.Id.make("new-agent");
const managerIdentity = Identity.MemberReference.cases.Human.make({
  id: Identity.HumanId.make("manager"),
});
const add = (groupId: Group.Id, memberId: Member.Id) =>
  Effect.flatMap(GroupMembershipApplication.Service, (service) =>
    service.add({ groupId, memberId }),
  );
const create = (name: string) =>
  Effect.flatMap(GroupApplication.Service, (service) =>
    service.createPrivateTeam({ name, memberIds: [] }),
  );
const run = <A, E, R>(bound: Bound, actor: Actor.Value, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(Actor.Service, actor), Effect.provide(core(bound)));
const publish = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
    Effect.provide(core(bound)),
  );
const history = (bound: Bound) => bound.store.read(journalId, { limit: 100 });
const seedMembers = (bound: Bound) =>
  publish(
    bound,
    Effect.flatMap(Journal.Service, (journal) =>
      journal.commit(
        Effect.gen(function* () {
          for (const [memberId, identity] of [
            [managerId, managerIdentity],
            [humanId, { _tag: "Human", id: Identity.HumanId.make("new-human") }],
            [agentId, { _tag: "Agent", id: Identity.AgentId.make("new-agent") }],
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
  yield* seedMembers(bound);
  const group = yield* run(bound, owner, create("Engineering"));
  const otherGroup = yield* run(bound, owner, create("Design"));
  return {
    bound,
    owner,
    group,
    otherGroup,
    manager: Actor.Value.make({ workspaceId, memberId: managerId, identity: managerIdentity }),
  };
});
const grant = (bound: Bound, groupId: Group.Id) =>
  publish(
    bound,
    Effect.flatMap(Journal.Service, (journal) =>
      journal.publish(AssignmentFacts.Created, {
        workspaceId: bound.workspace.workspaceId,
        assignmentId: Assignment.Id.make("group-management"),
        memberId: managerId,
        source: {
          _tag: "Direct",
          grant: Grant.make(GroupMembershipPermissions.Manage, {
            _tag: "Target",
            target: { _tag: "Group", workspaceId: bound.workspace.workspaceId, groupId },
          }),
        },
      }),
    ),
  );
const membershipCheckpoint = {
  logId: journalId,
  name: GroupMembershipProjection.definition.name,
  version: GroupMembershipProjection.definition.version,
};

const remove = (membership: GroupMembership.Record) =>
  Effect.flatMap(GroupMembershipApplication.Service, (service) =>
    service.remove({
      groupId: membership.groupId,
      membershipId: membership.id,
    }),
  );
const leave = (membership: GroupMembership.Record) =>
  Effect.flatMap(GroupMembershipApplication.Service, (service) =>
    service.leave({
      groupId: membership.groupId,
      membershipId: membership.id,
    }),
  );
const removeWorkspaceMember = (id: Member.Id) =>
  Effect.flatMap(MemberApplication.Service, (service) => service.remove(id));
const memberActor = (memberId: Member.Id) =>
  Actor.Value.make({
    workspaceId,
    memberId,
    identity:
      memberId === agentId
        ? { _tag: "Agent", id: Identity.AgentId.make("new-agent") }
        : { _tag: "Human", id: Identity.HumanId.make("new-human") },
  });

it.effect(
  "adds human and agent members with group-scoped authority and records the actual actor and admission time",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, otherGroup, manager } = yield* prepare();
          yield* grant(bound, group.id);
          expect(yield* bound.groupMemberships.findActive(group.id, managerId)).toEqual(
            Option.none(),
          );
          yield* TestClock.adjust("5 seconds");
          const before = yield* history(bound);
          const membership = yield* run(bound, manager, add(group.id, humanId));
          expect(membership).toMatchObject({
            workspaceId,
            groupId: group.id,
            memberId: humanId,
            status: "active",
          });
          expect(DateTime.isGreaterThan(membership.admittedAt, group.createdAt)).toBe(true);
          expect(yield* bound.groupMemberships.get(membership.id)).toEqual(Option.some(membership));
          expect(yield* bound.groups.get(group.id)).toEqual(Option.some(group));
          expect(yield* bound.groupMemberships.findActive(group.id, managerId)).toEqual(
            Option.none(),
          );
          const events = yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) => journal.log.read({ limit: 100 })),
          );
          expect(events).toHaveLength(before.length + 1);
          const batch = events.at(-1);
          expect(batch?.entries).toHaveLength(1);
          expect(batch?.entries[0]?.payload.name).toBe(GroupMembershipFacts.Added.name);
          expect(batch?.entries[0]?.payload.provenance).toMatchObject({
            performedBy: { _tag: "Member", memberId: managerId, identity: managerIdentity },
            causedBy: null,
            occurredAt: membership.admittedAt,
          });
          const agent = yield* run(bound, manager, add(group.id, agentId));
          expect(agent.id).not.toBe(membership.id);
          const after = yield* history(bound);
          expect(
            yield* Effect.flip(run(bound, manager, add(otherGroup.id, humanId))),
          ).toMatchObject({
            _tag: "Authorization.Denied",
            requirement: { target: { _tag: "Group", groupId: otherGroup.id } },
          });
          expect(yield* history(bound)).toEqual(after);
          expect(yield* bound.groupMemberships.listByGroup(otherGroup.id)).toEqual([]);
        }),
      ),
    ),
);

it.effect(
  "group creation and audience membership confer no management authority; custom roles and revocation do",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner, manager } = yield* prepare();
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.Id.make("creation-only"),
                memberId: managerId,
                source: {
                  _tag: "Direct",
                  grant: Grant.make(GroupPermissions.Create, { _tag: "Workspace", workspaceId }),
                },
              }),
            ),
          );
          const created = yield* run(bound, manager, create("Created by manager"));
          yield* run(bound, owner, add(created.id, managerId));
          const before = yield* history(bound);
          expect(yield* Effect.flip(run(bound, manager, add(created.id, humanId)))).toMatchObject({
            _tag: "Authorization.Denied",
          });
          expect(yield* history(bound)).toEqual(before);
          const roleId = Role.Id.make("group-coordinator");
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* journal.publish(RoleFacts.Created, {
                    workspaceId,
                    roleId,
                    name: "Coordinator",
                    permissions: [GroupMembershipPermissions.Manage.name],
                  });
                  yield* journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("coordinator"),
                    memberId: managerId,
                    source: {
                      _tag: "Role",
                      roleId,
                      scope: {
                        _tag: "Target",
                        target: { _tag: "Group", workspaceId, groupId: group.id },
                      },
                    },
                  });
                }),
              ),
            ),
          );
          yield* run(bound, manager, add(group.id, humanId));
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
          expect(yield* Effect.flip(run(bound, manager, add(group.id, agentId)))).toMatchObject({
            _tag: "Authorization.Denied",
          });
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId: BuiltinRoles.OwnerId,
                permissions: [GroupPermissions.Create.name],
              }),
            ),
          );
          expect(yield* Effect.flip(run(bound, owner, add(group.id, agentId)))).toMatchObject({
            _tag: "Authorization.Denied",
          });
        }),
      ),
    ),
);

it.effect(
  "rejects missing or foreign groups, missing or inactive members, and duplicate admissions without writes",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare();
          const foreign = yield* boundTo(otherWorkspaceId);
          const otherWorkspace = yield* initialized(foreign);
          const foreignOwner = Actor.Value.make({
            workspaceId: otherWorkspaceId,
            memberId: otherWorkspace.ownerMemberId,
            identity: { _tag: "Human", id: otherWorkspace.createdBy },
          });
          const foreignGroup = yield* run(foreign, foreignOwner, create("Elsewhere"));
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(MemberFacts.Removed, { workspaceId, memberId: agentId }),
            ),
          );
          const membership = yield* run(bound, owner, add(group.id, humanId));
          const before = yield* history(bound);
          for (const [groupId, memberId, tag] of [
            [Group.Id.make("missing"), humanId, "GroupMembershipApplication.GroupNotFound"],
            [foreignGroup.id, humanId, "GroupMembershipApplication.GroupNotFound"],
            [group.id, Member.Id.make("missing"), "GroupMembershipApplication.MemberNotFound"],
            [group.id, otherWorkspace.ownerMemberId, "GroupMembershipApplication.MemberNotFound"],
            [group.id, agentId, "GroupMembershipApplication.InactiveMember"],
            [group.id, humanId, "GroupMembershipApplication.AlreadyMember"],
          ] as const)
            expect(yield* Effect.flip(run(bound, owner, add(groupId, memberId)))).toMatchObject({
              _tag: tag,
            });
          expect(yield* history(bound)).toEqual(before);
          expect(yield* bound.groupMemberships.listByGroup(group.id)).toEqual([membership]);
        }),
      ),
    ),
);

it.effect(
  "checkpoint failure after admission projection rolls back its row, fact, and checkpoint",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare();
          const before = yield* history(bound);
          const checkpoint = yield* bound.checkpoints.get(membershipCheckpoint);
          const failure = new Store.Failure({
            operation: "checkpoint.set",
            cause: "injected after admission insert",
          });
          const broken = {
            ...bound,
            context: Context.add(bound.context, Checkpoint.Service, {
              ...bound.checkpoints,
              set: (key, cursor) =>
                key.name === membershipCheckpoint.name
                  ? Effect.fail(failure)
                  : bound.checkpoints.set(key, cursor),
            }),
          };
          expect(yield* Effect.flip(run(broken, owner, add(group.id, humanId)))).toEqual(failure);
          expect(yield* bound.groupMemberships.listByGroup(group.id)).toEqual([]);
          expect(yield* bound.groups.get(group.id)).toEqual(Option.some(group));
          expect(yield* history(bound)).toEqual(before);
          expect(yield* bound.checkpoints.get(membershipCheckpoint)).toEqual(checkpoint);
        }),
      ),
    ),
);

it.effect("outer rollback and staged permission or member removal remain authoritative", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, group, owner, manager } = yield* prepare();
        yield* grant(bound, group.id);
        const before = yield* history(bound);
        expect(
          yield* Effect.flip(
            run(
              bound,
              manager,
              Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  add(group.id, humanId).pipe(
                    Effect.andThen(Effect.fail("cancel caller transaction")),
                  ),
                ),
              ),
            ),
          ),
        ).toBe("cancel caller transaction");
        const afterRevoke = run(
          bound,
          manager,
          Effect.flatMap(Journal.Service, (journal) =>
            journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(AssignmentFacts.Revoked, {
                  workspaceId,
                  assignmentId: Assignment.Id.make("group-management"),
                });
                return yield* add(group.id, humanId);
              }).pipe(Publication.withActor),
            ),
          ),
        );
        expect(yield* Effect.flip(afterRevoke)).toMatchObject({ _tag: "Authorization.Denied" });
        const afterRemoval = run(
          bound,
          owner,
          Effect.flatMap(Journal.Service, (journal) =>
            journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(MemberFacts.Removed, { workspaceId, memberId: humanId });
                return yield* add(group.id, humanId);
              }).pipe(Publication.withActor),
            ),
          ),
        );
        expect(yield* Effect.flip(afterRemoval)).toMatchObject({
          _tag: "GroupMembershipApplication.InactiveMember",
        });
        expect(yield* history(bound)).toEqual(before);
        expect(yield* bound.groupMemberships.listByGroup(group.id)).toEqual([]);
        yield* run(bound, manager, add(group.id, humanId));
      }),
    ),
  ),
);

it.effect(
  "reopening and replay preserve a later admission after its actor and recipient lose workspace access",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const saved = yield* inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, group, manager } = yield* prepare();
            yield* grant(bound, group.id);
            yield* TestClock.adjust("5 seconds");
            const membership = yield* run(bound, manager, add(group.id, humanId));
            yield* publish(
              bound,
              Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    yield* journal.publish(MemberFacts.Removed, { workspaceId, memberId: humanId });
                    yield* journal.publish(MemberFacts.Removed, {
                      workspaceId,
                      memberId: managerId,
                    });
                  }),
                ),
              ),
            );
            expect(yield* Effect.flip(run(bound, manager, add(group.id, agentId)))).toMatchObject({
              _tag: "Authorization.InvalidActor",
            });
            return { group, membership, history: yield* history(bound) };
          }),
        );
        yield* inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            expect(yield* bound.groupMemberships.get(saved.membership.id)).toEqual(
              Option.some(saved.membership),
            );
            const sql = yield* SqlClient.SqlClient;
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* sql.unsafe("DELETE FROM group_memberships");
                yield* sql.unsafe("DELETE FROM checkpoints WHERE name = 'group.memberships'");
              }),
            );
            yield* publish(
              bound,
              Effect.flatMap(Journal.Service, (journal) => journal.replay),
            );
            expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toEqual([
              saved.membership,
            ]);
            expect(yield* history(bound)).toEqual(saved.history);
          }),
        );
      }),
    ),
);

it.effect("independent connections cannot concurrently admit the same member twice", () =>
  withDatabase((location) =>
    Effect.gen(function* () {
      const saved = yield* inDatabase(location, prepare());
      const start = yield* Deferred.make<void>();
      const readyOne = yield* Deferred.make<void>();
      const readyTwo = yield* Deferred.make<void>();
      const attempt = (ready: Deferred.Deferred<void>) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            return yield* run(
              bound,
              saved.owner,
              Effect.gen(function* () {
                const service = yield* GroupMembershipApplication.Service;
                yield* Deferred.succeed(ready, undefined);
                yield* Deferred.await(start);
                return yield* service.add({ groupId: saved.group.id, memberId: humanId });
              }),
            );
          }),
        ).pipe(Effect.exit);
      const one = yield* attempt(readyOne).pipe(Effect.forkChild);
      const two = yield* attempt(readyTwo).pipe(Effect.forkChild);
      yield* Deferred.await(readyOne);
      yield* Deferred.await(readyTwo);
      yield* Deferred.succeed(start, undefined);
      const outcomes = yield* Effect.all([Fiber.join(one), Fiber.join(two)]);
      expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1);
      for (const outcome of outcomes) {
        if (Exit.isFailure(outcome))
          expect(Cause.findErrorOption(outcome.cause)).toMatchObject({
            _tag: "Some",
            value: {
              _tag: expect.stringMatching(
                /^(GroupMembershipApplication.AlreadyMember|JournalStore.Conflict)$/,
              ),
            },
          });
      }
      yield* inDatabase(
        location,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId);
          expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toHaveLength(1);
          const events = yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.read({ name: GroupMembershipFacts.Added.name, limit: 100 }),
            ),
          );
          expect(events).toHaveLength(1);
        }),
      );
    }),
  ),
);

it.effect(
  "gateway exposes membership outcomes and observes permission changes through its cached runtime",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const gateway = yield* Gateway.Service;
        const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("gateway-owner"), {
          name: "Workspace",
        });
        const bound = yield* boundTo(workspace.id);
        yield* seedMembers(bound);
        const ownerIdentity = Identity.MemberReference.cases.Human.make({
          id: workspace.createdBy,
        });
        const group = yield* gateway.asMember(workspace.id, ownerIdentity, create("Managed"));
        const call = (memberId: Member.Id) =>
          gateway.asMember(workspace.id, managerIdentity, add(group.id, memberId));
        expect(yield* Effect.flip(call(humanId))).toMatchObject({ _tag: "Authorization.Denied" });
        yield* grant(bound, group.id);
        yield* call(humanId);
        expect(yield* Effect.flip(call(humanId))).toEqual(
          new GroupMembershipApplication.AlreadyMember({ groupId: group.id, memberId: humanId }),
        );
        expect(yield* Effect.flip(call(Member.Id.make("missing")))).toEqual(
          new GroupMembershipApplication.MemberNotFound({ memberId: Member.Id.make("missing") }),
        );
        yield* publish(
          bound,
          Effect.flatMap(Journal.Service, (journal) =>
            journal.publish(MemberFacts.Removed, { workspaceId: workspace.id, memberId: agentId }),
          ),
        );
        expect(yield* Effect.flip(call(agentId))).toEqual(
          new GroupMembershipApplication.InactiveMember({ memberId: agentId }),
        );
        const missing = Group.Id.make("missing");
        expect(
          yield* Effect.flip(gateway.asMember(workspace.id, ownerIdentity, add(missing, humanId))),
        ).toEqual(new GroupMembershipApplication.GroupNotFound({ groupId: missing }));
        yield* publish(
          bound,
          Effect.flatMap(Journal.Service, (journal) =>
            journal.publish(AssignmentFacts.Revoked, {
              workspaceId: workspace.id,
              assignmentId: Assignment.Id.make("group-management"),
            }),
          ),
        );
        expect(yield* Effect.flip(call(agentId))).toMatchObject({ _tag: "Authorization.Denied" });
      }).pipe(Effect.provide(host(location))),
    ),
);

it.effect("inconsistent stores are rejected before a membership can be published", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, group, otherGroup, owner } = yield* prepare();
        const before = yield* history(bound);
        const badGroup = {
          ...bound,
          context: Context.add(bound.context, GroupStore.Service, {
            ...bound.groups,
            get: () => Effect.succeedSome(otherGroup),
          }),
        };
        expect(yield* Effect.flip(run(badGroup, owner, add(group.id, humanId)))).toMatchObject({
          _tag: "GroupMembershipApplication.InvalidResponse",
        });
        const badMember = {
          ...bound,
          context: Context.add(bound.context, MemberStore.Service, {
            ...bound.members,
            get: (id) => (id === humanId ? bound.members.get(agentId) : bound.members.get(id)),
          }),
        };
        expect(yield* Effect.flip(run(badMember, owner, add(group.id, humanId)))).toMatchObject({
          _tag: "GroupMembershipApplication.InvalidResponse",
        });
        const badMembership = {
          ...bound,
          context: Context.add(bound.context, GroupMembershipStore.Service, {
            ...bound.groupMemberships,
            findActive: () =>
              Effect.succeedSome({
                id: GroupMembership.Id.make("wrong-membership"),
                workspaceId,
                groupId: otherGroup.id,
                memberId: humanId,
                admittedAt: group.createdAt,
                status: "active",
              }),
          }),
        };
        expect(yield* Effect.flip(run(badMembership, owner, add(group.id, humanId)))).toMatchObject(
          { _tag: "GroupMembershipApplication.InvalidResponse" },
        );
        const foreignStore = {
          ...bound,
          context: Context.add(bound.context, GroupMembershipStore.Service, {
            ...bound.groupMemberships,
            workspaceId: otherWorkspaceId,
          }),
        };
        expect(yield* Effect.flip(run(foreignStore, owner, add(group.id, humanId)))).toMatchObject({
          _tag: expect.stringMatching(
            /^(GroupMembershipApplication.InvalidResponse|MemberApplication.WorkspaceMismatch)$/,
          ),
        });
        expect(yield* history(bound)).toEqual(before);
        expect(yield* bound.groupMemberships.listByGroup(group.id)).toEqual([]);
      }),
    ),
  ),
);

it.effect(
  "managed departure uses group-scoped permission, preserves history, and records actor and time",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, otherGroup, owner, manager } = yield* prepare();
          yield* grant(bound, group.id);
          const human = yield* run(bound, owner, add(group.id, humanId));
          const agent = yield* run(bound, owner, add(group.id, agentId));
          const elsewhere = yield* run(bound, owner, add(otherGroup.id, humanId));
          const before = yield* history(bound);
          expect(yield* Effect.flip(run(bound, manager, remove(elsewhere)))).toMatchObject({
            _tag: "Authorization.Denied",
          });
          expect(yield* history(bound)).toEqual(before);
          yield* TestClock.adjust("5 seconds");
          const now = yield* DateTime.now;
          for (const admission of [human, agent]) {
            const removed = yield* run(bound, manager, remove(admission));
            expect(removed).toEqual(Object.assign({}, admission, { status: "removed" }));
            expect(yield* bound.groupMemberships.get(admission.id)).toEqual(Option.some(removed));
            expect(yield* bound.groupMemberships.findActive(group.id, admission.memberId)).toEqual(
              Option.none(),
            );
          }
          expect(yield* bound.groupMemberships.get(elsewhere.id)).toEqual(Option.some(elsewhere));
          expect(yield* bound.groupMemberships.findActive(group.id, managerId)).toEqual(
            Option.none(),
          );
          expect(yield* bound.groups.get(group.id)).toEqual(Option.some(group));
          const events = yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal
                .read({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                .pipe(
                  Effect.flatMap((entries) =>
                    Effect.forEach(entries, (entry) =>
                      Event.decode(GroupMembershipFacts.Removed, entry),
                    ),
                  ),
                ),
            ),
          );
          expect(events).toHaveLength(2);
          expect(events.map(({ payload }) => payload)).toEqual(
            [human, agent].map((admission) => ({
              workspaceId,
              groupId: group.id,
              membershipId: admission.id,
              memberId: admission.memberId,
              reason: "removed",
            })),
          );
          for (const event of events)
            expect(event.provenance).toMatchObject({
              performedBy: { _tag: "Member", memberId: managerId, identity: managerIdentity },
              causedBy: null,
              occurredAt: now,
            });
        }),
      ),
    ),
);

it.effect(
  "human, agent, and owner can leave themselves without any grants; others' admissions stay private",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare();
          const admissions = [];
          for (const actor of [memberActor(humanId), memberActor(agentId), owner]) {
            admissions.push({
              actor,
              admission: yield* run(bound, owner, add(group.id, actor.memberId)),
            });
          }
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
          for (const { actor, admission } of admissions) {
            for (const other of admissions.filter(
              ({ actor: candidate }) => candidate.memberId !== actor.memberId,
            )) {
              expect(yield* Effect.flip(run(bound, actor, leave(other.admission)))).toMatchObject({
                _tag: "GroupMembershipApplication.NotFound",
              });
            }
            expect(yield* run(bound, actor, leave(admission))).toEqual(
              Object.assign({}, admission, { status: "removed" }),
            );
            expect(yield* Effect.flip(run(bound, actor, leave(admission)))).toMatchObject({
              _tag: "GroupMembershipApplication.AlreadyRemoved",
            });
            expect(
              yield* Effect.flip(run(bound, actor, add(group.id, actor.memberId))),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            expect(yield* bound.members.get(actor.memberId)).toMatchObject({
              value: { status: "active" },
            });
          }
          expect(yield* bound.workspace.get).toMatchObject({
            value: { ownerMemberId: owner.memberId },
          });
          const events = yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal
                .read({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                .pipe(
                  Effect.flatMap((entries) =>
                    Effect.forEach(entries, (entry) =>
                      Event.decode(GroupMembershipFacts.Removed, entry),
                    ),
                  ),
                ),
            ),
          );
          expect(events).toHaveLength(3);
          for (const [index, event] of events.entries()) {
            expect(event.payload).toMatchObject({ reason: "left" });
            expect(event.provenance.performedBy).toMatchObject({
              memberId: admissions[index]?.actor.memberId,
            });
          }
        }),
      ),
    ),
);

it.effect(
  "creation permission cannot remove members; custom management roles and live revocation apply",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner, manager } = yield* prepare();
          const membership = yield* run(bound, owner, add(group.id, humanId));
          const roleId = Role.Id.make("coordinator");
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* journal.publish(RoleFacts.Created, {
                    workspaceId,
                    roleId,
                    name: "Coordinator",
                    permissions: [GroupPermissions.Create.name],
                  });
                  yield* journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("coordinator"),
                    memberId: managerId,
                    source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId } },
                  });
                }),
              ),
            ),
          );
          expect(yield* Effect.flip(run(bound, manager, remove(membership)))).toMatchObject({
            _tag: "Authorization.Denied",
          });
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId,
                permissions: [GroupMembershipPermissions.Manage.name],
              }),
            ),
          );
          yield* run(bound, manager, remove(membership));
          const next = yield* run(bound, owner, add(group.id, humanId));
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
          expect(yield* Effect.flip(run(bound, manager, remove(next)))).toMatchObject({
            _tag: "Authorization.Denied",
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
          expect(yield* Effect.flip(run(bound, owner, remove(next)))).toMatchObject({
            _tag: "Authorization.Denied",
          });
        }),
      ),
    ),
);

it.effect(
  "stale removal and leave never end a fresh readmission; wrong-group and foreign IDs reveal no admission",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, otherGroup, owner } = yield* prepare();
          const actor = memberActor(humanId);
          const old = yield* run(bound, owner, add(group.id, humanId));
          yield* run(bound, actor, leave(old));
          const fresh = yield* run(bound, owner, add(group.id, humanId));
          expect(fresh.id).not.toBe(old.id);
          const foreign = yield* boundTo(otherWorkspaceId);
          const foreignWorkspace = yield* initialized(foreign);
          const foreignActor = Actor.Value.make({
            workspaceId: otherWorkspaceId,
            memberId: foreignWorkspace.ownerMemberId,
            identity: { _tag: "Human", id: foreignWorkspace.createdBy },
          });
          const foreignGroup = yield* run(foreign, foreignActor, create("Foreign"));
          const foreignAdmission = yield* run(
            foreign,
            foreignActor,
            add(foreignGroup.id, foreignActor.memberId),
          );
          const before = yield* history(bound);
          expect(yield* Effect.flip(run(bound, owner, remove(old)))).toMatchObject({
            _tag: "GroupMembershipApplication.AlreadyRemoved",
          });
          expect(yield* Effect.flip(run(bound, actor, leave(old)))).toMatchObject({
            _tag: "GroupMembershipApplication.AlreadyRemoved",
          });
          for (const input of [
            { groupId: group.id, membershipId: GroupMembership.Id.make("missing") },
            { groupId: otherGroup.id, membershipId: fresh.id },
            { groupId: group.id, membershipId: foreignAdmission.id },
          ]) {
            for (const operation of ["remove", "leave"] as const) {
              expect(
                yield* Effect.flip(
                  run(
                    bound,
                    operation === "remove" ? owner : actor,
                    Effect.flatMap(GroupMembershipApplication.Service, (service) =>
                      service[operation](input),
                    ),
                  ),
                ),
              ).toMatchObject({ _tag: "GroupMembershipApplication.NotFound" });
            }
          }
          expect(yield* history(bound)).toEqual(before);
          expect(yield* bound.groupMemberships.findActive(group.id, humanId)).toEqual(
            Option.some(fresh),
          );
          expect(yield* bound.groupMemberships.get(old.id)).toEqual(
            Option.some(Object.assign({}, old, { status: "removed" })),
          );
        }),
      ),
    ),
);

it.effect(
  "workspace removal settles human and agent admissions and invitations without group-management grants",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, otherGroup, owner } = yield* prepare();
          const old = yield* run(bound, owner, add(group.id, humanId));
          yield* run(bound, memberActor(humanId), leave(old));
          const active = [];
          for (const memberId of [humanId, agentId])
            for (const groupId of [group.id, otherGroup.id])
              active.push(yield* run(bound, owner, add(groupId, memberId)));
          const untouched = yield* run(bound, owner, add(group.id, managerId));
          const issuedAt = yield* DateTime.now;
          const invitation = {
            id: Invitation.Id.make("pending-before-membership"),
            workspaceId,
            inviterMemberId: owner.memberId,
            recipientId: Identity.HumanId.make("new-human"),
            roleId: BuiltinRoles.ViewerId,
            issuedAt,
            expiresAt: DateTime.add(issuedAt, { hours: 1 }),
          };
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(InvitationFacts.Issued, invitation),
            ),
          );
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId: BuiltinRoles.OwnerId,
                permissions: [MemberPermissions.Remove.name],
              }),
            ),
          );
          yield* TestClock.adjust("5 seconds");
          for (const memberId of [humanId, agentId]) {
            yield* run(bound, owner, removeWorkspaceMember(memberId));
            expect(yield* bound.groupMemberships.listActiveByMember(memberId)).toEqual([]);
            expect(yield* bound.members.get(memberId)).toMatchObject({
              value: { status: "removed" },
            });
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  memberActor(memberId),
                  leave(active.find((value) => value.memberId === memberId) ?? old),
                ),
              ),
            ).toMatchObject({ _tag: "Authorization.InvalidActor" });
          }
          for (const membership of [old, ...active])
            expect(yield* bound.groupMemberships.get(membership.id)).toEqual(
              Option.some(Object.assign({}, membership, { status: "removed" })),
            );
          expect(yield* bound.groupMemberships.get(untouched.id)).toEqual(Option.some(untouched));
          expect(yield* bound.invitations.get(invitation.id)).toMatchObject({
            value: { state: { _tag: "Revoked" } },
          });
          const removals = yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal
                .read({ name: MemberFacts.Removed.name, limit: 100 })
                .pipe(
                  Effect.flatMap((entries) =>
                    Effect.forEach(entries, (entry) => Event.decode(MemberFacts.Removed, entry)),
                  ),
                ),
            ),
          );
          const departures = yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal
                .read({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                .pipe(
                  Effect.flatMap((entries) =>
                    Effect.forEach(entries, (entry) =>
                      Event.decode(GroupMembershipFacts.Removed, entry),
                    ),
                  ),
                ),
            ),
          );
          expect(departures).toHaveLength(5);
          for (const event of departures.slice(1)) {
            const cause = removals.find(
              (candidate) => candidate.id === event.provenance.causedBy?.id,
            );
            expect(cause).toBeDefined();
            expect(event.commitId).toBe(cause?.commitId);
            expect(event.provenance).toMatchObject({
              performedBy: { memberId: owner.memberId },
              occurredAt: cause?.provenance.occurredAt,
              correlationId: cause?.provenance.correlationId,
            });
            expect(event.payload).toMatchObject({ reason: "workspace-removed" });
          }
          const before = yield* history(bound);
          expect(
            yield* Effect.flip(run(bound, owner, removeWorkspaceMember(humanId))),
          ).toMatchObject({ _tag: "MemberApplication.AlreadyRemoved" });
          expect(yield* history(bound)).toEqual(before);
        }),
      ),
    ),
);

it.effect(
  "departure projection failure and outer rollback restore the admission, journal, and checkpoint",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare();
          const membership = yield* run(bound, owner, add(group.id, humanId));
          const before = yield* history(bound);
          const checkpoint = yield* bound.checkpoints.get(membershipCheckpoint);
          const failure = new Store.Failure({
            operation: "checkpoint.set",
            cause: "after departure",
          });
          const broken = {
            ...bound,
            context: Context.add(bound.context, Checkpoint.Service, {
              ...bound.checkpoints,
              set: (key, cursor) =>
                key.name === membershipCheckpoint.name
                  ? Effect.fail(failure)
                  : bound.checkpoints.set(key, cursor),
            }),
          };
          for (const operation of [remove, leave]) {
            const actor = operation === remove ? owner : memberActor(humanId);
            expect(yield* Effect.flip(run(broken, actor, operation(membership)))).toEqual(failure);
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  actor,
                  Effect.flatMap(Journal.Service, (journal) =>
                    journal.commit(
                      operation(membership).pipe(Effect.andThen(Effect.fail("rollback"))),
                    ),
                  ),
                ),
              ),
            ).toBe("rollback");
          }
          expect(yield* bound.groupMemberships.get(membership.id)).toEqual(Option.some(membership));
          expect(yield* history(bound)).toEqual(before);
          expect(yield* bound.checkpoints.get(membershipCheckpoint)).toEqual(checkpoint);
        }),
      ),
    ),
);

it.effect("failure after one group departure rolls back the entire workspace removal", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, group, otherGroup, owner } = yield* prepare();
        yield* run(bound, owner, add(group.id, humanId));
        yield* run(bound, owner, add(otherGroup.id, humanId));
        const admissions = yield* bound.groupMemberships.listActiveByMember(humanId);
        const before = yield* history(bound);
        const checkpoint = yield* bound.checkpoints.get(membershipCheckpoint);
        const failure = new GroupMembershipStore.Failure({
          operation: "markRemoved",
          cause: "second departure",
        });
        const broken = {
          ...bound,
          context: Context.add(bound.context, GroupMembershipStore.Service, {
            ...bound.groupMemberships,
            markRemoved: (input) =>
              input.membershipId === admissions[1]?.id
                ? Effect.fail(failure)
                : bound.groupMemberships.markRemoved(input),
          }),
        };
        expect(
          yield* Effect.flip(run(broken, owner, removeWorkspaceMember(humanId))),
        ).toMatchObject({ _tag: "Projection.Failure" });
        expect(yield* bound.members.get(humanId)).toMatchObject({ value: { status: "active" } });
        expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual(admissions);
        expect(yield* history(bound)).toEqual(before);
        expect(yield* bound.checkpoints.get(membershipCheckpoint)).toEqual(checkpoint);
      }),
    ),
  ),
);

it.effect("departure observes staged management revocation and workspace removal", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, group, owner, manager } = yield* prepare();
        yield* grant(bound, group.id);
        const admission = yield* run(bound, owner, add(group.id, humanId));
        const before = yield* history(bound);
        expect(
          yield* Effect.flip(
            run(
              bound,
              manager,
              Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    yield* journal.publish(AssignmentFacts.Revoked, {
                      workspaceId,
                      assignmentId: Assignment.Id.make("group-management"),
                    });
                    return yield* remove(admission);
                  }).pipe(Publication.withActor),
                ),
              ),
            ),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        expect(
          yield* Effect.flip(
            run(
              bound,
              owner,
              Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    yield* removeWorkspaceMember(humanId);
                    return yield* leave(admission).pipe(
                      Effect.provideService(Actor.Service, memberActor(humanId)),
                    );
                  }),
                ),
              ),
            ),
          ),
        ).toMatchObject({ _tag: "Authorization.InvalidActor" });
        expect(yield* history(bound)).toEqual(before);
        expect(yield* bound.groupMemberships.get(admission.id)).toEqual(Option.some(admission));
      }),
    ),
  ),
);

it.effect(
  "reopening and replay preserve departures and fresh admissions after authority changes",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const saved = yield* inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, group, owner, manager } = yield* prepare();
            yield* grant(bound, group.id);
            const human = yield* run(bound, owner, add(group.id, humanId));
            const agent = yield* run(bound, owner, add(group.id, agentId));
            yield* run(bound, manager, remove(human));
            yield* run(bound, memberActor(agentId), leave(agent));
            const fresh = yield* run(bound, owner, add(group.id, humanId));
            yield* run(bound, owner, removeWorkspaceMember(humanId));
            yield* run(bound, owner, removeWorkspaceMember(managerId));
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
              group,
              admissions: [human, agent, fresh].map((value) =>
                Object.assign({}, value, { status: "removed" }),
              ),
              history: yield* history(bound),
            };
          }),
        );
        yield* inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const expected = saved.admissions.toSorted((a, b) => (a.id < b.id ? -1 : 1));
            expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toEqual(expected);
            const sql = yield* SqlClient.SqlClient;
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* sql.unsafe("DELETE FROM group_memberships");
                yield* sql.unsafe("DELETE FROM checkpoints WHERE name = 'group.memberships'");
              }),
            );
            yield* publish(
              bound,
              Effect.flatMap(Journal.Service, (journal) => journal.replay),
            );
            expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toEqual(expected);
            expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([]);
            expect(yield* history(bound)).toEqual(saved.history);
          }),
        );
      }),
    ),
);

it.effect("concurrent removal and self-leave end the admission exactly once", () =>
  withDatabase((location) =>
    Effect.gen(function* () {
      const saved = yield* inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare();
          return { owner, admission: yield* run(bound, owner, add(group.id, humanId)) };
        }),
      );
      const start = yield* Deferred.make<void>();
      const readyOne = yield* Deferred.make<void>();
      const readyTwo = yield* Deferred.make<void>();
      const attempt = (
        operation: typeof remove,
        actor: Actor.Value,
        ready: Deferred.Deferred<void>,
      ) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            return yield* run(
              bound,
              actor,
              Effect.gen(function* () {
                yield* Deferred.succeed(ready, undefined);
                yield* Deferred.await(start);
                return yield* operation(saved.admission);
              }),
            );
          }),
        ).pipe(Effect.exit);
      const one = yield* attempt(remove, saved.owner, readyOne).pipe(Effect.forkChild);
      const two = yield* attempt(leave, memberActor(humanId), readyTwo).pipe(Effect.forkChild);
      yield* Deferred.await(readyOne);
      yield* Deferred.await(readyTwo);
      yield* Deferred.succeed(start, undefined);
      const outcomes = yield* Effect.all([Fiber.join(one), Fiber.join(two)]);
      expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1);
      for (const outcome of outcomes)
        if (Exit.isFailure(outcome))
          expect(Cause.findErrorOption(outcome.cause)).toMatchObject({
            value: {
              _tag: expect.stringMatching(
                /^(GroupMembershipApplication.AlreadyRemoved|JournalStore.Conflict)$/,
              ),
            },
          });
      yield* inDatabase(
        location,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId);
          expect(yield* bound.groupMemberships.get(saved.admission.id)).toEqual(
            Option.some(Object.assign({}, saved.admission, { status: "removed" })),
          );
          const events = yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal
                .read({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                .pipe(
                  Effect.flatMap((entries) =>
                    Effect.forEach(entries, (entry) =>
                      Event.decode(GroupMembershipFacts.Removed, entry),
                    ),
                  ),
                ),
            ),
          );
          expect(events).toHaveLength(1);
        }),
      );
    }),
  ),
);

it.effect(
  "concurrent addition and workspace removal cannot leave an active admission for a removed member",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const saved = yield* inDatabase(location, prepare());
        const start = yield* Deferred.make<void>();
        const readyOne = yield* Deferred.make<void>();
        const readyTwo = yield* Deferred.make<void>();
        const attempt = (depart: boolean, ready: Deferred.Deferred<void>) =>
          inDatabase(
            location,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              return yield* run(
                bound,
                saved.owner,
                Effect.gen(function* () {
                  yield* Deferred.succeed(ready, undefined);
                  yield* Deferred.await(start);
                  if (depart) {
                    yield* removeWorkspaceMember(humanId);
                  } else {
                    yield* add(saved.group.id, humanId);
                  }
                }),
              );
            }),
          ).pipe(Effect.exit);
        const one = yield* attempt(false, readyOne).pipe(Effect.forkChild);
        const two = yield* attempt(true, readyTwo).pipe(Effect.forkChild);
        yield* Deferred.await(readyOne);
        yield* Deferred.await(readyTwo);
        yield* Deferred.succeed(start, undefined);
        const outcomes = yield* Effect.all([Fiber.join(one), Fiber.join(two)]);
        expect(outcomes.some(Exit.isSuccess)).toBe(true);
        for (const outcome of outcomes)
          if (Exit.isFailure(outcome))
            expect(Cause.findErrorOption(outcome.cause)).toMatchObject({
              value: {
                _tag: expect.stringMatching(
                  /^(GroupMembershipApplication.InactiveMember|JournalStore.Conflict)$/,
                ),
              },
            });
        yield* inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const member = yield* bound.members.get(humanId);
            if (Option.isNone(member)) return yield* Effect.die("Missing member");
            if (member.value.status === "removed") {
              expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([]);
            } else {
              // A transaction conflict applies no change; a subsequent authorized attempt settles it.
              yield* run(bound, saved.owner, removeWorkspaceMember(humanId));
            }
            expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([]);
          }),
        );
      }),
    ),
);

it.effect(
  "store departures validate references, reject repeated transitions, and preserve historical fields",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, otherGroup, owner } = yield* prepare();
          const first = yield* run(bound, owner, add(group.id, humanId));
          const second = yield* run(bound, owner, add(otherGroup.id, humanId));
          const foreign = yield* boundTo(otherWorkspaceId);
          const removal = {
            workspaceId,
            groupId: group.id,
            membershipId: first.id,
            memberId: humanId,
            reason: "removed",
          } satisfies GroupMembership.Removal;
          const expected = [first, second].toSorted((a, b) => (a.id < b.id ? -1 : 1));
          expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual(expected);
          expect(yield* foreign.groupMemberships.listActiveByMember(humanId)).toEqual([]);
          for (const invalid of [
            { ...removal, workspaceId: otherWorkspaceId },
            { ...removal, groupId: otherGroup.id },
            { ...removal, memberId: agentId },
            { ...removal, membershipId: GroupMembership.Id.make("missing") },
          ]) {
            expect(
              yield* Effect.flip(
                bound.store.transaction(bound.groupMemberships.markRemoved(invalid)),
              ),
            ).toMatchObject({ _tag: "GroupMembershipStore.Conflict" });
            expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual(expected);
          }
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                // @ts-expect-error Deliberately bypass static typing to verify the storage boundary.
                bound.groupMemberships.markRemoved({ ...removal, reason: "unknown" }),
              ),
            ),
          ).toMatchObject({ _tag: "GroupMembershipStore.Conflict" });
          expect(
            yield* Effect.flip(
              foreign.store.transaction(foreign.groupMemberships.markRemoved(removal)),
            ),
          ).toMatchObject({ _tag: "GroupMembershipStore.Conflict" });
          yield* bound.store.transaction(bound.groupMemberships.markRemoved(removal));
          expect(yield* bound.groupMemberships.get(first.id)).toEqual(
            Option.some(Object.assign({}, first, { status: "removed" })),
          );
          expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([second]);
          expect(
            yield* Effect.flip(
              bound.store.transaction(bound.groupMemberships.markRemoved(removal)),
            ),
          ).toMatchObject({ _tag: "GroupMembershipStore.Conflict" });
          const fresh = yield* run(bound, owner, add(group.id, humanId));
          expect(
            yield* Effect.flip(
              bound.store.transaction(bound.groupMemberships.markRemoved(removal)),
            ),
          ).toMatchObject({ _tag: "GroupMembershipStore.Conflict" });
          expect(yield* bound.groupMemberships.findActive(group.id, humanId)).toEqual(
            Option.some(fresh),
          );
        }),
      ),
    ),
);

it.effect("inconsistent admission responses abort departures and workspace cleanup", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, group, owner } = yield* prepare();
        const admission = yield* run(bound, owner, add(group.id, humanId));
        const before = yield* history(bound);
        for (const wrong of [
          Object.assign({}, admission, { id: GroupMembership.Id.make("wrong") }),
          Object.assign({}, admission, { workspaceId: otherWorkspaceId }),
        ]) {
          const broken = {
            ...bound,
            context: Context.add(bound.context, GroupMembershipStore.Service, {
              ...bound.groupMemberships,
              get: () => Effect.succeedSome(wrong),
            }),
          };
          expect(yield* Effect.flip(run(broken, owner, remove(admission)))).toMatchObject({
            _tag: "GroupMembershipApplication.InvalidResponse",
          });
        }
        for (const wrong of [
          Object.assign({}, admission, { memberId: agentId }),
          Object.assign({}, admission, { workspaceId: otherWorkspaceId }),
          Object.assign({}, admission, { status: "removed" as const }),
        ]) {
          const broken = {
            ...bound,
            context: Context.add(bound.context, GroupMembershipStore.Service, {
              ...bound.groupMemberships,
              listActiveByMember: () => Effect.succeed([wrong]),
            }),
          };
          expect(
            yield* Effect.flip(run(broken, owner, removeWorkspaceMember(humanId))),
          ).toMatchObject({ _tag: "MemberApplication.InvalidResponse" });
        }
        expect(yield* bound.members.get(humanId)).toMatchObject({ value: { status: "active" } });
        expect(yield* bound.groupMemberships.get(admission.id)).toEqual(Option.some(admission));
        expect(yield* history(bound)).toEqual(before);
      }),
    ),
  ),
);

it.effect(
  "gateway exposes departure outcomes and accepts self-leave with no management grant",
  () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const gateway = yield* Gateway.Service;
        const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("gateway-owner"), {
          name: "Workspace",
        });
        const bound = yield* boundTo(workspace.id);
        yield* seedMembers(bound);
        const ownerIdentity = Identity.MemberReference.cases.Human.make({
          id: workspace.createdBy,
        });
        const group = yield* gateway.asMember(workspace.id, ownerIdentity, create("Managed"));
        const admission = yield* gateway.asMember(
          workspace.id,
          ownerIdentity,
          add(group.id, managerId),
        );
        expect(
          yield* Effect.flip(gateway.asMember(workspace.id, managerIdentity, remove(admission))),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        yield* gateway.asMember(workspace.id, managerIdentity, leave(admission));
        expect(
          yield* Effect.flip(gateway.asMember(workspace.id, managerIdentity, leave(admission))),
        ).toEqual(
          new GroupMembershipApplication.AlreadyRemoved({
            groupId: group.id,
            membershipId: admission.id,
          }),
        );
        expect(
          yield* Effect.flip(
            gateway.asMember(
              workspace.id,
              ownerIdentity,
              remove(Object.assign({}, admission, { id: GroupMembership.Id.make("missing") })),
            ),
          ),
        ).toEqual(
          new GroupMembershipApplication.NotFound({
            groupId: group.id,
            membershipId: GroupMembership.Id.make("missing"),
          }),
        );
        expect(
          yield* Effect.flip(gateway.asMember(workspace.id, ownerIdentity, remove(admission))),
        ).toMatchObject({ _tag: "GroupMembershipApplication.AlreadyRemoved" });
      }).pipe(Effect.provide(host(location))),
    ),
);

it.effect.each([humanId, agentId])(
  "workspace self-removal settles admissions without reauthorizing the departed actor: %s",
  (memberId) =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare();
          const admission = yield* run(bound, owner, add(group.id, memberId));
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.Id.make("self-remove"),
                memberId,
                source: {
                  _tag: "Direct",
                  grant: Grant.make(MemberPermissions.Remove, {
                    _tag: "Target",
                    target: { _tag: "Member", workspaceId, memberId },
                  }),
                },
              }),
            ),
          );
          const actor = memberActor(memberId);
          yield* run(bound, actor, removeWorkspaceMember(memberId));
          expect(yield* bound.groupMemberships.get(admission.id)).toEqual(
            Option.some(Object.assign({}, admission, { status: "removed" })),
          );
          expect(yield* bound.groupMemberships.listActiveByMember(memberId)).toEqual([]);
          const newMemberId = Member.Id.make(`${memberId}-readmitted`);
          yield* publish(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(MemberFacts.Added, {
                workspaceId,
                memberId: newMemberId,
                identity: actor.identity,
              }),
            ),
          );
          expect(yield* bound.groupMemberships.listActiveByMember(newMemberId)).toEqual([]);
          const fresh = yield* run(bound, owner, add(group.id, newMemberId));
          expect(fresh.id).not.toBe(admission.id);
          expect(
            yield* Effect.flip(run(bound, { ...actor, memberId: newMemberId }, leave(admission))),
          ).toMatchObject({ _tag: "GroupMembershipApplication.NotFound" });
          expect(yield* bound.groupMemberships.findActive(group.id, newMemberId)).toEqual(
            Option.some(fresh),
          );
        }),
      ),
    ),
);

it.effect(
  "repeating a recorded departure reuses its event and cannot change its reason or a fresh admission",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare();
          const admission = yield* run(bound, owner, add(group.id, humanId));
          yield* run(bound, owner, remove(admission));
          const fresh = yield* run(bound, owner, add(group.id, humanId));
          const before = yield* history(bound);
          yield* publish(
            bound,
            Effect.gen(function* () {
              const journal = yield* Journal.Service;
              const entries = yield* journal.read({
                name: GroupMembershipFacts.Removed.name,
                limit: 100,
              });
              const entry = entries[0];
              if (entry === undefined) return yield* Effect.die("Missing departure event");
              const event = yield* Event.decode(GroupMembershipFacts.Removed, entry);
              const repeated = yield* journal
                .publish(GroupMembershipFacts.Removed, event.payload)
                .pipe(Effect.provideService(Publication.Service, event.provenance));
              expect(repeated).toEqual(event);
              expect(
                yield* Effect.flip(
                  journal
                    .publish(GroupMembershipFacts.Removed, { ...event.payload, reason: "left" })
                    .pipe(Effect.provideService(Publication.Service, event.provenance)),
                ),
              ).toMatchObject({ _tag: "JournalStore.Conflict" });
            }),
          );
          expect(yield* history(bound)).toEqual(before);
          expect(yield* bound.groupMemberships.findActive(group.id, humanId)).toEqual(
            Option.some(fresh),
          );
        }),
      ),
    ),
);
