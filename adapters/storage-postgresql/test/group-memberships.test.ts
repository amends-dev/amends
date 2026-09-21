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
import { Checkpoint, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Member, MemberFacts, MemberStore } from "@amends/core/workspace";
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
import { describe } from "@effect/vitest";
const { available, withDatabase } = setup();

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

describe.skipIf(!available)("PostgreSQL group membership", () => {
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
            expect(yield* bound.groupMemberships.get(membership.id)).toEqual(
              Option.some(membership),
            );
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
            expect(yield* Effect.flip(run(bound, manager, add(created.id, humanId)))).toMatchObject(
              { _tag: "Authorization.Denied" },
            );
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
                      yield* journal.publish(MemberFacts.Removed, {
                        workspaceId,
                        memberId: humanId,
                      });
                      yield* journal.publish(MemberFacts.Removed, {
                        workspaceId,
                        memberId: managerId,
                      });
                    }),
                  ),
                ),
              );
              expect(yield* Effect.flip(run(bound, manager, add(group.id, agentId)))).toMatchObject(
                { _tag: "Authorization.InvalidActor" },
              );
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
              journal.publish(MemberFacts.Removed, {
                workspaceId: workspace.id,
                memberId: agentId,
              }),
            ),
          );
          expect(yield* Effect.flip(call(agentId))).toEqual(
            new GroupMembershipApplication.InactiveMember({ memberId: agentId }),
          );
          const missing = Group.Id.make("missing");
          expect(
            yield* Effect.flip(
              gateway.asMember(workspace.id, ownerIdentity, add(missing, humanId)),
            ),
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
          expect(
            yield* Effect.flip(run(badMembership, owner, add(group.id, humanId))),
          ).toMatchObject({ _tag: "GroupMembershipApplication.InvalidResponse" });
          const foreignStore = {
            ...bound,
            context: Context.add(bound.context, GroupMembershipStore.Service, {
              ...bound.groupMemberships,
              workspaceId: otherWorkspaceId,
            }),
          };
          expect(
            yield* Effect.flip(run(foreignStore, owner, add(group.id, humanId))),
          ).toMatchObject({ _tag: "GroupMembershipApplication.InvalidResponse" });
          expect(yield* history(bound)).toEqual(before);
          expect(yield* bound.groupMemberships.listByGroup(group.id)).toEqual([]);
        }),
      ),
    ),
  );
});
