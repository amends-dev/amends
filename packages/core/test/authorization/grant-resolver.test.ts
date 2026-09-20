import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, expectTypeOf, test } from "bun:test";
import { Effect, Layer } from "effect";
import { AssignmentFacts } from "../../src/authorization/assignment/facts.ts";
import { AssignmentProjection } from "../../src/authorization/assignment/projection.ts";
import { AssignmentStore } from "../../src/authorization/assignment/store.ts";
import { Assignment } from "../../src/authorization/assignment/assignment.ts";
import { GrantResolver } from "../../src/authorization/grant-resolver.ts";
import { Grant } from "../../src/authorization/grant.ts";
import { PermissionCatalog } from "../../src/authorization/permission-catalog.ts";
import { Permission } from "../../src/authorization/permission.ts";
import { RoleFacts } from "../../src/authorization/role/facts.ts";
import { RoleProjection } from "../../src/authorization/role/projection.ts";
import { RoleStore } from "../../src/authorization/role/store.ts";
import { Role } from "../../src/authorization/role/role.ts";
import { Scope } from "../../src/authorization/scope.ts";
import { Target } from "../../src/authorization/target.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { MemberPermissions } from "../../src/workspace/member/permissions.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { make, type Fixture } from "../memory-store.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const foreignWorkspaceId = Workspace.Id.make("workspace-two");
const memberId = Member.Id.make("recipient");
const roleId = Role.Id.make("manager");
const workspaceScope = Scope.Value.cases.Workspace.make({ workspaceId });
const memberScope = Scope.Value.cases.Target.make({
  target: Target.Reference.cases.Member.make({ workspaceId, memberId: Member.Id.make("subject") }),
});
const workspaceTargetScope = Scope.Value.cases.Target.make({
  target: Target.Reference.cases.Workspace.make({ workspaceId }),
});
const ManageWorkspace = Permission.make("test.workspace.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});
const role = {
  id: roleId,
  workspaceId,
  name: "Manager",
  permissions: [MemberPermissions.Read.name, MemberPermissions.Remove.name],
};
const roleSource = (scope: Scope.Value = workspaceScope, id = roleId) =>
  Assignment.Source.cases.Role.make({ roleId: id, scope });
const directSource = (permission: Permission.Name, scope: Scope.Value) =>
  Assignment.Source.cases.Direct.make({ grant: { permission, scope } });
const assigned = (id: string, source: Assignment.Source) =>
  Assignment.Record.make({
    id: Assignment.Id.make(id),
    workspaceId,
    memberId,
    source,
    status: "active",
  });

interface Overrides {
  readonly assignments?: Partial<AssignmentStore.Interface>;
  readonly roles?: Partial<RoleStore.Interface>;
}
const dependencies = (fixture: Fixture, overrides: Overrides = {}) =>
  Layer.mergeAll(
    Layer.succeed(
      AssignmentStore.Service,
      AssignmentStore.Service.of({ ...fixture.assignments(workspaceId), ...overrides.assignments }),
    ),
    Layer.succeed(
      RoleStore.Service,
      RoleStore.Service.of({ ...fixture.roles(workspaceId), ...overrides.roles }),
    ),
    PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Remove, ManageWorkspace]),
  );
const configured = (fixture: Fixture, overrides: Overrides = {}) =>
  GrantResolver.layer.pipe(Layer.provide(dependencies(fixture, overrides)));
const resolve = Effect.gen(function* () {
  return yield* (yield* GrantResolver.Service).resolve(memberId);
});
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, GrantResolver.Service | Store.Transaction>,
  overrides: Overrides = {},
) =>
  Effect.runPromise(
    fixture.store.transaction(program).pipe(Effect.provide(configured(fixture, overrides))),
  );
const seed = (
  fixture: Fixture,
  roles: ReadonlyArray<Role.Record>,
  assignments: ReadonlyArray<Assignment.Record>,
) =>
  Effect.runPromise(
    fixture.store.transaction(
      Effect.gen(function* () {
        for (const record of roles) yield* fixture.roles(workspaceId).insert(record);
        for (const record of assignments) yield* fixture.assignments(workspaceId).insert(record);
      }),
    ),
  );

test("the resolver exposes a stable service and requires the caller's transaction", async () => {
  expectTypeOf<Layer.Services<typeof GrantResolver.layer>>().toEqualTypeOf<
    AssignmentStore.Service | RoleStore.Service | PermissionCatalog.Service
  >();
  expectTypeOf<
    Layer.Error<typeof GrantResolver.layer>
  >().toEqualTypeOf<GrantResolver.WorkspaceMismatch>();
  expectTypeOf<
    Effect.Success<ReturnType<typeof GrantResolver.make>>
  >().toEqualTypeOf<GrantResolver.Interface>();
  expectTypeOf<Effect.Services<typeof resolve>>().toEqualTypeOf<
    GrantResolver.Service | Store.Transaction
  >();
  expectTypeOf<Effect.Error<typeof resolve>>().toEqualTypeOf<GrantResolver.Error>();
  const fixture = await Effect.runPromise(make());
  await seed(
    fixture,
    [],
    [assigned("direct", directSource(MemberPermissions.Read.name, memberScope))],
  );
  // Building within an earlier transaction must not capture its now-expired handle.
  const resolver = await Effect.runPromise(
    fixture.store.transaction(GrantResolver.make()).pipe(Effect.provide(dependencies(fixture))),
  );
  expect(resolver.workspaceId).toBe(workspaceId);
  expect(await Effect.runPromise(fixture.store.transaction(resolver.resolve(memberId)))).toEqual([
    Grant.make(MemberPermissions.Read, memberScope),
  ]);
});

test("resolution expands role and direct assignments at their individual scopes", async () => {
  const fixture = await Effect.runPromise(make());
  const emptyRoleId = Role.Id.make("empty");
  await seed(
    fixture,
    [role, { id: emptyRoleId, workspaceId, name: "Empty", permissions: [] }],
    [
      assigned("workspace-role", roleSource()),
      assigned("member-role", roleSource(memberScope)),
      assigned("empty-role", roleSource(workspaceScope, emptyRoleId)),
      assigned("direct-workspace", directSource(ManageWorkspace.name, workspaceTargetScope)),
      assigned("overlapping-direct", directSource(MemberPermissions.Read.name, workspaceScope)),
    ],
  );
  const grants = await run(fixture, resolve);
  expect(grants).toHaveLength(6);
  expect(grants).toEqual(
    expect.arrayContaining([
      Grant.make(MemberPermissions.Read, workspaceScope),
      Grant.make(MemberPermissions.Remove, workspaceScope),
      Grant.make(MemberPermissions.Read, memberScope),
      Grant.make(MemberPermissions.Remove, memberScope),
      Grant.make(ManageWorkspace, workspaceTargetScope),
    ]),
  );
  expect(
    grants.filter(
      (grant) =>
        grant.permission === MemberPermissions.Read.name && grant.scope._tag === "Workspace",
    ),
  ).toHaveLength(2);
});

test("one resolver observes staged journal changes, later role edits, and assignment revocations", async () => {
  const fixture = await Effect.runPromise(make());
  const roleAssignmentId = Assignment.Id.make("role-assignment");
  const directAssignmentId = Assignment.Id.make("direct-assignment");
  await Effect.runPromise(
    Effect.gen(function* () {
      const resolver = yield* GrantResolver.Service;
      const journal = yield* Journal.make({
        logId: Log.Id.make("workspace-one/journal"),
        projections: [RoleProjection.definition, AssignmentProjection.definition],
      });
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal
            .publish(RoleFacts.Created, {
              roleId,
              workspaceId,
              name: role.name,
              permissions: role.permissions,
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          yield* journal
            .publish(AssignmentFacts.Created, {
              assignmentId: roleAssignmentId,
              workspaceId,
              memberId,
              source: roleSource(),
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          yield* journal
            .publish(AssignmentFacts.Created, {
              assignmentId: directAssignmentId,
              workspaceId,
              memberId,
              source: directSource(MemberPermissions.Read.name, memberScope),
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          expect(yield* resolver.resolve(memberId)).toHaveLength(3);
        }),
      );
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal
            .publish(RoleFacts.PermissionsChanged, {
              roleId,
              workspaceId,
              permissions: [MemberPermissions.Read.name],
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          yield* journal
            .publish(AssignmentFacts.Revoked, {
              assignmentId: directAssignmentId,
              workspaceId,
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          expect(yield* resolver.resolve(memberId)).toEqual([
            Grant.make(MemberPermissions.Read, workspaceScope),
          ]);
        }),
      );
      expect(yield* journal.commit(resolver.resolve(memberId))).toEqual([
        Grant.make(MemberPermissions.Read, workspaceScope),
      ]);
      yield* journal
        .publish(AssignmentFacts.Revoked, {
          assignmentId: roleAssignmentId,
          workspaceId,
        })
        .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
      expect(yield* journal.commit(resolver.resolve(memberId))).toEqual([]);
    }).pipe(
      Effect.provide(Layer.mergeAll(configured(fixture), Log.layer)),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provide(CommittedEvents.layer(workspaceId)),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(RoleStore.Service, fixture.roles(workspaceId)),
      Effect.provideService(AssignmentStore.Service, fixture.assignments(workspaceId)),
    ),
  );
});

test("members without active assignments receive no grants", async () => {
  const fixture = await Effect.runPromise(make());
  expect(await run(fixture, resolve)).toEqual([]);
  const revoked = assigned("revoked", roleSource(workspaceScope, Role.Id.make("missing")));
  await seed(fixture, [], [revoked]);
  await Effect.runPromise(
    fixture.store.transaction(fixture.assignments(workspaceId).markRevoked(revoked.id)),
  );
  expect(await run(fixture, resolve)).toEqual([]);
});

test("a missing role fails the complete resolution even after a valid direct grant", async () => {
  const fixture = await Effect.runPromise(make());
  const missing = assigned("missing-role", roleSource());
  await seed(
    fixture,
    [],
    [assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)), missing],
  );
  expect(await run(fixture, Effect.flip(resolve))).toMatchObject({
    _tag: "GrantResolver.MissingRole",
    assignmentId: missing.id,
    roleId,
  });
});

test("unknown permissions fail resolution for both direct and role assignments", async () => {
  const unknown = Permission.Name.make("member.unknown");
  for (const source of [directSource(unknown, workspaceScope), roleSource()]) {
    const fixture = await Effect.runPromise(make());
    await seed(
      fixture,
      [{ ...role, permissions: [MemberPermissions.Read.name, unknown] }],
      [
        assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)),
        assigned("invalid", source),
      ],
    );
    expect(await run(fixture, Effect.flip(resolve))).toMatchObject({
      _tag: "PermissionCatalog.Unknown",
      name: unknown,
    });
  }
});

test("incompatible scopes fail whole role assignments and direct grants", async () => {
  for (const source of [directSource(ManageWorkspace.name, memberScope), roleSource(memberScope)]) {
    const fixture = await Effect.runPromise(make());
    await seed(
      fixture,
      [{ ...role, permissions: [MemberPermissions.Read.name, ManageWorkspace.name] }],
      [
        assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)),
        assigned("invalid", source),
      ],
    );
    const failure = await run(fixture, Effect.flip(resolve));
    expect(failure._tag).toBe("SchemaError");
    if (failure._tag !== "SchemaError") throw new Error("Expected incompatible scope");
    expect(failure.message).toContain("requires a Workspace target");
  }
});

test("workspace mismatches are rejected in composition and returned assignments and roles", async () => {
  const fixture = await Effect.runPromise(make());
  const mismatch = {
    _tag: "GrantResolver.WorkspaceMismatch",
    expectedWorkspaceId: workspaceId,
    actualWorkspaceId: foreignWorkspaceId,
  };
  expect(
    await Effect.runPromise(
      Effect.void.pipe(
        Effect.provide(configured(fixture, { roles: { workspaceId: foreignWorkspaceId } })),
        Effect.flip,
      ),
    ),
  ).toMatchObject(mismatch);
  const foreignAssignment = Assignment.Record.make({
    id: Assignment.Id.make("foreign"),
    workspaceId: foreignWorkspaceId,
    memberId,
    status: "active",
    source: roleSource(Scope.Value.cases.Workspace.make({ workspaceId: foreignWorkspaceId })),
  });
  expect(
    await run(fixture, Effect.flip(resolve), {
      assignments: { listActiveByMember: () => Effect.succeed([foreignAssignment]) },
    }),
  ).toMatchObject(mismatch);
  await seed(fixture, [], [assigned("role", roleSource())]);
  expect(
    await run(fixture, Effect.flip(resolve), {
      roles: {
        get: () => Effect.succeedSome({ ...role, workspaceId: foreignWorkspaceId }),
      },
    }),
  ).toMatchObject(mismatch);
});

test("inconsistent or malformed store responses never produce effective grants", async () => {
  const fixture = await Effect.runPromise(make());
  const active = assigned("active", directSource(MemberPermissions.Read.name, workspaceScope));
  const wrongMember = Assignment.Record.make({
    id: active.id,
    workspaceId,
    memberId: Member.Id.make("different"),
    source: active.source,
    status: "active",
  });
  const revoked = Assignment.Record.make({
    id: active.id,
    workspaceId,
    memberId,
    source: active.source,
    status: "revoked",
  });
  for (const records of [[wrongMember], [revoked], [active, active]]) {
    expect(
      await run(fixture, Effect.flip(resolve), {
        assignments: { listActiveByMember: () => Effect.succeed(records) },
      }),
    ).toMatchObject({ _tag: "GrantResolver.InvalidResponse" });
  }
  const wrongScope = {
    id: active.id,
    workspaceId,
    memberId,
    status: "active",
    source: directSource(
      MemberPermissions.Read.name,
      Scope.Value.cases.Workspace.make({ workspaceId: foreignWorkspaceId }),
    ),
  } satisfies Assignment.Record;
  expect(
    await run(fixture, Effect.flip(resolve), {
      assignments: { listActiveByMember: () => Effect.succeed([wrongScope]) },
    }),
  ).toMatchObject({ _tag: "SchemaError" });
  await seed(fixture, [], [assigned("role", roleSource())]);
  expect(
    await run(fixture, Effect.flip(resolve), {
      roles: { get: () => Effect.succeedSome({ ...role, id: Role.Id.make("different") }) },
    }),
  ).toMatchObject({ _tag: "GrantResolver.InvalidResponse" });
  expect(
    await run(fixture, Effect.flip(resolve), {
      roles: {
        get: () =>
          Effect.succeedSome({
            ...role,
            permissions: [MemberPermissions.Read.name, MemberPermissions.Read.name],
          }),
      },
    }),
  ).toMatchObject({ _tag: "SchemaError" });
});

test("assignment and role storage failures propagate instead of returning partial grants", async () => {
  const fixture = await Effect.runPromise(make());
  const assignmentFailure = new AssignmentStore.Failure({
    operation: "listActiveByMember",
    cause: "unavailable",
  });
  expect(
    await run(fixture, Effect.flip(resolve), {
      assignments: { listActiveByMember: () => Effect.fail(assignmentFailure) },
    }),
  ).toBe(assignmentFailure);
  await seed(
    fixture,
    [],
    [
      assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)),
      assigned("role", roleSource()),
    ],
  );
  const roleFailure = new RoleStore.Failure({ operation: "get", cause: "unavailable" });
  expect(
    await run(fixture, Effect.flip(resolve), { roles: { get: () => Effect.fail(roleFailure) } }),
  ).toBe(roleFailure);
});
