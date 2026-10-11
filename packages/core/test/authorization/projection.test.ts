import * as Publication from "../../src/journal/Publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import * as AssignmentFacts from "../../src/authorization/AssignmentFacts.ts";
import * as AssignmentProjection from "../../src/authorization/AssignmentProjection.ts";
import * as AssignmentStore from "../../src/authorization/AssignmentStore.ts";
import * as Assignment from "../../src/authorization/Assignment.ts";
import * as Grant from "../../src/authorization/Grant.ts";
import * as RoleFacts from "../../src/authorization/RoleFacts.ts";
import * as RoleProjection from "../../src/authorization/RoleProjection.ts";
import * as RoleStore from "../../src/authorization/RoleStore.ts";
import * as Role from "../../src/authorization/Role.ts";
import * as Scope from "../../src/authorization/Scope.ts";
import * as Target from "../../src/authorization/Target.ts";
import * as Identity from "../../src/identity/Identity.ts";
import * as Checkpoint from "../../src/journal/Checkpoint.ts";
import * as Journal from "../../src/journal/Journal.ts";
import * as Log from "../../src/journal/Log.ts";
import * as Store from "../../src/journal/Store.ts";
import * as Transaction from "../../src/journal/Transaction.ts";
import * as MemberFacts from "../../src/workspace/MemberFacts.ts";
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts";
import * as MemberProjection from "../../src/workspace/MemberProjection.ts";
import * as MemberStore from "../../src/workspace/MemberStore.ts";
import * as Member from "../../src/workspace/Member.ts";
import * as Workspace from "../../src/workspace/Workspace.ts";
import { make, type Fixture } from "../memory.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const logId = Log.Id.make("workspace-one/journal");
const roleId = Role.Id.make("manager");
const memberId = Member.Id.make("recipient");
const roleAssignmentId = Assignment.Id.make("role-assignment");
const directAssignmentId = Assignment.Id.make("direct-assignment");
const roleSource = Assignment.Source.cases.Role.make({
  roleId,
  scope: Scope.Scope.cases.Workspace.make({ workspaceId }),
});
const directSource = Assignment.Source.cases.Direct.make({
  grant: Grant.make(
    MemberPermissions.Read,
    Scope.Scope.cases.Target.make({
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
    | Publication.Publication
    | Log.Log
    | Transaction.Transaction
    | Checkpoint.Checkpoint
    | RoleStore.RoleStore
    | AssignmentStore.AssignmentStore
    | MemberStore.MemberStore
  >,
) =>
  program.pipe(
    Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
    Effect.provide(Log.layer),
    Effect.provideService(Store.Store, fixture.store),
    Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
    Effect.provideService(RoleStore.RoleStore, fixture.roles),
    Effect.provideService(AssignmentStore.AssignmentStore, fixture.assignments),
    Effect.provideService(MemberStore.MemberStore, fixture.members),
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
          const roleStore = yield* RoleStore.RoleStore;
          const assignmentStore = yield* AssignmentStore.AssignmentStore;
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
              expect(yield* roleStore.get(roleId)).toEqual(Option.some(initialRole));
              expect(
                new Set((yield* assignmentStore.listActiveByMember(memberId)).map((a) => a.id)),
              ).toEqual(new Set([roleAssignmentId, directAssignmentId]));
              expect(
                new Set((yield* assignmentStore.listActiveByRole(roleId)).map((a) => a.id)),
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
              expect(yield* roleStore.get(roleId)).toEqual(
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
              expect(
                (yield* assignmentStore.listActiveByMember(memberId)).map((a) => a.id),
              ).toEqual([directAssignmentId]);
              expect((yield* assignmentStore.listActiveByRole(roleId)).map((a) => a.id)).toEqual([
                otherAssignmentId,
              ]);
            }),
          );
          expect(yield* roleStore.get(roleId)).toEqual(
            Option.some({ ...initialRole, name: "Renamed role", permissions: [] }),
          );
          expect(yield* assignmentStore.get(roleAssignmentId)).toEqual(
            Option.some({
              id: roleAssignmentId,
              workspaceId,
              memberId,
              source: roleSource,
              status: "revoked",
            }),
          );
          expect(yield* assignmentStore.get(directAssignmentId)).toEqual(
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
          expect(yield* assignmentStore.listActiveByMember(memberId)).toHaveLength(2);
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
          expect(yield* (yield* RoleStore.RoleStore).get(roleId)).toEqual(
            Option.some({ ...initialRole, name: "Replayed role", permissions: [] }),
          );
          const assignmentStore = yield* AssignmentStore.AssignmentStore;
          expect(Option.map(yield* assignmentStore.get(roleAssignmentId), (a) => a.status)).toEqual(
            Option.some("revoked"),
          );
          expect((yield* assignmentStore.listActiveByMember(memberId)).map((a) => a.id)).toEqual([
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
          expect(
            Option.map(yield* (yield* RoleStore.RoleStore).get(roleId), (r) => r.name),
          ).toEqual(Option.some("After catch-up"));
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
                  name: Member.Name.make("human"),
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
        expect(yield* (yield* RoleStore.RoleStore).get(roleId)).toEqual(Option.some(initialRole));
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
          const assignmentStore = yield* AssignmentStore.AssignmentStore;
          expect((yield* assignmentStore.listActiveByMember(memberId)).map((a) => a.id)).toEqual([
            roleAssignmentId,
          ]);
          expect(yield* assignmentStore.get(directAssignmentId)).toEqual(Option.none());
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
      const other = yield* fixture.bind(foreign);
      yield* run(
        fixture,
        Effect.gen(function* () {
          const roleStore = yield* RoleStore.RoleStore;
          const assignmentStore = yield* AssignmentStore.AssignmentStore;
          const permissions = [MemberPermissions.Read.name];
          const target = Target.Reference.cases.Member.make({
            workspaceId,
            memberId: Member.Id.make("subject"),
          });
          const localDirect = Assignment.Source.cases.Direct.make({
            grant: Grant.make(MemberPermissions.Read, Scope.Scope.cases.Target.make({ target })),
          });
          yield* fixture.store.transaction(
            Effect.gen(function* () {
              yield* roleStore.insert({ ...initialRole, permissions });
              yield* assignmentStore.insert({
                id: roleAssignmentId,
                workspaceId,
                memberId,
                source: roleSource,
                status: "active",
              });
              yield* assignmentStore.insert({
                id: directAssignmentId,
                workspaceId,
                memberId,
                source: localDirect,
                status: "active",
              });
            }),
          );
          // The other workspace's records land in a commit of its own, as another workspace's do.
          yield* other.store.transaction(
            Effect.gen(function* () {
              yield* other.roles.insert({
                ...initialRole,
                workspaceId: foreign,
                name: "Foreign role",
              });
              yield* other.assignments.insert({
                id: roleAssignmentId,
                workspaceId: foreign,
                memberId,
                status: "active",
                source: Assignment.Source.cases.Role.make({
                  roleId,
                  scope: Scope.Scope.cases.Workspace.make({ workspaceId: foreign }),
                }),
              });
            }),
          );
          permissions.push(MemberPermissions.Remove.name);
          Reflect.set(target, "memberId", Member.Id.make("mutated-input"));
          const role = yield* roleStore.get(roleId);
          if (Option.isNone(role)) throw new Error("Missing role");
          expect(role.value.permissions).toEqual([MemberPermissions.Read.name]);
          expect(Option.map(yield* other.roles.get(roleId), (r) => r.name)).toEqual(
            Option.some("Foreign role"),
          );
          Reflect.set(role.value.permissions, 0, MemberPermissions.Remove.name);
          const direct = yield* assignmentStore.get(directAssignmentId);
          expect(Option.map(direct, (a) => a.source)).toEqual(Option.some(directSource));
          if (
            Option.isNone(direct) ||
            !Assignment.Source.isAnyOf(["Direct"])(direct.value.source) ||
            !Scope.Scope.isAnyOf(["Target"])(direct.value.source.grant.scope)
          )
            throw new Error("Missing direct target");
          Reflect.set(direct.value.source.grant.scope.target, "workspaceId", foreign);
          const list = yield* assignmentStore.listActiveByMember(memberId);
          expect(list).toHaveLength(2);
          expect(yield* assignmentStore.listActiveByRole(roleId)).toHaveLength(1);
          expect(yield* other.assignments.listActiveByMember(memberId)).toHaveLength(1);
          for (const assignment of list) Reflect.set(assignment, "status", "revoked");
          const byRole = yield* assignmentStore.listActiveByRole(roleId);
          for (const assignment of byRole) {
            if (Assignment.Source.isAnyOf(["Role"])(assignment.source))
              Reflect.set(assignment.source.scope, "workspaceId", foreign);
          }
          expect(Option.map(yield* roleStore.get(roleId), (r) => r.permissions)).toEqual(
            Option.some([MemberPermissions.Read.name]),
          );
          expect(
            Option.map(yield* assignmentStore.get(directAssignmentId), (a) => a.source),
          ).toEqual(Option.some(directSource));
          expect(Option.map(yield* assignmentStore.get(roleAssignmentId), (a) => a.source)).toEqual(
            Option.some(roleSource),
          );
          expect(yield* assignmentStore.listActiveByMember(memberId)).toHaveLength(2);
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
          const roleStore = yield* RoleStore.RoleStore;
          const assignmentStore = yield* AssignmentStore.AssignmentStore;
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
            roleStore.get(roleId).pipe(Effect.asVoid),
            roleStore.insert(initialRole),
            assignmentStore.get(roleAssignmentId).pipe(Effect.asVoid),
            assignmentStore.listActiveByMember(memberId).pipe(Effect.asVoid),
            assignmentStore.listActiveByRole(roleId).pipe(Effect.asVoid),
            assignmentStore.insert({
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
              Schema.is(RoleStore.Failure)(closedError) ||
                Schema.is(AssignmentStore.Failure)(closedError),
            ).toBe(true);
            const foreignError = yield* Effect.flip(foreign.store.transaction(operation));
            expect(
              Schema.is(RoleStore.Failure)(foreignError) ||
                Schema.is(AssignmentStore.Failure)(foreignError),
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
