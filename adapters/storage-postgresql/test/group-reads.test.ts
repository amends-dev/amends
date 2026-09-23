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
import { Gateway } from "@amends/gateway";
import { Context, Effect, Option } from "effect";
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
  replacing,
} from "./support.ts";

const { available, withDatabase } = setup();

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
const getForManagement = (id: Group.Id) =>
  Effect.flatMap(GroupApplication.Service, (service) => service.getForManagement(id));
/** The actor's readable groups as records; activity and following have their own tests. */
const mine = Effect.flatMap(GroupApplication.Service, (service) =>
  Effect.map(service.listMine, (items) => items.map((item) => item.group)),
);
const roster = (id: Group.Id) =>
  Effect.flatMap(GroupMembershipApplication.Service, (service) => service.listCurrent(id));
const rosterForManagement = (id: Group.Id) =>
  Effect.flatMap(GroupMembershipApplication.Service, (service) =>
    service.listCurrentForManagement(id),
  );
const create = (name: string, memberIds: ReadonlyArray<Member.Id>) =>
  Effect.flatMap(GroupApplication.Service, (service) =>
    service.createPrivateTeam({ name, memberIds }),
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

describe.skipIf(!available)("PostgreSQL group reads", () => {
  it.effect(
    "default Viewer reads only its own groups; lists are stable and current rosters include human and agent admissions",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
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
                    roleId: BuiltinRoles.ViewerId,
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
            // Creation and broad owner grants do not establish audience membership.
            expect(yield* run(bound, owner, mine)).toEqual([]);
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
      withDatabase((location) =>
        inDatabase(
          location,
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
    "management reads inspect only known authorized targets and never establish ordinary read or audience access",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, reader, owner, first, second, hidden } = yield* prepare();
            yield* grant(bound, readerId, GroupMembershipPermissions.Manage, hidden.id);
            expect(yield* run(bound, reader, getForManagement(hidden.id))).toEqual(hidden);
            expect(
              (yield* run(bound, reader, rosterForManagement(hidden.id))).map(
                (value) => value.memberId,
              ),
            ).toEqual([otherId]);
            expect(yield* run(bound, reader, mine)).toEqual([]);
            expect(yield* Effect.flip(run(bound, reader, get(hidden.id)))).toMatchObject({
              _tag: "GroupApplication.NotFound",
            });
            expect(yield* Effect.flip(run(bound, reader, roster(hidden.id)))).toMatchObject({
              _tag: "GroupMembershipApplication.GroupNotFound",
            });
            for (const id of [first.id, second.id]) {
              expect(yield* Effect.flip(run(bound, reader, getForManagement(id)))).toMatchObject({
                _tag: "Authorization.Denied",
              });
              expect(yield* Effect.flip(run(bound, reader, rosterForManagement(id)))).toMatchObject(
                { _tag: "Authorization.Denied" },
              );
            }
            const before = yield* history(bound);
            expect(yield* run(bound, owner, getForManagement(hidden.id))).toEqual(hidden);
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
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            expectTypeOf<Extract<Core.Operations, GroupAudience.Service>>().toEqualTypeOf<never>();
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
      withDatabase((location) =>
        Effect.gen(function* () {
          const gateway = yield* Gateway.Service;
          const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("owner"), {
            name: "Workspace",
          });
          const foreign = yield* gateway.createWorkspace(Identity.HumanId.make("foreign-owner"), {
            name: "Foreign",
          });
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
          for (const id of [foreignGroup.id, Group.Id.make("missing")]) {
            expect(
              yield* Effect.flip(
                gateway.asMember(workspace.id, ownerIdentity, getForManagement(id)),
              ),
            ).toEqual(new GroupApplication.NotFound({ groupId: id }));
            expect(
              yield* Effect.flip(
                gateway.asMember(workspace.id, ownerIdentity, rosterForManagement(id)),
              ),
            ).toEqual(new GroupMembershipApplication.GroupNotFound({ groupId: id }));
          }
        }).pipe(Effect.provide(host(location))),
      ),
  );

  it.effect(
    "one constructed service observes departure, readmission, role revocation, and workspace removal",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, reader, owner, first, second } = yield* prepare();
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
                expect((yield* groups.listMine).map((item) => item.group)).toEqual([second]);
                expect(yield* Effect.flip(groups.get(first.id))).toMatchObject({
                  _tag: "GroupApplication.NotFound",
                });
                expect(yield* Effect.flip(audience.require(first.id))).toMatchObject({
                  _tag: "GroupAudience.NotMember",
                });
                const fresh = yield* asActor(
                  memberships.add({ groupId: first.id, memberId: readerId }),
                  owner,
                );
                expect(fresh.id).not.toBe(original.id);
                expect(yield* audience.require(first.id)).toEqual(fresh);
                const current = yield* memberships.listCurrent(first.id);
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
                expect((yield* groups.listMine).map((item) => item.group)).toEqual([]);
                expect(yield* Effect.flip(groups.get(first.id))).toMatchObject({
                  _tag: "Authorization.Denied",
                });
                expect(yield* Effect.flip(memberships.listCurrent(first.id))).toMatchObject({
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
                  groups.listMine,
                  groups.get(first.id),
                  memberships.listCurrent(first.id),
                  groups.getForManagement(first.id),
                  memberships.listCurrentForManagement(first.id),
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
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, reader, first } = yield* prepare();
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
                  Effect.Services<GroupApplication.Interface["listMine"]>
                >().toEqualTypeOf<Actor.Service>();
                expectTypeOf<
                  Effect.Services<ReturnType<GroupMembershipApplication.Interface["listCurrent"]>>
                >().toEqualTypeOf<Actor.Service>();
                yield* get(first.id);
                yield* mine;
                yield* roster(first.id);
                yield* (yield* GroupAudience.make()).require(first.id);
                yield* asActor(getForManagement(first.id), owner);
                yield* asActor(rosterForManagement(first.id), owner);
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
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, reader, first, second } = yield* prepare();
            yield* grant(bound, readerId, GroupPermissions.Read);
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
                        const fresh = yield* asActor(add(first.id, readerId), owner);
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
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, reader, first } = yield* prepare();
            yield* grant(bound, readerId, GroupPermissions.Read);
            const old = yield* run(bound, owner, add(first.id, otherId));
            yield* run(bound, actorFor(otherId), leave(old));
            const fresh = yield* run(bound, owner, add(first.id, otherId));
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
            expect(yield* run(bound, owner, rosterForManagement(first.id))).toEqual(current);
            expect(yield* Effect.flip(run(bound, actorFor(agentId), get(first.id)))).toMatchObject({
              _tag: "Authorization.InvalidActor",
            });
          }),
        ),
      ),
  );

  it.effect("management revocation and invalid actors are checked again on every read", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, reader, first, hidden } = yield* prepare();
          yield* grant(bound, readerId, GroupMembershipPermissions.Manage, hidden.id);
          yield* grant(bound, readerId, GroupPermissions.Read, first.id);
          yield* run(
            bound,
            reader,
            Effect.gen(function* () {
              const groups = yield* GroupApplication.Service;
              const memberships = yield* GroupMembershipApplication.Service;
              expect(yield* groups.getForManagement(hidden.id)).toEqual(hidden);
              yield* publish(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(AssignmentFacts.Revoked, {
                    workspaceId,
                    assignmentId: Assignment.Id.make(
                      `${readerId}-${GroupMembershipPermissions.Manage.name}-${hidden.id}`,
                    ),
                  }),
                ),
              );
              expect(yield* Effect.flip(groups.getForManagement(hidden.id))).toMatchObject({
                _tag: "Authorization.Denied",
              });
              expect(
                yield* Effect.flip(memberships.listCurrentForManagement(hidden.id)),
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
                groups.listMine,
                groups.get(first.id),
                memberships.listCurrent(first.id),
                groups.getForManagement(hidden.id),
                memberships.listCurrentForManagement(hidden.id),
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
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, reader, owner, first, second } = yield* prepare();
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
            expect(
              yield* Effect.flip(run(wrongGroup, owner, getForManagement(first.id))),
            ).toMatchObject({ _tag: "GroupApplication.InvalidResponse" });
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
                }),
              };
              expect(yield* Effect.flip(run(broken, reader, roster(first.id)))).toMatchObject({
                _tag: "GroupMembershipApplication.InvalidResponse",
              });
              expect(
                yield* Effect.flip(run(broken, owner, rosterForManagement(first.id))),
              ).toMatchObject({ _tag: "GroupMembershipApplication.InvalidResponse" });
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
});
