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
  GroupFacts,
  GroupMembership,
  GroupMembershipFacts,
  GroupMembershipProjection,
  GroupMembershipStore,
  GroupPermissions,
  GroupProjection,
  GroupStore,
} from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Journal, Log, Publication } from "@amends/core/journal";
import { Member, MemberFacts } from "@amends/core/workspace";
import { Context, DateTime, Effect, Option, Ref } from "effect";
import { SqlClient } from "effect/unstable/sql";
import {
  temporary as withDatabase,
  boundTo,
  initialized,
  inDatabase,
  core,
  type Bound,
  workspaceId,
  otherWorkspaceId,
  testProvenance,
} from "./support.ts";

const journalId = Log.Id.make("journal");
const memberId = Member.Id.make("group-member");
const agentId = Member.Id.make("group-agent");
const memberIdentity = Identity.MemberReference.cases.Human.make({
  id: Identity.HumanId.make("group-human"),
});
const asActor = <A, E, R>(program: Effect.Effect<A, E, R>, actor: Actor.Value) =>
  program.pipe(Effect.provideService(Actor.Service, actor));
const create = (memberIds: ReadonlyArray<Member.Id>, name = "Engineering") =>
  Effect.flatMap(GroupApplication.Service, (service) =>
    service.createPrivateTeam({ name, memberIds }),
  );
const prepare = Effect.fnUntraced(function* () {
  const bound = yield* boundTo(workspaceId);
  const workspace = yield* initialized(bound);
  const owner = Actor.Value.make({
    workspaceId,
    memberId: workspace.ownerMemberId,
    identity: { _tag: "Human", id: workspace.createdBy },
  });
  yield* Effect.gen(function* () {
    const journal = yield* Journal.Service;
    yield* journal.commit(
      Effect.gen(function* () {
        yield* journal.publish(MemberFacts.Added, {
          workspaceId,
          memberId,
          identity: memberIdentity,
        });
        yield* journal.publish(MemberFacts.Added, {
          workspaceId,
          memberId: agentId,
          identity: { _tag: "Agent", id: Identity.AgentId.make("group-agent") },
        });
      }),
    );
  }).pipe(
    Effect.provideService(Publication.Service, testProvenance()),
    Effect.provide(core(bound)),
  );
  return {
    bound,
    workspace,
    owner,
    actor: Actor.Value.make({ workspaceId, memberId, identity: memberIdentity }),
  };
});
const publish = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
  program.pipe(
    Effect.provideService(Publication.Service, testProvenance()),
    Effect.provide(core(bound)),
  );
const history = (bound: Bound) => bound.store.read(journalId, { limit: 100 });

it.effect("creates a private team and explicit initial memberships in one attributed commit", () =>
  withDatabase((location) =>
    inDatabase(
      location,
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
          expect(yield* bound.groupMemberships.findActive(group.id, membership.memberId)).toEqual(
            Option.some(membership),
          );
        }
        expect(yield* bound.groupMemberships.findActive(group.id, owner.memberId)).toEqual(
          Option.none(),
        );
        const batches = yield* Effect.flatMap(Journal.Service, (journal) =>
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
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, actor, owner } = yield* prepare();
        const call = (who: Actor.Value) =>
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
            const journal = yield* Journal.Service;
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
          Effect.flatMap(Journal.Service, (journal) =>
            journal.publish(RoleFacts.PermissionsChanged, { workspaceId, roleId, permissions: [] }),
          ),
        );
        expect(yield* Effect.flip(call(actor))).toMatchObject({ _tag: "Authorization.Denied" });
        yield* publish(
          bound,
          Effect.flatMap(Journal.Service, (journal) =>
            journal.publish(AssignmentFacts.Created, {
              assignmentId: Assignment.Id.make("direct-create"),
              workspaceId,
              memberId,
              source: {
                _tag: "Direct",
                grant: Grant.make(GroupPermissions.Create, { _tag: "Workspace", workspaceId }),
              },
            }),
          ),
        );
        expect((yield* call(actor)).createdBy).toBe(memberId);
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
        expect(yield* Effect.flip(call(owner))).toMatchObject({ _tag: "Authorization.Denied" });
      }),
    ),
  ),
);

it.effect("invalid initial audiences and names cannot leave group facts or rows", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, owner } = yield* prepare();
        const foreign = yield* boundTo(otherWorkspaceId);
        const other = yield* initialized(foreign);
        yield* publish(
          bound,
          Effect.flatMap(Journal.Service, (journal) =>
            journal.publish(MemberFacts.Removed, { workspaceId, memberId: agentId }),
          ),
        );
        const before = yield* history(bound);
        for (const [ids, tag] of [
          [[memberId, Member.Id.make("absent")], "GroupApplication.MemberNotFound"],
          [[memberId, other.ownerMemberId], "GroupApplication.MemberNotFound"],
          [[memberId, agentId], "GroupApplication.InactiveMember"],
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
        const sql = yield* SqlClient.SqlClient;
        expect(yield* sql.unsafe("SELECT id FROM groups")).toEqual([]);
        expect(yield* sql.unsafe("SELECT id FROM group_memberships")).toEqual([]);
        const empty = yield* asActor(create([]), owner).pipe(Effect.provide(core(bound)));
        expect(yield* bound.groupMemberships.listByGroup(empty.id)).toEqual([]);
      }),
    ),
  ),
);

it.effect(
  "a failure after the first admission rolls back the group, memberships, facts, and checkpoints",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare();
          const before = yield* history(bound);
          const observed = yield* Ref.make(Option.none<Group.Record>());
          const failure = new GroupMembershipStore.Failure({
            operation: "insert",
            cause: "injected second admission failure",
          });
          const broken = {
            ...bound,
            context: bound.context.pipe(
              Context.add(GroupStore.Service, {
                ...bound.groups,
                insert: (group) =>
                  Ref.set(observed, Option.some(group)).pipe(
                    Effect.andThen(bound.groups.insert(group)),
                  ),
              }),
              Context.add(GroupMembershipStore.Service, {
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
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, owner } = yield* prepare();
        const before = yield* history(bound);
        const observed = yield* Ref.make(Option.none<Group.Record>());
        const cancelled = asActor(
          Effect.gen(function* () {
            const journal = yield* Journal.Service;
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
            const journal = yield* Journal.Service;
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
    withDatabase((location) =>
      Effect.gen(function* () {
        const saved = yield* inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner } = yield* prepare();
            const group = yield* asActor(create([memberId, agentId]), owner).pipe(
              Effect.provide(core(bound)),
            );
            const memberships = yield* bound.groupMemberships.listByGroup(group.id);
            yield* publish(
              bound,
              Effect.gen(function* () {
                const journal = yield* Journal.Service;
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
        );
        yield* inDatabase(
          location,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const foreign = yield* boundTo(otherWorkspaceId);
            expect(yield* bound.groups.get(saved.group.id)).toEqual(Option.some(saved.group));
            expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toEqual(
              saved.memberships,
            );
            expect(yield* foreign.groups.get(saved.group.id)).toEqual(Option.none());
            expect(yield* foreign.groupMemberships.listByGroup(saved.group.id)).toEqual([]);
            const sql = yield* SqlClient.SqlClient;
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* sql.unsafe("DELETE FROM group_memberships");
                yield* sql.unsafe("DELETE FROM groups");
                yield* sql.unsafe(
                  "DELETE FROM checkpoints WHERE name IN ('groups', 'group.memberships')",
                );
              }),
            );
            yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
              Effect.provide(core(bound)),
            );
            expect(yield* bound.groups.get(saved.group.id)).toEqual(Option.some(saved.group));
            expect(yield* bound.groupMemberships.listByGroup(saved.group.id)).toEqual(
              saved.memberships,
            );
            expect(yield* history(bound)).toEqual(saved.history);
          }),
        );
      }),
    ),
);

it.effect(
  "group stores reject invalid records and enforce admission uniqueness and workspace references",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
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
          } satisfies Group.Record;
          const admission = {
            id: GroupMembership.Id.make("admission"),
            workspaceId,
            groupId: group.id,
            memberId,
            status: "active",
            admittedAt: group.createdAt,
          } satisfies GroupMembership.Record;
          yield* bound.store.transaction(
            Effect.gen(function* () {
              for (const invalid of [
                { ...group, name: "" },
                { ...group, workspaceId: otherWorkspaceId },
                { ...group, createdBy: other.ownerMemberId },
              ]) {
                expect(yield* Effect.flip(bound.groups.insert(invalid))).toMatchObject({
                  _tag: "GroupStore.Conflict",
                });
                expect(yield* bound.groups.get(group.id)).toEqual(Option.none());
              }
              yield* bound.groups.insert(group);
              for (const invalid of [
                { ...admission, memberId: other.ownerMemberId },
                { ...admission, groupId: Group.Id.make("missing") },
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
