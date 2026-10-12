import { describe, expect, it } from "@effect/vitest";
import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  Role,
  RoleFacts,
} from "@amends-dev/core/authorization";
import {
  Group,
  GroupService,
  GroupFacts,
  GroupMembership,
  GroupMembershipService,
  GroupMembershipFacts,
  GroupMembershipProjection,
  GroupMembershipStore,
  GroupPermissions,
  GroupProjection,
  GroupStore,
} from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Journal, Log, Publication, Store } from "@amends-dev/core/journal";
import { Member, MemberFacts } from "@amends-dev/core/workspace";
import { Context, DateTime, Effect, Option, Ref } from "effect";
import * as Support from "./support.ts";
import {
  type Bound,
  boundTo,
  otherWorkspaceId,
  runHost,
  testProvenance,
  workspaceId,
} from "./support.ts";
import { withStorage } from "./fixture.ts";

/** Private team and direct group creation, storage constraints, and replay. */

const { core, initialized } = Support;
describe("groups", () => {
  const journalId = Log.Id.make("journal");
  const memberId = Member.Id.make("group-member");
  const agentId = Member.Id.make("group-agent");
  const memberIdentity = Identity.MemberReference.cases.Human.make({
    id: Identity.HumanId.make("group-human"),
  });
  const asActor = <A, E, R>(program: Effect.Effect<A, E, R>, actor: Actor.Actor["Service"]) =>
    program.pipe(Effect.provideService(Actor.Actor, actor));
  const create = (memberIds: ReadonlyArray<Member.Id>, name = "Engineering") =>
    Effect.flatMap(GroupService.GroupService, (groupService) =>
      groupService.createTeam({ name, memberIds }),
    );
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId);
    const workspace = yield* initialized(bound);
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy },
    });
    yield* Effect.gen(function* () {
      const journal = yield* Journal.Journal;
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(MemberFacts.Added, {
            workspaceId,
            memberId,
            identity: memberIdentity,
            name: Member.Name.make(memberIdentity.id),
          });
          yield* journal.publish(MemberFacts.Added, {
            workspaceId,
            memberId: agentId,
            identity: { _tag: "Agent", id: Identity.AgentId.make("group-agent") },
            name: Member.Name.make("group-agent"),
          });
        }),
      );
    }).pipe(
      Effect.provideService(Publication.Publication, testProvenance()),
      Effect.provide(core(bound)),
    );
    return {
      bound,
      workspace,
      owner,
      actor: Actor.Actor.of({ workspaceId, memberId, identity: memberIdentity }),
    };
  });
  const publish = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
    program.pipe(
      Effect.provideService(Publication.Publication, testProvenance()),
      Effect.provide(core(bound)),
    );
  const history = (bound: Bound) => bound.store.read(journalId, { limit: 100 });

  it.effect(
    "creates a private team and explicit initial memberships in one attributed commit",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner } = yield* prepare();
            const before = yield* history(bound);
            const group = yield* asActor(create([memberId, agentId]), owner).pipe(
              Effect.provide(core(bound)),
            );
            expect(group).toMatchObject({
              workspaceId,
              kind: "Team",
              visibility: "Private",
              name: "Engineering",
              createdBy: owner.memberId,
            });
            expect(yield* bound.groups.get(group.id)).toEqual(Option.some(group));
            const memberships = yield* bound.groupMemberships.listByGroup(group.id);
            expect(memberships.map((membership) => membership.memberId).sort()).toEqual(
              [memberId, agentId].sort(),
            );
            expect(new Set(memberships.map(({ id }) => id)).size).toBe(2);
            for (const membership of memberships) {
              expect(membership).toMatchObject({
                workspaceId,
                groupId: group.id,
                status: "active",
                admittedAt: group.createdAt,
              });
              expect(
                yield* bound.groupMemberships.findActive(group.id, membership.memberId),
              ).toEqual(Option.some(membership));
            }
            expect(yield* bound.groupMemberships.findActive(group.id, owner.memberId)).toEqual(
              Option.none(),
            );
            const batches = yield* Effect.flatMap(Journal.Journal, (journal) =>
              journal.log.read({ limit: 100 }),
            ).pipe(Effect.provide(core(bound)));
            const last = batches.at(-1);
            expect(batches).toHaveLength(before.length + 1);
            expect(last?.entries.map(({ payload }) => payload.name)).toEqual([
              GroupFacts.Created.name,
              GroupMembershipFacts.Added.name,
              GroupMembershipFacts.Added.name,
            ]);
            expect(last?.entries[0]?.payload.provenance.performedBy).toEqual({
              _tag: "Member",
              memberId: owner.memberId,
              identity: owner.identity,
            });
            expect(last?.entries[1]?.payload.provenance.causedBy?.id).toBe(last?.entries[0]?.id);
          }),
        ),
      ),
  );

  it.effect("creation follows live custom-role and direct permissions rather than role names", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, actor, owner } = yield* prepare();
          const call = (who: Actor.Actor["Service"]) =>
            asActor(create([memberId]), who).pipe(Effect.provide(core(bound)));
          const before = yield* history(bound);
          expect(yield* Effect.flip(call(actor))).toMatchObject({
            _tag: "Authorization.Denied",
            requirement: { permission: { name: GroupPermissions.Create.name } },
          });
          expect(yield* history(bound)).toEqual(before);
          const roleId = Role.Id.make("contributor");
          yield* publish(
            bound,
            Effect.gen(function* () {
              const journal = yield* Journal.Journal;
              yield* journal.commit(
                Effect.gen(function* () {
                  yield* journal.publish(RoleFacts.Created, {
                    roleId,
                    workspaceId,
                    name: "Contributor",
                    permissions: [GroupPermissions.Create.name],
                  });
                  yield* journal.publish(AssignmentFacts.Created, {
                    assignmentId: Assignment.Id.make("contributor-assignment"),
                    workspaceId,
                    memberId,
                    source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId } },
                  });
                }),
              );
            }),
          );
          expect((yield* call(actor)).createdBy).toBe(memberId);
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId,
                permissions: [],
              }),
            ),
          );
          expect(yield* Effect.flip(call(actor))).toMatchObject({
            _tag: "Authorization.Denied",
          });
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(AssignmentFacts.Created, {
                assignmentId: Assignment.Id.make("direct-create"),
                workspaceId,
                memberId,
                source: {
                  _tag: "Direct",
                  grant: Grant.make(GroupPermissions.Create, {
                    _tag: "Workspace",
                    workspaceId,
                  }),
                },
              }),
            ),
          );
          expect((yield* call(actor)).createdBy).toBe(memberId);
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId: BuiltinRoles.OwnerId,
                permissions: [],
              }),
            ),
          );
          expect(yield* Effect.flip(call(owner))).toMatchObject({
            _tag: "Authorization.Denied",
          });
        }),
      ),
    ),
  );

  it.effect("invalid initial audiences and names cannot leave group facts or rows", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare();
          const foreign = yield* boundTo(otherWorkspaceId);
          const other = yield* initialized(foreign);
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(MemberFacts.Removed, { workspaceId, memberId: agentId }),
            ),
          );
          const before = yield* history(bound);
          const footprint = yield* storage.footprint;
          for (const [ids, tag] of [
            [[memberId, Member.Id.make("absent")], "GroupService.MemberNotFound"],
            [[memberId, other.ownerMemberId], "GroupService.MemberNotFound"],
            [[memberId, agentId], "GroupService.InactiveMember"],
            [[memberId, memberId], "SchemaError"],
          ] as const) {
            expect(
              yield* Effect.flip(asActor(create(ids), owner).pipe(Effect.provide(core(bound)))),
            ).toMatchObject({ _tag: tag });
          }
          for (const name of ["", "   ", " untrimmed "])
            expect(
              yield* Effect.flip(
                asActor(create([memberId], name), owner).pipe(Effect.provide(core(bound))),
              ),
            ).toMatchObject({ _tag: "SchemaError" });
          expect(yield* history(bound)).toEqual(before);
          expect(yield* storage.footprint).toBe(footprint);
          const empty = yield* asActor(create([]), owner).pipe(Effect.provide(core(bound)));
          expect(yield* bound.groupMemberships.listByGroup(empty.id)).toEqual([]);
        }),
      ),
    ),
  );

  it.effect(
    "a failure after the first admission rolls back the group, memberships, facts, and checkpoints",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner } = yield* prepare();
            const before = yield* history(bound);
            const observed = yield* Ref.make(Option.none<Group.Group>());
            const failure = new GroupMembershipStore.Failure({
              operation: "insert",
              cause: "injected second admission failure",
            });
            const broken = {
              ...bound,
              context: bound.context.pipe(
                Context.add(GroupStore.GroupStore, {
                  ...bound.groups,
                  insert: (group) =>
                    Ref.set(observed, Option.some(group)).pipe(
                      Effect.andThen(bound.groups.insert(group)),
                    ),
                }),
                Context.add(GroupMembershipStore.GroupMembershipStore, {
                  ...bound.groupMemberships,
                  insert: (membership) =>
                    membership.memberId === agentId
                      ? Effect.fail(failure)
                      : bound.groupMemberships.insert(membership),
                }),
              ),
            };
            const checkpoints = yield* Effect.forEach(
              [GroupProjection.definition, GroupMembershipProjection.definition],
              (definition) =>
                bound.checkpoints.get({
                  logId: journalId,
                  name: definition.name,
                  version: definition.version,
                }),
            );
            expect(
              yield* Effect.flip(
                asActor(create([memberId, agentId]), owner).pipe(Effect.provide(core(broken))),
              ),
            ).toMatchObject({ _tag: "Projection.Failure", cause: failure });
            const group = yield* Ref.get(observed);
            if (Option.isNone(group)) return yield* Effect.die("Group insert was not attempted");
            expect(yield* bound.groups.get(group.value.id)).toEqual(Option.none());
            expect(yield* bound.groupMemberships.listByGroup(group.value.id)).toEqual([]);
            expect(yield* history(bound)).toEqual(before);
            expect(
              yield* Effect.forEach(
                [GroupProjection.definition, GroupMembershipProjection.definition],
                (definition) =>
                  bound.checkpoints.get({
                    logId: journalId,
                    name: definition.name,
                    version: definition.version,
                  }),
              ),
            ).toEqual(checkpoints);
          }),
        ),
      ),
  );

  it.effect("creation joins an outer transaction and sees its staged permission revocation", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare();
          const before = yield* history(bound);
          const observed = yield* Ref.make(Option.none<Group.Group>());
          const cancelled = asActor(
            Effect.gen(function* () {
              const journal = yield* Journal.Journal;
              return yield* journal.commit(
                Effect.gen(function* () {
                  const group = yield* create([memberId]);
                  yield* Ref.set(observed, Option.some(group));
                  return yield* Effect.fail("cancel outer workflow");
                }),
              );
            }),
            owner,
          ).pipe(Effect.provide(core(bound)));
          expect(yield* Effect.flip(cancelled)).toBe("cancel outer workflow");
          const group = yield* Ref.get(observed);
          if (Option.isNone(group)) return yield* Effect.die("Creation did not run");
          expect(yield* bound.groups.get(group.value.id)).toEqual(Option.none());
          expect(yield* history(bound)).toEqual(before);
          const revoked = asActor(
            Effect.gen(function* () {
              const journal = yield* Journal.Journal;
              return yield* journal.commit(
                Effect.gen(function* () {
                  yield* journal.publish(RoleFacts.PermissionsChanged, {
                    workspaceId,
                    roleId: BuiltinRoles.OwnerId,
                    permissions: [],
                  });
                  return yield* create([memberId]);
                }).pipe(Publication.withActor),
              );
            }),
            owner,
          ).pipe(Effect.provide(core(bound)));
          expect(yield* Effect.flip(revoked)).toMatchObject({ _tag: "Authorization.Denied" });
          expect(yield* history(bound)).toEqual(before);
        }),
      ),
    ),
  );

  it.effect(
    "reopening and replay preserve identities and timestamps without rechecking current authority",
    () =>
      withStorage((storage) =>
        Effect.gen(function* () {
          const saved = yield* Effect.scoped(
            runHost(
              storage,
              Effect.gen(function* () {
                const { bound, owner } = yield* prepare();
                const group = yield* asActor(create([memberId, agentId]), owner).pipe(
                  Effect.provide(core(bound)),
                );
                const memberships = yield* bound.groupMemberships.listByGroup(group.id);
                yield* publish(
                  bound,
                  Effect.gen(function* () {
                    const journal = yield* Journal.Journal;
                    yield* journal.publish(MemberFacts.Removed, { workspaceId, memberId });
                    yield* journal.publish(RoleFacts.PermissionsChanged, {
                      workspaceId,
                      roleId: BuiltinRoles.OwnerId,
                      permissions: [],
                    });
                  }),
                );
                return { group, memberships, history: yield* history(bound) };
              }),
            ),
          );
          yield* Effect.scoped(
            runHost(
              storage,
              Effect.gen(function* () {
                const bound = yield* boundTo(workspaceId);
                const foreign = yield* boundTo(otherWorkspaceId);
                expect(yield* bound.groups.get(saved.group.id)).toEqual(Option.some(saved.group));
                expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toEqual(
                  saved.memberships,
                );
                expect(yield* foreign.groups.get(saved.group.id)).toEqual(Option.none());
                expect(yield* foreign.groupMemberships.listByGroup(saved.group.id)).toEqual([]);
                yield* storage.discardProjections;
                yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
                  Effect.provide(core(bound)),
                );
                expect(yield* bound.groups.get(saved.group.id)).toEqual(Option.some(saved.group));
                expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toEqual(
                  saved.memberships,
                );
                expect(yield* history(bound)).toEqual(saved.history);
              }),
            ),
          );
        }),
      ),
  );

  it.effect("group stores reject invalid or foreign records and enforce admission uniqueness", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare();
          const foreign = yield* boundTo(otherWorkspaceId);
          const other = yield* initialized(foreign);
          const group = {
            id: Group.Id.make("stored-group"),
            workspaceId,
            kind: "Team",
            visibility: "Private",
            name: "Stored",
            createdBy: owner.memberId,
            createdAt: DateTime.makeUnsafe("2026-09-21T12:00:00.123Z"),
          } satisfies Group.Group;
          const admission = {
            id: GroupMembership.Id.make("admission"),
            workspaceId,
            groupId: group.id,
            memberId,
            status: "active",
            admittedAt: group.createdAt,
          } satisfies GroupMembership.GroupMembership;
          yield* bound.store.transaction(
            Effect.gen(function* () {
              for (const invalid of [
                { ...group, name: "" },
                { ...group, workspaceId: otherWorkspaceId },
              ]) {
                expect(yield* Effect.flip(bound.groups.insert(invalid))).toMatchObject({
                  _tag: "GroupStore.Conflict",
                });
                expect(yield* bound.groups.get(group.id)).toEqual(Option.none());
              }
              yield* bound.groups.insert(group);
              for (const invalid of [
                { ...admission, workspaceId: otherWorkspaceId },
                { ...admission, status: "removed" as const },
              ]) {
                expect(yield* Effect.flip(bound.groupMemberships.insert(invalid))).toMatchObject({
                  _tag: "GroupMembershipStore.Conflict",
                });
                expect(yield* bound.groupMemberships.get(admission.id)).toEqual(Option.none());
              }
              yield* bound.groupMemberships.insert(admission);
            }),
          );
          expect(
            yield* Effect.flip(bound.store.transaction(bound.groups.insert(group))),
          ).toMatchObject({ _tag: "GroupStore.Conflict" });
          for (const duplicate of [
            admission,
            { ...admission, id: GroupMembership.Id.make("another-admission") },
          ])
            expect(
              yield* Effect.flip(bound.store.transaction(bound.groupMemberships.insert(duplicate))),
            ).toMatchObject({ _tag: "GroupMembershipStore.Conflict" });
          expect(yield* bound.groupMemberships.listByGroup(group.id)).toEqual([admission]);
          yield* foreign.store.transaction(
            foreign.groups.insert({
              ...group,
              workspaceId: otherWorkspaceId,
              createdBy: other.ownerMemberId,
            }),
          );
          expect(yield* foreign.groupMemberships.get(admission.id)).toEqual(Option.none());
        }),
      ),
    ),
  );

  it.effect("direct groups keep a fixed member set that resolves to one group", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, actor } = yield* prepare();
          const createdAt = DateTime.makeUnsafe("2026-09-21T12:00:00.123Z");
          const direct = {
            id: Group.Id.make("direct-group"),
            workspaceId,
            kind: "Direct",
            memberIds: Group.directMembers([memberId, owner.memberId]),
            createdBy: owner.memberId,
            createdAt,
          } satisfies Group.Group;
          const admissions = direct.memberIds.map((id) => ({
            id: GroupMembership.Id.make(`direct-${id}`),
            workspaceId,
            groupId: direct.id,
            memberId: id,
            admittedAt: createdAt,
            status: "active" as const,
          }));
          yield* bound.store.transaction(
            Effect.gen(function* () {
              for (const invalid of [
                { ...direct, memberIds: [owner.memberId] },
                { ...direct, memberIds: [...direct.memberIds].reverse() },
                { ...direct, memberIds: [owner.memberId, owner.memberId] },
                { ...direct, createdBy: agentId },
              ])
                expect(yield* Effect.flip(bound.groups.insert(invalid))).toMatchObject({
                  _tag: "GroupStore.Conflict",
                });
              yield* bound.groups.insert(direct);
              for (const admission of admissions) yield* bound.groupMemberships.insert(admission);
            }),
          );
          expect(yield* bound.groups.get(direct.id)).toEqual(Option.some(direct));
          expect(yield* bound.groups.findDirect([owner.memberId, memberId, memberId])).toEqual(
            Option.some(direct),
          );
          expect(yield* bound.groups.findDirect([owner.memberId, agentId])).toEqual(Option.none());
          // The same members cannot name a second direct group; a team with them is unrelated.
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                bound.groups.insert({ ...direct, id: Group.Id.make("second-direct") }),
              ),
            ),
          ).toMatchObject({ _tag: "GroupStore.Conflict" });
          const team = yield* asActor(create([owner.memberId, memberId]), owner).pipe(
            Effect.provide(core(bound)),
          );
          expect(yield* bound.groups.findDirect([owner.memberId, memberId])).toEqual(
            Option.some(direct),
          );
          expect(team.kind).toBe("Team");
          const fixed = {
            _tag: "GroupMembershipService.FixedMembership",
            groupId: direct.id,
          };
          const memberships = (
            program: (
              service: GroupMembershipService.GroupMembershipService["Service"],
            ) => Effect.Effect<unknown, unknown, Actor.Actor>,
            as: Actor.Actor["Service"],
          ) =>
            asActor(
              Effect.flatMap(GroupMembershipService.GroupMembershipService, program),
              as,
            ).pipe(Effect.provide(core(bound)), Effect.flip);
          expect(
            yield* memberships(
              (service) => service.add({ groupId: direct.id, memberId: agentId }),
              owner,
            ),
          ).toMatchObject(fixed);
          expect(
            yield* memberships(
              (service) => service.remove({ groupId: direct.id, membershipId: admissions[0]!.id }),
              owner,
            ),
          ).toMatchObject(fixed);
          const own = admissions.find((admission) => admission.memberId === memberId)!;
          expect(
            yield* memberships(
              (service) => service.leave({ groupId: direct.id, membershipId: own.id }),
              actor,
            ),
          ).toMatchObject(fixed);
          expect(yield* bound.groupMemberships.listByGroup(direct.id)).toEqual(
            [...admissions].sort((left, right) => (left.id < right.id ? -1 : 1)),
          );
        }),
      ),
    ),
  );

  it.effect("renaming a team group records one attributed fact that replay applies", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, actor } = yield* prepare();
          // Only its members rename a group, so the owner creates it with themselves in it.
          const group = yield* asActor(create([memberId, owner.memberId]), owner).pipe(
            Effect.provide(core(bound)),
          );
          const rename = (
            by: Actor.Actor["Service"],
            groupId: Group.Id,
            name: string,
            expectedName: string = "Engineering",
          ) =>
            asActor(
              Effect.flatMap(GroupService.GroupService, (groupService) =>
                groupService.rename({ groupId, name, expectedName }),
              ),
              by,
            ).pipe(Effect.provide(core(bound)));
          const before = yield* history(bound);
          // Only a member granted group.rename may rename; belonging to the group is not enough.
          expect(yield* Effect.flip(rename(actor, group.id, "Platform"))).toMatchObject({
            _tag: "Authorization.Denied",
          });
          const renamed = yield* rename(owner, group.id, "Platform");
          expect(renamed).toEqual({ ...group, name: "Platform" });
          expect(yield* bound.groups.get(group.id)).toEqual(Option.some(renamed));
          const batches = yield* Effect.flatMap(Journal.Journal, (journal) =>
            journal.log.read({ limit: 100 }),
          ).pipe(Effect.provide(core(bound)));
          expect(batches).toHaveLength(before.length + 1);
          const entry = batches.at(-1)?.entries[0];
          expect(entry?.payload.name).toBe(GroupFacts.Renamed.name);
          expect(entry?.payload.provenance.performedBy).toMatchObject({
            _tag: "Member",
            memberId: owner.memberId,
          });
          // The same name again records nothing, whatever name the renamer last saw.
          expect(yield* rename(owner, group.id, "Platform")).toEqual(renamed);
          expect(yield* history(bound)).toHaveLength(before.length + 1);
          // Another name from a renamer who last saw the old one would replace a rename made
          // meanwhile, so it is refused, and nothing is recorded; from the current one, it is not.
          expect(yield* Effect.flip(rename(owner, group.id, "Design"))).toMatchObject({
            _tag: "GroupService.Changed",
            groupId: group.id,
          });
          expect(yield* history(bound)).toHaveLength(before.length + 1);
          expect(yield* rename(owner, group.id, "Engineering", "Platform")).toEqual(group);
          expect(yield* history(bound)).toHaveLength(before.length + 2);
          yield* rename(owner, group.id, "Platform");
          // A name must have text without surrounding space, and the group must exist.
          for (const name of ["", " Platform"])
            expect((yield* Effect.flip(rename(owner, group.id, name)))._tag).toBe("SchemaError");
          expect(
            yield* Effect.flip(rename(owner, Group.Id.make("missing"), "Platform")),
          ).toMatchObject({ _tag: "GroupService.NotFound" });
          // A direct group is named by its members.
          const direct = {
            id: Group.Id.make("direct-group"),
            workspaceId,
            kind: "Direct",
            memberIds: Group.directMembers([memberId, owner.memberId]),
            createdBy: owner.memberId,
            createdAt: group.createdAt,
          } satisfies Group.Group;
          yield* bound.store.transaction(
            Effect.all([
              bound.groups.insert(direct),
              bound.groupMemberships.insert({
                id: GroupMembership.Id.make("direct-owner"),
                workspaceId,
                groupId: direct.id,
                memberId: owner.memberId,
                admittedAt: group.createdAt,
                status: "active",
              }),
            ]),
          );
          expect(yield* Effect.flip(rename(owner, direct.id, "Pair"))).toMatchObject({
            _tag: "GroupService.NotRenamable",
          });
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                bound.groups.rename({ workspaceId, groupId: direct.id, name: "Pair" }),
              ),
            ),
          ).toMatchObject({ _tag: "GroupStore.Conflict", operation: "rename" });
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                bound.groups.rename({
                  workspaceId: otherWorkspaceId,
                  groupId: group.id,
                  name: "Elsewhere",
                }),
              ),
            ),
          ).toMatchObject({ _tag: "GroupStore.Conflict", operation: "rename" });
          // Rebuilding from the journal keeps the latest name.
          yield* storage.discardProjections;
          yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
            Effect.provide(core(bound)),
          );
          expect(yield* bound.groups.get(group.id)).toEqual(Option.some(renamed));
        }),
      ),
    ),
  );

  it.effect("group latest activity only moves forward and belongs to an existing group", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare();
          const group = yield* asActor(create([memberId]), owner).pipe(Effect.provide(core(bound)));
          const at = (iso: string) => ({
            groupId: group.id,
            occurredAt: DateTime.makeUnsafe(iso),
          });
          const missing = Group.Id.make("missing");
          expect(yield* bound.groups.getLatest([group.id, missing])).toEqual([]);
          const write = <A, E, R>(program: Effect.Effect<A, E, R>) =>
            bound.store.transaction(program);
          yield* write(bound.groups.recordLatest(at("2026-09-23T12:00:00.000Z")));
          // An earlier or equal time changes nothing.
          for (const earlier of ["2026-09-23T11:00:00.000Z", "2026-09-23T12:00:00.000Z"]) {
            yield* write(bound.groups.recordLatest(at(earlier)));
            expect(yield* bound.groups.getLatest([group.id, missing])).toEqual([
              at("2026-09-23T12:00:00.000Z"),
            ]);
          }
          yield* write(bound.groups.recordLatest(at("2026-09-23T13:00:00.000Z")));
          expect(yield* bound.groups.getLatest([group.id])).toEqual([
            at("2026-09-23T13:00:00.000Z"),
          ]);
          expect(
            yield* Effect.flip(
              write(
                bound.groups.recordLatest({
                  groupId: missing,
                  occurredAt: DateTime.makeUnsafe("2026-09-23T14:00:00.000Z"),
                }),
              ),
            ),
          ).toMatchObject({ _tag: "GroupStore.Conflict", operation: "recordLatest" });
          // Recording requires the workspace transaction.
          expect(
            yield* Effect.flip(
              bound.groups
                .recordLatest(at("2026-09-23T15:00:00.000Z"))
                .pipe(Effect.provide(yield* write(Effect.context<Store.Transaction>()))),
            ),
          ).toMatchObject({ _tag: "GroupStore.Failure" });
          expect(yield* (yield* boundTo(otherWorkspaceId)).groups.getLatest([group.id])).toEqual(
            [],
          );
        }),
      ),
    ),
  );
});
