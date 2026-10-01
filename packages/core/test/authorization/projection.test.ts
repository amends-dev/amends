import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { AssignmentFacts } from "../../src/authorization/assignment/facts.ts";
import { AssignmentProjection } from "../../src/authorization/assignment/projection.ts";
import { AssignmentStore } from "../../src/authorization/assignment/store.ts";
import { Assignment } from "../../src/authorization/assignment/assignment.ts";
import { Grant } from "../../src/authorization/grant.ts";
import { RoleFacts } from "../../src/authorization/role/facts.ts";
import { RoleProjection } from "../../src/authorization/role/projection.ts";
import { RoleStore } from "../../src/authorization/role/store.ts";
import { Role } from "../../src/authorization/role/role.ts";
import { Scope } from "../../src/authorization/scope.ts";
import { Target } from "../../src/authorization/target.ts";
import { Identity } from "../../src/identity/identity.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { MemberFacts } from "../../src/workspace/member/facts.ts";
import { MemberPermissions } from "../../src/workspace/member/permissions.ts";
import { MemberProjection } from "../../src/workspace/member/projection.ts";
import { MemberStore } from "../../src/workspace/member/store.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { make, type Fixture } from "../memory-store.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const logId = Log.Id.make("workspace-one/journal");
const roleId = Role.Id.make("manager");
const memberId = Member.Id.make("recipient");
const roleAssignmentId = Assignment.Id.make("role-assignment");
const directAssignmentId = Assignment.Id.make("direct-assignment");
const roleSource = Assignment.Source.cases.Role.make({
  roleId,
  scope: Scope.Value.cases.Workspace.make({ workspaceId }),
});
const directSource = Assignment.Source.cases.Direct.make({
  grant: Grant.make(
    MemberPermissions.Read,
    Scope.Value.cases.Target.make({
      target: Target.Reference.cases.Member.make({
        workspaceId,
        memberId: Member.Id.make("subject"),
      }),
    }),
  ),
});
const createdRole = {
  roleId,
  workspaceId,
  name: "Member manager",
  permissions: [MemberPermissions.Read.name, MemberPermissions.Remove.name],
};
const initialRole = {
  id: roleId,
  workspaceId,
  name: createdRole.name,
  permissions: createdRole.permissions,
};
const assigned = (
  assignmentId: Assignment.Id,
  source: Assignment.Source = roleSource,
  recipient = memberId,
) => ({
  assignmentId,
  workspaceId,
  memberId: recipient,
  source,
});
const setup = Journal.make({
  logId,
  projections: [RoleProjection.definition, AssignmentProjection.definition],
});
const sourceJournal = Journal.make({ logId, projections: [] });
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    | Publication.Service
    | Log.Service
    | Transaction.Service
    | Checkpoint.Service
    | RoleStore.Service
    | AssignmentStore.Service
    | MemberStore.Service
  >,
) =>
  program.pipe(
    Effect.provideService(Publication.Service, testProvenance(workspaceId)),
    Effect.provide(Log.layer),
    Effect.provideService(Store.Service, fixture.store),
    Effect.provideService(Checkpoint.Service, fixture.checkpoints),
    Effect.provideService(RoleStore.Service, fixture.roles(workspaceId)),
    Effect.provideService(AssignmentStore.Service, fixture.assignments(workspaceId)),
    Effect.provideService(MemberStore.Service, fixture.members(workspaceId)),
  );
it.effect(
  "live role and assignment projections preserve role references, queries, and revocation history",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* setup;
          const roles = yield* RoleStore.Service;
          const assignments = yield* AssignmentStore.Service;
          const otherMemberId = Member.Id.make("other-recipient");
          const otherAssignmentId = Assignment.Id.make("other-recipient-assignment");
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(RoleFacts.Created, createdRole);
              yield* journal.publish(AssignmentFacts.Created, assigned(roleAssignmentId));
              yield* journal.publish(
                AssignmentFacts.Created,
                assigned(directAssignmentId, directSource),
              );
              yield* journal.publish(
                AssignmentFacts.Created,
                assigned(otherAssignmentId, roleSource, otherMemberId),
              );
              expect(yield* roles.get(roleId)).toEqual(Option.some(initialRole));
              expect(
                new Set((yield* assignments.listActiveByMember(memberId)).map((a) => a.id)),
              ).toEqual(new Set([roleAssignmentId, directAssignmentId]));
              expect(
                new Set((yield* assignments.listActiveByRole(roleId)).map((a) => a.id)),
              ).toEqual(new Set([roleAssignmentId, otherAssignmentId]));
              expect((yield* fixture.snapshot).roles.size).toBe(0);
              expect((yield* fixture.snapshot).assignments.size).toBe(0);
            }),
          );
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(RoleFacts.Renamed, {
                roleId,
                workspaceId,
                name: "Renamed role",
              });
              yield* journal.publish(RoleFacts.PermissionsChanged, {
                roleId,
                workspaceId,
                permissions: [MemberPermissions.Read.name],
              });
              expect(yield* roles.get(roleId)).toEqual(
                Option.some({
                  ...initialRole,
                  name: "Renamed role",
                  permissions: [MemberPermissions.Read.name],
                }),
              );
              yield* journal.publish(RoleFacts.PermissionsChanged, {
                roleId,
                workspaceId,
                permissions: [],
              });
              yield* journal.publish(AssignmentFacts.Revoked, {
                assignmentId: roleAssignmentId,
                workspaceId,
                memberId: memberId,
              });
              expect((yield* assignments.listActiveByMember(memberId)).map((a) => a.id)).toEqual([
                directAssignmentId,
              ]);
              expect((yield* assignments.listActiveByRole(roleId)).map((a) => a.id)).toEqual([
                otherAssignmentId,
              ]);
            }),
          );
          expect(yield* roles.get(roleId)).toEqual(
            Option.some({ ...initialRole, name: "Renamed role", permissions: [] }),
          );
          expect(yield* assignments.get(roleAssignmentId)).toEqual(
            Option.some({
              id: roleAssignmentId,
              workspaceId,
              memberId,
              source: roleSource,
              status: "revoked",
            }),
          );
          expect(yield* assignments.get(directAssignmentId)).toEqual(
            Option.some({
              id: directAssignmentId,
              workspaceId,
              memberId,
              source: directSource,
              status: "active",
            }),
          );
          const before = yield* fixture.snapshot;
          yield* journal.publish(AssignmentFacts.Created, assigned(roleAssignmentId));
          yield* journal.publish(AssignmentFacts.Revoked, {
            assignmentId: roleAssignmentId,
            workspaceId,
            memberId: memberId,
          });
          expect(yield* fixture.snapshot).toEqual(before);
          yield* journal.publish(
            AssignmentFacts.Created,
            assigned(Assignment.Id.make("reassigned")),
          );
          expect(yield* assignments.listActiveByMember(memberId)).toHaveLength(2);
          yield* journal.replay;
          expect((yield* fixture.snapshot).assignments.size).toBe(4);
        }),
      );
    }),
);

it.effect(
  "fresh projection runners replay both read models and resume at their own checkpoints",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const writer = yield* sourceJournal;
          yield* writer.commit(
            Effect.gen(function* () {
              yield* writer.publish(RoleFacts.Created, createdRole);
              yield* writer.publish(AssignmentFacts.Created, assigned(roleAssignmentId));
              yield* writer.publish(
                AssignmentFacts.Created,
                assigned(directAssignmentId, directSource),
              );
            }),
          );
          const last = yield* writer.commit(
            Effect.gen(function* () {
              yield* writer.publish(RoleFacts.Renamed, {
                roleId,
                workspaceId,
                name: "Replayed role",
              });
              yield* writer.publish(RoleFacts.PermissionsChanged, {
                roleId,
                workspaceId,
                permissions: [],
              });
              return yield* writer.publish(AssignmentFacts.Revoked, {
                assignmentId: roleAssignmentId,
                workspaceId,
                memberId: memberId,
              });
            }),
          );
          expect((yield* fixture.snapshot).roles.size).toBe(0);
          expect((yield* fixture.snapshot).assignments.size).toBe(0);
          yield* (yield* setup).replay;
          expect(yield* (yield* RoleStore.Service).get(roleId)).toEqual(
            Option.some({ ...initialRole, name: "Replayed role", permissions: [] }),
          );
          const assignments = yield* AssignmentStore.Service;
          expect(Option.map(yield* assignments.get(roleAssignmentId), (a) => a.status)).toEqual(
            Option.some("revoked"),
          );
          expect((yield* assignments.listActiveByMember(memberId)).map((a) => a.id)).toEqual([
            directAssignmentId,
          ]);
          for (const definition of [RoleProjection.definition, AssignmentProjection.definition]) {
            expect(
              yield* fixture.checkpoints.get({
                logId,
                name: definition.name,
                version: definition.version,
              }),
            ).toEqual(
              Option.some({
                position: last.position,
                commitId: last.commitId,
                index: last.index,
                entryId: last.id,
              }),
            );
          }
          const before = yield* fixture.snapshot;
          const fresh = yield* setup;
          yield* fresh.replay;
          expect(yield* fixture.snapshot).toEqual(before);
          yield* fresh.publish(RoleFacts.Renamed, { roleId, workspaceId, name: "After catch-up" });
          expect(Option.map(yield* (yield* RoleStore.Service).get(roleId), (r) => r.name)).toEqual(
            Option.some("After catch-up"),
          );
        }),
      );
    }),
);

it.effect(
  "a caught assignment conflict rolls back member, role, assignment, journal, and checkpoint writes",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* Journal.make({
            logId,
            projections: [
              MemberProjection.definition,
              RoleProjection.definition,
              AssignmentProjection.definition,
            ],
          });
          const before = yield* fixture.snapshot;
          const failure = yield* Effect.flip(
            journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(MemberFacts.Added, {
                  memberId,
                  workspaceId,
                  identity: Identity.Reference.cases.Human.make({
                    id: Identity.HumanId.make("human"),
                  }),
                });
                yield* journal.publish(RoleFacts.Created, createdRole);
                yield* journal.publish(AssignmentFacts.Created, assigned(roleAssignmentId));
                yield* journal.publish(RoleFacts.PermissionsChanged, {
                  roleId,
                  workspaceId,
                  permissions: [],
                });
                yield* journal
                  .publish(AssignmentFacts.Created, assigned(roleAssignmentId, directSource))
                  .pipe(Effect.catch(() => Effect.void));
              }),
            ),
          );
          expect(failure._tag).toBe("Commit.Aborted");
          expect(yield* fixture.snapshot).toEqual(before);
        }),
      );
    }),
);

it.effect("a revocation naming another member than its assignment fails without writing", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* setup;
        yield* journal.publish(AssignmentFacts.Created, assigned(roleAssignmentId));
        const before = yield* fixture.snapshot;
        const failure = yield* Effect.flip(
          journal.publish(AssignmentFacts.Revoked, {
            assignmentId: roleAssignmentId,
            workspaceId,
            memberId: Member.Id.make("someone-else"),
          }),
        );
        expect(failure).toMatchObject({
          _tag: "Projection.Failure",
          cause: { _tag: "AssignmentStore.Conflict" },
        });
        expect(yield* fixture.snapshot).toEqual(before);
      }),
    );
  }),
);

it.effect("a failure after both projection writes rolls back the entire live commit", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const failure = new Store.Failure({ operation: "later", cause: "unavailable" });
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* setup;
        const before = yield* fixture.snapshot;
        expect(
          yield* Effect.flip(
            journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(RoleFacts.Created, createdRole);
                yield* journal.publish(AssignmentFacts.Created, assigned(roleAssignmentId));
                // Both projections wrote; a later failure in the commit takes their writes with it.
                return yield* failure;
              }),
            ),
          ),
        ).toBe(failure);
        expect(yield* fixture.snapshot).toEqual(before);
      }),
    );
  }),
);

it.effect("a failed role replay batch restores its prior name, permissions, and checkpoint", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const writer = yield* sourceJournal;
        yield* writer.publish(RoleFacts.Created, createdRole);
        yield* writer.commit(
          Effect.gen(function* () {
            yield* writer.publish(RoleFacts.Renamed, { roleId, workspaceId, name: "Rolled back" });
            yield* writer.publish(RoleFacts.PermissionsChanged, {
              roleId,
              workspaceId,
              permissions: [],
            });
            yield* writer.publish(RoleFacts.Renamed, {
              roleId: Role.Id.make("missing"),
              workspaceId,
              name: "Missing",
            });
          }),
        );
        expect(yield* Effect.flip((yield* setup).replay)).toMatchObject({
          _tag: "Projection.Failure",
          cause: { _tag: "RoleStore.Conflict", operation: "rename" },
        });
        expect(yield* (yield* RoleStore.Service).get(roleId)).toEqual(Option.some(initialRole));
        const cursor = yield* fixture.checkpoints.get({
          logId,
          name: RoleProjection.definition.name,
          version: 1,
        });
        expect(Option.map(cursor, (c) => c.position)).toEqual(Option.some(Log.Position.make(0)));
      }),
    );
  }),
);

it.effect(
  "a failed assignment replay batch restores active access and earlier checkpoint progress",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const writer = yield* sourceJournal;
          yield* writer.publish(AssignmentFacts.Created, assigned(roleAssignmentId));
          yield* writer.commit(
            Effect.gen(function* () {
              yield* writer.publish(AssignmentFacts.Revoked, {
                assignmentId: roleAssignmentId,
                workspaceId,
                memberId: memberId,
              });
              yield* writer.publish(
                AssignmentFacts.Created,
                assigned(directAssignmentId, directSource),
              );
              yield* writer.publish(AssignmentFacts.Revoked, {
                assignmentId: Assignment.Id.make("missing"),
                workspaceId,
                memberId: memberId,
              });
            }),
          );
          expect(yield* Effect.flip((yield* setup).replay)).toMatchObject({
            _tag: "Projection.Failure",
            cause: { _tag: "AssignmentStore.Conflict", operation: "markRevoked" },
          });
          const assignments = yield* AssignmentStore.Service;
          expect((yield* assignments.listActiveByMember(memberId)).map((a) => a.id)).toEqual([
            roleAssignmentId,
          ]);
          expect(yield* assignments.get(directAssignmentId)).toEqual(Option.none());
          const cursor = yield* fixture.checkpoints.get({
            logId,
            name: AssignmentProjection.definition.name,
            version: 1,
          });
          expect(Option.map(cursor, (c) => c.position)).toEqual(Option.some(Log.Position.make(0)));
        }),
      );
    }),
);

it.effect(
  "authorization stores isolate matching IDs across workspaces and copy nested input and output data",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const foreign = Workspace.Id.make("another-workspace");
      yield* run(
        fixture,
        Effect.gen(function* () {
          const roles = yield* RoleStore.Service;
          const assignments = yield* AssignmentStore.Service;
          const permissions = [MemberPermissions.Read.name];
          const target = Target.Reference.cases.Member.make({
            workspaceId,
            memberId: Member.Id.make("subject"),
          });
          const localDirect = Assignment.Source.cases.Direct.make({
            grant: Grant.make(MemberPermissions.Read, Scope.Value.cases.Target.make({ target })),
          });
          yield* fixture.store.transaction(
            Effect.gen(function* () {
              yield* roles.insert({ ...initialRole, permissions });
              yield* assignments.insert({
                id: roleAssignmentId,
                workspaceId,
                memberId,
                source: roleSource,
                status: "active",
              });
              yield* assignments.insert({
                id: directAssignmentId,
                workspaceId,
                memberId,
                source: localDirect,
                status: "active",
              });
              yield* fixture
                .roles(foreign)
                .insert({ ...initialRole, workspaceId: foreign, name: "Foreign role" });
              yield* fixture.assignments(foreign).insert({
                id: roleAssignmentId,
                workspaceId: foreign,
                memberId,
                status: "active",
                source: Assignment.Source.cases.Role.make({
                  roleId,
                  scope: Scope.Value.cases.Workspace.make({ workspaceId: foreign }),
                }),
              });
            }),
          );
          permissions.push(MemberPermissions.Remove.name);
          Reflect.set(target, "memberId", Member.Id.make("mutated-input"));
          const role = yield* roles.get(roleId);
          if (Option.isNone(role)) throw new Error("Missing role");
          expect(role.value.permissions).toEqual([MemberPermissions.Read.name]);
          expect(Option.map(yield* fixture.roles(foreign).get(roleId), (r) => r.name)).toEqual(
            Option.some("Foreign role"),
          );
          Reflect.set(role.value.permissions, 0, MemberPermissions.Remove.name);
          const direct = yield* assignments.get(directAssignmentId);
          expect(Option.map(direct, (a) => a.source)).toEqual(Option.some(directSource));
          if (
            Option.isNone(direct) ||
            direct.value.source._tag !== "Direct" ||
            direct.value.source.grant.scope._tag !== "Target"
          )
            throw new Error("Missing direct target");
          Reflect.set(direct.value.source.grant.scope.target, "workspaceId", foreign);
          const list = yield* assignments.listActiveByMember(memberId);
          expect(list).toHaveLength(2);
          expect(yield* assignments.listActiveByRole(roleId)).toHaveLength(1);
          expect(yield* fixture.assignments(foreign).listActiveByMember(memberId)).toHaveLength(1);
          for (const assignment of list) Reflect.set(assignment, "status", "revoked");
          const byRole = yield* assignments.listActiveByRole(roleId);
          for (const assignment of byRole) {
            if (assignment.source._tag === "Role")
              Reflect.set(assignment.source.scope, "workspaceId", foreign);
          }
          expect(Option.map(yield* roles.get(roleId), (r) => r.permissions)).toEqual(
            Option.some([MemberPermissions.Read.name]),
          );
          expect(Option.map(yield* assignments.get(directAssignmentId), (a) => a.source)).toEqual(
            Option.some(directSource),
          );
          expect(Option.map(yield* assignments.get(roleAssignmentId), (a) => a.source)).toEqual(
            Option.some(roleSource),
          );
          expect(yield* assignments.listActiveByMember(memberId)).toHaveLength(2);
        }),
      );
    }),
);

it.effect(
  "authorization stores reject expired and foreign transaction contexts for reads and writes",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const foreign = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const roles = yield* RoleStore.Service;
          const assignments = yield* AssignmentStore.Service;
          const expired = yield* fixture.store.transaction(Effect.context<Store.Transaction>());
          const operations: ReadonlyArray<
            Effect.Effect<
              void,
              | RoleStore.Failure
              | RoleStore.Conflict
              | AssignmentStore.Failure
              | AssignmentStore.Conflict,
              Store.Transaction
            >
          > = [
            roles.get(roleId).pipe(Effect.asVoid),
            roles.insert(initialRole),
            assignments.get(roleAssignmentId).pipe(Effect.asVoid),
            assignments.listActiveByMember(memberId).pipe(Effect.asVoid),
            assignments.listActiveByRole(roleId).pipe(Effect.asVoid),
            assignments.insert({
              id: roleAssignmentId,
              workspaceId,
              memberId,
              source: roleSource,
              status: "active",
            }),
          ];
          for (const operation of operations) {
            const closedError = yield* Effect.flip(operation.pipe(Effect.provide(expired)));
            expect(
              closedError._tag === "RoleStore.Failure" ||
                closedError._tag === "AssignmentStore.Failure",
            ).toBe(true);
            const foreignError = yield* Effect.flip(foreign.store.transaction(operation));
            expect(
              foreignError._tag === "RoleStore.Failure" ||
                foreignError._tag === "AssignmentStore.Failure",
            ).toBe(true);
          }
          expect((yield* fixture.snapshot).roles.size).toBe(0);
          expect((yield* fixture.snapshot).assignments.size).toBe(0);
          expect((yield* foreign.snapshot).roles.size).toBe(0);
          expect((yield* foreign.snapshot).assignments.size).toBe(0);
        }),
      );
    }),
);
