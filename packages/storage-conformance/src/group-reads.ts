import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type * as Core from "@amends/core";
import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  Role,
  RoleFacts,
  type Permission,
} from "@amends/core/authorization";
import {
  Group,
  GroupApplication,
  GroupAudience,
  GroupMembership,
  GroupMembershipApplication,
  GroupMembershipPermissions,
  GroupMembershipStore,
  GroupPermissions,
  GroupStore,
} from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Member, MemberApplication, MemberFacts, MemberStore } from "@amends/core/workspace";
import { ThreadApplication } from "@amends/core/thread";
import { Gateway } from "@amends/gateway";
import { Context, Effect, Option } from "effect";
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

/** Group reads: audience, rosters, management reads, and paging. */

export const groupReads = (harness: Harness) => {
  const { core, initialized, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: group reads`, () => {
    const readerId = Member.Id.make("reader");
    const otherId = Member.Id.make("other");
    const agentId = Member.Id.make("agent");
    const readerIdentity = Identity.MemberReference.cases.Human.make({
      id: Identity.HumanId.make("reader"),
    });
    const actorFor = (memberId: Member.Id, ws = workspaceId) =>
      Actor.Value.make({
        workspaceId: ws,
        memberId,
        identity:
          memberId === agentId
            ? { _tag: "Agent", id: Identity.AgentId.make("agent") }
            : { _tag: "Human", id: Identity.HumanId.make(memberId) },
      });
    const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor.Value) =>
      effect.pipe(Effect.provideService(Actor.Service, actor));
    const run = <A, E, R>(bound: Bound, actor: Actor.Value, effect: Effect.Effect<A, E, R>) =>
      asActor(effect, actor).pipe(Effect.provide(core(bound)));
    const publish = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
        Effect.provide(core(bound)),
      );
    const get = (id: Group.Id) =>
      Effect.flatMap(GroupApplication.Service, (service) => service.get(id));
    const rename = (id: Group.Id, name: string, expectedName: string) =>
      Effect.flatMap(GroupApplication.Service, (service) =>
        service.rename({ groupId: id, name, expectedName }),
      );
    const publicGroups = Effect.flatMap(GroupApplication.Service, (service) =>
      service.listPublic({ limit: 100 }),
    );
    /** The actor's readable groups as records; activity and following have their own tests. */
    const mine = Effect.flatMap(GroupApplication.Service, (service) =>
      Effect.map(service.listMine({ limit: 100 }), (items) => items.map((item) => item.group)),
    );
    const roster = (id: Group.Id) =>
      Effect.flatMap(GroupMembershipApplication.Service, (service) =>
        service.listCurrent(id, { limit: 100 }),
      );
    const join = (id: Group.Id) =>
      Effect.flatMap(GroupMembershipApplication.Service, (service) => service.join(id));
    const removeMember = (groupId: Group.Id, membershipId: GroupMembership.Id) =>
      Effect.flatMap(GroupMembershipApplication.Service, (service) =>
        service.remove({ groupId, membershipId }),
      );
    const create = (name: string, memberIds: ReadonlyArray<Member.Id>) =>
      Effect.flatMap(GroupApplication.Service, (service) =>
        service.createTeam({ name, memberIds }),
      );
    const add = (groupId: Group.Id, memberId: Member.Id) =>
      Effect.flatMap(GroupMembershipApplication.Service, (service) =>
        service.add({ groupId, memberId }),
      );
    const leave = (membership: GroupMembership.Record) =>
      Effect.flatMap(GroupMembershipApplication.Service, (service) =>
        service.leave({ groupId: membership.groupId, membershipId: membership.id }),
      );
    const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 100 });
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
                  identity: actorFor(memberId).identity,
                });
            }),
          ),
        ),
      );
    const grant = (
      bound: Bound,
      memberId: Member.Id,
      permission: Permission.Definition,
      groupId?: Group.Id,
    ) =>
      publish(
        bound,
        Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(AssignmentFacts.Created, {
            workspaceId: bound.workspace.workspaceId,
            assignmentId: Assignment.Id.make(
              `${memberId}-${permission.name}-${groupId ?? "workspace"}`,
            ),
            memberId,
            source: {
              _tag: "Direct",
              grant: Grant.make(
                permission,
                groupId === undefined
                  ? { _tag: "Workspace", workspaceId: bound.workspace.workspaceId }
                  : {
                      _tag: "Target",
                      target: { _tag: "Group", workspaceId: bound.workspace.workspaceId, groupId },
                    },
              ),
            },
          }),
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
      const first = yield* run(bound, owner, create("Engineering", [readerId, agentId]));
      const second = yield* run(bound, owner, create("Design", [readerId]));
      const hidden = yield* run(bound, owner, create("Private", [otherId]));
      return {
        bound,
        owner,
        first,
        second,
        hidden,
        reader: actorFor(readerId),
        agent: actorFor(agentId),
      };
    });

    it.effect(
      "default Viewer reads only its own groups; lists are stable and current rosters include human and agent admissions",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, reader, first, second, hidden } = yield* prepare();
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make("viewer"),
                    memberId: readerId,
                    source: {
                      _tag: "Role",
                      roleId: BuiltinRoles.MemberId,
                      scope: { _tag: "Workspace", workspaceId },
                    },
                  }),
                ),
              );
              const before = yield* history(bound);
              expect(yield* run(bound, reader, mine)).toEqual(
                [first, second].toSorted((a, b) => (a.id < b.id ? -1 : 1)),
              );
              expect(yield* run(bound, reader, get(first.id))).toEqual(first);
              const memberships = yield* bound.groupMemberships.listByGroup(first.id);
              expect(yield* run(bound, reader, roster(first.id))).toEqual(memberships);
              expect(memberships.map((value) => value.memberId).sort()).toEqual(
                [agentId, readerId].sort(),
              );
              // Creation and broad owner grants do not establish audience membership: the owner is
              // only in the workspace's general group.
              expect((yield* run(bound, owner, mine)).map((group) => group.id)).toEqual([
                Group.GeneralId,
              ]);
              for (const who of [reader, owner])
                expect(yield* Effect.flip(run(bound, who, get(hidden.id)))).toEqual(
                  new GroupApplication.NotFound({ groupId: hidden.id }),
                );
              expect(yield* Effect.flip(run(bound, reader, roster(hidden.id)))).toEqual(
                new GroupMembershipApplication.GroupNotFound({ groupId: hidden.id }),
              );
              expect(yield* history(bound)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect(
      "group-read grants are scoped, independent of membership, and sufficient without member-read grants",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, agent, first, second, hidden } = yield* prepare();
              expect(yield* run(bound, reader, mine)).toEqual([]);
              expect(yield* Effect.flip(run(bound, reader, get(first.id)))).toMatchObject({
                _tag: "Authorization.Denied",
                requirement: { permission: { name: "group.read" } },
              });
              yield* grant(bound, readerId, GroupPermissions.Read, first.id);
              yield* grant(bound, agentId, GroupPermissions.Read);
              expect(yield* run(bound, reader, mine)).toEqual([first]);
              expect(yield* run(bound, reader, roster(first.id))).toHaveLength(2);
              expect(yield* run(bound, agent, mine)).toEqual([first]);
              expect(yield* run(bound, agent, get(first.id))).toEqual(first);
              expect(yield* Effect.flip(run(bound, reader, get(second.id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
              yield* grant(bound, readerId, GroupPermissions.Read, hidden.id);
              expect(yield* Effect.flip(run(bound, reader, get(hidden.id)))).toMatchObject({
                _tag: "GroupApplication.NotFound",
              });
              expect(yield* run(bound, reader, mine)).toEqual([first]);
            }),
          ),
        ),
    );

    it.effect(
      "no grant reaches a private or direct group from outside it: not the owner's, not a direct one",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, owner, hidden } = yield* prepare();
              // The reader holds every group permission across the workspace, directly.
              for (const permission of [
                GroupPermissions.Read,
                GroupPermissions.Rename,
                GroupPermissions.Moderate,
                GroupMembershipPermissions.Manage,
                GroupMembershipPermissions.Join,
              ])
                yield* grant(bound, readerId, permission);
              const direct = {
                id: Group.Id.make("direct-others"),
                workspaceId,
                kind: "Direct",
                memberIds: Group.directMembers([otherId, agentId]),
                createdBy: otherId,
                createdAt: hidden.createdAt,
              } satisfies Group.Record;
              yield* bound.store.transaction(bound.groups.insert(direct));
              const [admission] = yield* bound.groupMemberships.listActiveByMember(otherId);
              const before = yield* history(bound);
              // Neither the reader nor the owner, who holds every built-in group permission, can
              // see, rename, join, or change a group they are not in; to them it is missing.
              for (const outsider of [reader, owner]) {
                expect(yield* run(bound, outsider, mine)).not.toContainEqual(hidden);
                for (const id of [hidden.id, direct.id]) {
                  expect(yield* Effect.flip(run(bound, outsider, get(id)))).toMatchObject({
                    _tag: "GroupApplication.NotFound",
                  });
                  expect(yield* Effect.flip(run(bound, outsider, roster(id)))).toMatchObject({
                    _tag: "GroupMembershipApplication.GroupNotFound",
                  });
                  expect(
                    yield* Effect.flip(run(bound, outsider, add(id, outsider.memberId))),
                  ).toMatchObject({ _tag: "GroupMembershipApplication.GroupNotFound" });
                  expect(yield* Effect.flip(run(bound, outsider, join(id)))).toMatchObject({
                    _tag: "GroupMembershipApplication.GroupNotFound",
                  });
                }
                expect(
                  yield* Effect.flip(run(bound, outsider, rename(hidden.id, "Mine", "Private"))),
                ).toMatchObject({ _tag: "GroupApplication.NotFound" });
                expect(
                  yield* Effect.flip(run(bound, outsider, removeMember(hidden.id, admission!.id))),
                ).toMatchObject({ _tag: "GroupMembershipApplication.GroupNotFound" });
                expect(
                  (yield* run(bound, outsider, publicGroups)).map((item) => item.group.id),
                ).not.toContain(hidden.id);
              }
              expect(yield* history(bound)).toEqual(before);
              expect(yield* bound.groupMemberships.findActive(hidden.id, owner.memberId)).toEqual(
                Option.none(),
              );
            }),
          ),
        ),
    );

    it.effect(
      "the reusable audience check needs no action grant and has no management or ownership bypass",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              expectTypeOf<
                Extract<Core.Operations, GroupAudience.Service>
              >().toEqualTypeOf<never>();
              expectTypeOf<
                Effect.Services<ReturnType<GroupAudience.Interface["require"]>>
              >().toEqualTypeOf<Actor.Service>();
              const { bound, reader, owner, first, hidden } = yield* prepare();
              yield* run(
                bound,
                reader,
                Effect.gen(function* () {
                  const audience = yield* GroupAudience.make();
                  expect(yield* audience.require(first.id)).toEqual(
                    Option.getOrThrow(yield* bound.groupMemberships.findActive(first.id, readerId)),
                  );
                  expect(yield* Effect.flip(audience.require(hidden.id))).toEqual(
                    new GroupAudience.NotMember({ groupId: hidden.id }),
                  );
                  expect(yield* Effect.flip(asActor(audience.require(first.id), owner))).toEqual(
                    new GroupAudience.NotMember({ groupId: first.id }),
                  );
                }),
              );
            }),
          ),
        ),
    );

    it.effect(
      "missing and foreign groups share the same ordinary read outcome, including through the gateway",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const gateway = yield* Gateway.Service;
              const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("owner"), {
                name: "Workspace",
              });
              const foreign = yield* gateway.createWorkspace(
                Identity.HumanId.make("foreign-owner"),
                {
                  name: "Foreign",
                },
              );
              const bound = yield* boundTo(workspace.id);
              yield* seed(bound);
              const foreignIdentity = Identity.MemberReference.cases.Human.make({
                id: foreign.createdBy,
              });
              const ownerIdentity = Identity.MemberReference.cases.Human.make({
                id: workspace.createdBy,
              });
              const hidden = yield* gateway.asMember(
                workspace.id,
                ownerIdentity,
                create("Hidden", [otherId]),
              );
              const foreignGroup = yield* gateway.asMember(
                foreign.id,
                foreignIdentity,
                create("Foreign", [foreign.ownerMemberId]),
              );
              for (const id of [hidden.id, foreignGroup.id, Group.Id.make("missing")]) {
                expect(
                  yield* Effect.flip(gateway.asMember(workspace.id, readerIdentity, get(id))),
                ).toEqual(new GroupApplication.NotFound({ groupId: id }));
                expect(
                  yield* Effect.flip(gateway.asMember(workspace.id, readerIdentity, roster(id))),
                ).toEqual(new GroupMembershipApplication.GroupNotFound({ groupId: id }));
              }
              // The owner, outside all three, finds none of them either.
              for (const id of [hidden.id, foreignGroup.id, Group.Id.make("missing")])
                expect(
                  yield* Effect.flip(gateway.asMember(workspace.id, ownerIdentity, get(id))),
                ).toEqual(new GroupApplication.NotFound({ groupId: id }));
            }),
          ),
        ),
    );

    it.effect(
      "one constructed service observes departure, readmission, role revocation, and workspace removal",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, owner, first, second } = yield* prepare();
              // The agent, a member of the group, readmits the reader; only members manage it.
              yield* grant(bound, agentId, GroupMembershipPermissions.Manage, first.id);
              const roleId = Role.Id.make("group-reader");
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.commit(
                    Effect.gen(function* () {
                      yield* journal.publish(RoleFacts.Created, {
                        workspaceId,
                        roleId,
                        name: "Reader",
                        permissions: [GroupPermissions.Read.name],
                      });
                      yield* journal.publish(AssignmentFacts.Created, {
                        workspaceId,
                        assignmentId: Assignment.Id.make("reader-role"),
                        memberId: readerId,
                        source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId } },
                      });
                    }),
                  ),
                ),
              );
              yield* run(
                bound,
                reader,
                Effect.gen(function* () {
                  const groups = yield* GroupApplication.Service;
                  const memberships = yield* GroupMembershipApplication.Service;
                  const members = yield* MemberApplication.Service;
                  const audience = yield* GroupAudience.make();
                  const journal = yield* Journal.Service;
                  const original = yield* audience.require(first.id);
                  expect(yield* groups.get(first.id)).toEqual(first);
                  yield* memberships.leave({ groupId: first.id, membershipId: original.id });
                  expect(
                    (yield* groups.listMine({ limit: 100 })).map((item) => item.group),
                  ).toEqual([second]);
                  expect(yield* Effect.flip(groups.get(first.id))).toMatchObject({
                    _tag: "GroupApplication.NotFound",
                  });
                  expect(yield* Effect.flip(audience.require(first.id))).toMatchObject({
                    _tag: "GroupAudience.NotMember",
                  });
                  const fresh = yield* asActor(
                    memberships.add({ groupId: first.id, memberId: readerId }),
                    actorFor(agentId),
                  );
                  expect(fresh.id).not.toBe(original.id);
                  expect(yield* audience.require(first.id)).toEqual(fresh);
                  const current = yield* memberships.listCurrent(first.id, { limit: 100 });
                  expect(current.some((value) => value.id === original.id)).toBe(false);
                  expect(current.some((value) => value.id === fresh.id)).toBe(true);
                  const permissions = (names: ReadonlyArray<Permission.Name>) =>
                    journal
                      .publish(RoleFacts.PermissionsChanged, {
                        workspaceId,
                        roleId,
                        permissions: names,
                      })
                      .pipe(Publication.withActor);
                  yield* asActor(permissions([]), owner);
                  expect(
                    (yield* groups.listMine({ limit: 100 })).map((item) => item.group),
                  ).toEqual([]);
                  expect(yield* Effect.flip(groups.get(first.id))).toMatchObject({
                    _tag: "Authorization.Denied",
                  });
                  expect(
                    yield* Effect.flip(memberships.listCurrent(first.id, { limit: 100 })),
                  ).toMatchObject({
                    _tag: "Authorization.Denied",
                  });
                  expect(yield* audience.require(first.id)).toEqual(fresh);
                  yield* asActor(permissions([GroupPermissions.Read.name]), owner);
                  yield* asActor(members.remove(readerId), owner);
                  const checks: ReadonlyArray<
                    Effect.Effect<
                      unknown,
                      | GroupApplication.ReadError
                      | GroupMembershipApplication.ReadError
                      | GroupAudience.Error,
                      Actor.Service
                    >
                  > = [
                    groups.listMine({ limit: 100 }),
                    groups.get(first.id),
                    memberships.listCurrent(first.id, { limit: 100 }),
                    audience.require(first.id),
                  ];
                  for (const effect of checks) {
                    expect(yield* Effect.flip(effect)).toMatchObject({
                      _tag: "Authorization.InvalidActor",
                    });
                  }
                }),
              );
            }),
          ),
        ),
    );

    it.effect(
      "reads and audience policy never open a writer transaction or advance checkpoints",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, first } = yield* prepare();
              yield* grant(bound, readerId, GroupPermissions.Read);
              const before = yield* history(bound);
              const readsOnly = {
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
                readsOnly,
                reader,
                Effect.gen(function* () {
                  expectTypeOf<
                    Effect.Services<ReturnType<GroupApplication.Interface["get"]>>
                  >().toEqualTypeOf<Actor.Service>();
                  expectTypeOf<
                    Effect.Services<ReturnType<GroupApplication.Interface["listMine"]>>
                  >().toEqualTypeOf<Actor.Service>();
                  expectTypeOf<
                    Effect.Services<ReturnType<GroupMembershipApplication.Interface["listCurrent"]>>
                  >().toEqualTypeOf<Actor.Service>();
                  yield* get(first.id);
                  yield* mine;
                  yield* roster(first.id);
                  yield* (yield* GroupAudience.make()).require(first.id);
                }),
              );
              expect(yield* history(bound)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect(
      "reads honor staged departures, admissions, and grant changes and an outer rollback restores them",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, reader, first, second } = yield* prepare();
              yield* grant(bound, readerId, GroupPermissions.Read);
              yield* grant(bound, agentId, GroupMembershipPermissions.Manage, first.id);
              const old = Option.getOrThrow(
                yield* bound.groupMemberships.findActive(first.id, readerId),
              );
              const before = yield* history(bound);
              expect(
                yield* Effect.flip(
                  run(
                    bound,
                    reader,
                    Effect.flatMap(Journal.Service, (journal) =>
                      journal.commit(
                        Effect.gen(function* () {
                          yield* leave(old);
                          expect(yield* mine).toEqual([second]);
                          expect(yield* Effect.flip(get(first.id))).toMatchObject({
                            _tag: "GroupApplication.NotFound",
                          });
                          const fresh = yield* asActor(add(first.id, readerId), actorFor(agentId));
                          expect(yield* get(first.id)).toEqual(first);
                          expect(
                            (yield* roster(first.id)).some((value) => value.id === fresh.id),
                          ).toBe(true);
                          yield* asActor(
                            journal
                              .publish(AssignmentFacts.Revoked, {
                                workspaceId,
                                assignmentId: Assignment.Id.make(
                                  `${readerId}-${GroupPermissions.Read.name}-workspace`,
                                ),
                                memberId: readerId,
                              })
                              .pipe(Publication.withActor),
                            owner,
                          );
                          expect(yield* mine).toEqual([]);
                          expect(yield* Effect.flip(roster(first.id))).toMatchObject({
                            _tag: "Authorization.Denied",
                          });
                          return yield* Effect.fail("rollback");
                        }),
                      ),
                    ),
                  ),
                ),
              ).toBe("rollback");
              expect(yield* history(bound)).toEqual(before);
              expect(yield* bound.groupMemberships.findActive(first.id, readerId)).toEqual(
                Option.some(old),
              );
              expect(yield* run(bound, reader, get(first.id))).toEqual(first);
            }),
          ),
        ),
    );

    it.effect(
      "current rosters exclude ended admissions and inactive workspace members without exposing membership history",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, first } = yield* prepare();
              yield* grant(bound, readerId, GroupPermissions.Read);
              // The agent, a member of the group, manages it; only members do.
              yield* grant(bound, agentId, GroupMembershipPermissions.Manage, first.id);
              const manager = actorFor(agentId);
              const old = yield* run(bound, manager, add(first.id, otherId));
              yield* run(bound, actorFor(otherId), leave(old));
              const fresh = yield* run(bound, manager, add(first.id, otherId));
              // Replay/storage may contain an admission whose member was independently removed.
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(MemberFacts.Removed, { workspaceId, memberId: agentId }),
                ),
              );
              const current = yield* run(bound, reader, roster(first.id));
              expect(current.map((value) => value.memberId).sort()).toEqual(
                [readerId, otherId].sort(),
              );
              expect(current.some((value) => value.id === old.id)).toBe(false);
              expect(current.some((value) => value.id === fresh.id)).toBe(true);
              expect(
                yield* Effect.flip(run(bound, actorFor(agentId), get(first.id))),
              ).toMatchObject({
                _tag: "Authorization.InvalidActor",
              });
            }),
          ),
        ),
    );

    it.effect("each listed group says whether the reader may manage its members", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, reader, first, second } = yield* prepare();
            for (const groupId of [first.id, second.id])
              yield* grant(bound, readerId, GroupPermissions.Read, groupId);
            const manageable = (actor: Actor.Value) =>
              run(
                bound,
                actor,
                Effect.flatMap(GroupApplication.Service, (service) =>
                  Effect.map(service.listMine({ limit: 100 }), (items) =>
                    Object.fromEntries(
                      items.map((item) => [
                        item.group.kind === "Team" ? item.group.name : item.group.id,
                        item.manageable,
                      ]),
                    ),
                  ),
                ),
              );
            // Reading a group is not managing it.
            expect(yield* manageable(reader)).toEqual({ Engineering: false, Design: false });
            // A grant for one group covers that group only.
            yield* grant(bound, readerId, GroupMembershipPermissions.Manage, first.id);
            expect(yield* manageable(reader)).toEqual({ Engineering: true, Design: false });
            yield* grant(bound, readerId, GroupMembershipPermissions.Manage);
            expect(yield* manageable(reader)).toEqual({ Engineering: true, Design: true });
            // Renaming is its own permission, listed beside managing members.
            const renamable = run(
              bound,
              reader,
              Effect.flatMap(GroupApplication.Service, (service) =>
                Effect.map(service.listMine({ limit: 100 }), (items) =>
                  items.map((item) => item.renamable),
                ),
              ),
            );
            expect(yield* renamable).toEqual([false, false]);
            yield* grant(bound, readerId, GroupPermissions.Rename, first.id);
            expect((yield* renamable).filter(Boolean)).toHaveLength(1);
            // Nobody manages a direct group's members, owners included.
            yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadApplication.Service, (threads) =>
                threads.startDirect({ memberIds: [readerId], text: "Hello", mentions: [] }),
              ),
            );
            const listed = yield* run(
              bound,
              owner,
              Effect.flatMap(GroupApplication.Service, (service) =>
                service.listMine({ limit: 100 }),
              ),
            );
            // The direct group, then the general group, whose members the owner manages.
            expect(listed.map((item) => [item.group.kind, item.manageable])).toEqual([
              ["Direct", false],
              ["Team", true],
            ]);
          }),
        ),
      ),
    );

    it.effect("read revocation and invalid actors are checked again on every read", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, reader, first } = yield* prepare();
            yield* grant(bound, readerId, GroupPermissions.Read, first.id);
            yield* run(
              bound,
              reader,
              Effect.gen(function* () {
                const groups = yield* GroupApplication.Service;
                const memberships = yield* GroupMembershipApplication.Service;
                expect(yield* groups.get(first.id)).toEqual(first);
                yield* publish(
                  bound,
                  Effect.flatMap(Journal.Service, (journal) =>
                    journal.publish(AssignmentFacts.Revoked, {
                      workspaceId,
                      assignmentId: Assignment.Id.make(
                        `${readerId}-${GroupPermissions.Read.name}-${first.id}`,
                      ),
                      memberId: readerId,
                    }),
                  ),
                );
                expect(yield* Effect.flip(groups.get(first.id))).toMatchObject({
                  _tag: "Authorization.Denied",
                });
                expect(
                  yield* Effect.flip(memberships.listCurrent(first.id, { limit: 100 })),
                ).toMatchObject({ _tag: "Authorization.Denied" });
                const impostor = Actor.Value.make({
                  workspaceId,
                  memberId: readerId,
                  identity: { _tag: "Human", id: Identity.HumanId.make("impostor") },
                });
                const checks: ReadonlyArray<
                  Effect.Effect<
                    unknown,
                    | GroupApplication.ReadError
                    | GroupMembershipApplication.ReadError
                    | GroupAudience.Error,
                    Actor.Service
                  >
                > = [
                  groups.listMine({ limit: 100 }),
                  groups.get(first.id),
                  memberships.listCurrent(first.id, { limit: 100 }),
                ];
                for (const effect of checks) {
                  expect(yield* Effect.flip(asActor(effect, impostor))).toMatchObject({
                    _tag: "Authorization.InvalidActor",
                    reason: "identity-mismatch",
                  });
                }
                expect(
                  yield* Effect.flip(
                    asActor(groups.get(first.id), actorFor(readerId, otherWorkspaceId)),
                  ),
                ).toMatchObject({ _tag: "Authorization.WorkspaceMismatch" });
              }),
            );
          }),
        ),
      ),
    );

    it.effect(
      "malformed audience, group, and roster responses fail closed instead of widening reads",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, reader, first, second } = yield* prepare();
              yield* grant(bound, readerId, GroupPermissions.Read);
              const admission = Option.getOrThrow(
                yield* bound.groupMemberships.findActive(first.id, readerId),
              );
              const before = yield* history(bound);
              for (const wrong of [
                Object.assign({}, admission, { groupId: second.id }),
                Object.assign({}, admission, { workspaceId: otherWorkspaceId }),
                Object.assign({}, admission, { memberId: otherId }),
                Object.assign({}, admission, { status: "removed" as const }),
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, GroupMembershipStore.Service, {
                    ...bound.groupMemberships,
                    findActive: () => Effect.succeedSome(wrong),
                  }),
                };
                expect(yield* Effect.flip(run(broken, reader, get(first.id)))).toMatchObject({
                  _tag: "GroupAudience.InvalidResponse",
                });
                expect(yield* Effect.flip(run(broken, reader, roster(first.id)))).toMatchObject({
                  _tag: "GroupAudience.InvalidResponse",
                });
              }
              for (const records of [
                [Object.assign({}, admission, { memberId: otherId })],
                [Object.assign({}, admission, { status: "removed" as const })],
                [Object.assign({}, admission, { workspaceId: otherWorkspaceId })],
                [admission, admission],
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, GroupMembershipStore.Service, {
                    ...bound.groupMemberships,
                    listActiveByMember: () => Effect.succeed(records),
                    pageActiveByMember: () => Effect.succeed(records),
                  }),
                };
                expect(yield* Effect.flip(run(broken, reader, mine))).toMatchObject({
                  _tag: "GroupApplication.InvalidResponse",
                });
              }
              const wrongGroup = {
                ...bound,
                context: Context.add(bound.context, GroupStore.Service, {
                  ...bound.groups,
                  get: () => Effect.succeedSome(second),
                }),
              };
              expect(yield* Effect.flip(run(wrongGroup, reader, get(first.id)))).toMatchObject({
                _tag: "GroupApplication.InvalidResponse",
              });
              for (const records of [
                [Object.assign({}, admission, { groupId: second.id })],
                [Object.assign({}, admission, { workspaceId: otherWorkspaceId })],
                [admission, admission],
                [
                  admission,
                  Object.assign({}, admission, { id: GroupMembership.Id.make("duplicate-active") }),
                ],
              ]) {
                const broken = {
                  ...bound,
                  context: Context.add(bound.context, GroupMembershipStore.Service, {
                    ...bound.groupMemberships,
                    listByGroup: () => Effect.succeed(records),
                    pageActiveByGroup: () => Effect.succeed(records),
                  }),
                };
                expect(yield* Effect.flip(run(broken, reader, roster(first.id)))).toMatchObject({
                  _tag: "GroupMembershipApplication.InvalidResponse",
                });
              }
              const wrongMember = {
                ...bound,
                context: Context.add(bound.context, MemberStore.Service, {
                  ...bound.members,
                  ...replacing(bound.members, agentId, yield* bound.members.get(otherId)),
                }),
              };
              expect(yield* Effect.flip(run(wrongMember, reader, roster(first.id)))).toMatchObject({
                _tag: "GroupMembershipApplication.InvalidResponse",
              });
              const failed = {
                ...bound,
                context: Context.add(bound.context, GroupStore.Service, {
                  ...bound.groups,
                  get: () =>
                    Effect.fail(
                      new GroupStore.Failure({ operation: "get", cause: "failed storage" }),
                    ),
                  getMany: () =>
                    Effect.fail(
                      new GroupStore.Failure({ operation: "getMany", cause: "failed storage" }),
                    ),
                }),
              };
              expect(yield* Effect.flip(run(failed, reader, mine))).toMatchObject({
                _tag: "GroupStore.Failure",
              });
              expect(yield* history(bound)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect("group lists and rosters page in ID order and skip what the reader cannot see", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, reader, first, second } = yield* prepare();
            const third = yield* run(
              bound,
              owner,
              create("Operations", [readerId, otherId, agentId]),
            );
            const ids = [first.id, second.id, third.id].toSorted((a, b) => (a < b ? -1 : 1));
            const page = (options: Group.ListOptions) =>
              run(
                bound,
                reader,
                Effect.flatMap(GroupApplication.Service, (s) =>
                  Effect.map(s.listMine(options), (items) => items.map((item) => item.group.id)),
                ),
              );
            // Only the last group is readable at first; the page reads past the others to fill.
            yield* grant(bound, readerId, GroupPermissions.Read, ids[2]);
            expect(yield* page({ limit: 1 })).toEqual([ids[2]]);
            yield* grant(bound, readerId, GroupPermissions.Read);
            expect(yield* page({ limit: 2 })).toEqual(ids.slice(0, 2));
            expect(yield* page({ after: ids[1]!, limit: 2 })).toEqual([ids[2]]);
            expect(yield* page({ after: ids[2]!, limit: 2 })).toEqual([]);
            // Rosters page by admission ID.
            const admissions = (yield* bound.groupMemberships.listByGroup(third.id)).toSorted(
              (a, b) => (a.id < b.id ? -1 : 1),
            );
            const rosterPage = (options: GroupMembership.ListOptions) =>
              run(
                bound,
                reader,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  Effect.map(s.listCurrent(third.id, options), (items) =>
                    items.map((item) => item.id),
                  ),
                ),
              );
            const admissionIds = admissions.map((admission) => admission.id);
            expect(yield* rosterPage({ limit: 2 })).toEqual(admissionIds.slice(0, 2));
            expect(yield* rosterPage({ after: admissionIds[1]!, limit: 2 })).toEqual(
              admissionIds.slice(2),
            );
            // Members who leave the workspace drop out of the roster.
            yield* run(
              bound,
              owner,
              Effect.flatMap(MemberApplication.Service, (s) => s.remove(otherId)),
            );
            expect(yield* rosterPage({ limit: 3 })).toEqual(
              admissions
                .filter((admission) => admission.memberId !== otherId)
                .map((admission) => admission.id),
            );
          }),
        ),
      ),
    );
  });
};
