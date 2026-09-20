import { testProvenance } from "../publication.ts";
import { expect, expectTypeOf, test } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { AssignmentFacts } from "../../src/authorization/assignment/facts.ts";
import { AssignmentProjection } from "../../src/authorization/assignment/projection.ts";
import { AssignmentStore } from "../../src/authorization/assignment/store.ts";
import { Assignment } from "../../src/authorization/assignment/assignment.ts";
import { Authorization } from "../../src/authorization/authorization.ts";
import { BuiltinRoles } from "../../src/authorization/role/builtin.ts";
import { GrantResolver } from "../../src/authorization/grant-resolver.ts";
import { Grant } from "../../src/authorization/grant.ts";
import { PermissionCatalog } from "../../src/authorization/permission-catalog.ts";
import { Permission } from "../../src/authorization/permission.ts";
import { Requirement } from "../../src/authorization/requirement.ts";
import { RoleFacts } from "../../src/authorization/role/facts.ts";
import { RoleProjection } from "../../src/authorization/role/projection.ts";
import { RoleStore } from "../../src/authorization/role/store.ts";
import { Role } from "../../src/authorization/role/role.ts";
import { Scope } from "../../src/authorization/scope.ts";
import { Target } from "../../src/authorization/target.ts";
import { Actor } from "../../src/identity/actor.ts";
import { Identity } from "../../src/identity/identity.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { MemberFacts } from "../../src/workspace/member/facts.ts";
import { MemberPermissions } from "../../src/workspace/member/permissions.ts";
import { MemberProjection } from "../../src/workspace/member/projection.ts";
import { MemberStore } from "../../src/workspace/member/store.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { make, type Fixture } from "../memory-store.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const foreignWorkspaceId = Workspace.Id.make("workspace-two");
const alice = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("alice"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("same-id") }),
});
const bob = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("bob"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
});
const charlie = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("charlie"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("charlie") }),
});
const agent = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("agent"),
  identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("same-id") }),
});
const membership = (actor: Actor.Value) =>
  Member.Record.make({
    id: actor.memberId,
    workspaceId: actor.workspaceId,
    identity: actor.identity,
    status: "active",
  });
const workspaceScope = Scope.Value.cases.Workspace.make({ workspaceId });
const bobTarget = Target.Reference.cases.Member.make({ workspaceId, memberId: bob.memberId });
const charlieTarget = Target.Reference.cases.Member.make({
  workspaceId,
  memberId: charlie.memberId,
});
const bobScope = Scope.Value.cases.Target.make({ target: bobTarget });
const readBob = Requirement.make(MemberPermissions.Read, bobTarget);
const removeBob = Requirement.make(MemberPermissions.Remove, bobTarget);
const readCharlie = Requirement.make(MemberPermissions.Read, charlieTarget);
const removeCharlie = Requirement.make(MemberPermissions.Remove, charlieTarget);
const Create = Permission.makeGroup("test.member", { targetKind: "Member" }).make("create", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});
const workspaceTarget = Target.Reference.cases.Workspace.make({ workspaceId });
const createInWorkspace = Requirement.make(Create, workspaceTarget);

const direct = (
  id: string,
  recipient: Member.Id,
  permission: Permission.Definition,
  scope: Scope.Value = workspaceScope,
) =>
  Assignment.Record.make({
    id: Assignment.Id.make(id),
    workspaceId,
    memberId: recipient,
    source: Assignment.Source.cases.Direct.make({ grant: Grant.make(permission, scope) }),
    status: "active",
  });
interface Overrides {
  readonly members?: Partial<MemberStore.Interface>;
  readonly roles?: Partial<RoleStore.Interface>;
}
const dependencies = (fixture: Fixture, overrides: Overrides = {}) =>
  Layer.mergeAll(
    Layer.succeed(
      MemberStore.Service,
      MemberStore.Service.of({ ...fixture.members(workspaceId), ...overrides.members }),
    ),
    Layer.succeed(
      RoleStore.Service,
      RoleStore.Service.of({ ...fixture.roles(workspaceId), ...overrides.roles }),
    ),
    Layer.succeed(AssignmentStore.Service, fixture.assignments(workspaceId)),
    PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Remove, Create]),
  );
const configured = (fixture: Fixture, overrides: Overrides = {}) =>
  Authorization.layer.pipe(
    Layer.provide(GrantResolver.layer),
    Layer.provide(dependencies(fixture, overrides)),
  );
const check = Effect.fn("AuthorizationTest.check")(function* (
  requirements: ReadonlyArray<Requirement.Value>,
) {
  yield* (yield* Authorization.Service).require(requirements);
});
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, Authorization.Service | Actor.Service | Store.Transaction>,
  actor: Actor.Value = alice,
  overrides: Overrides = {},
) =>
  Effect.runPromise(
    fixture.store
      .transaction(program)
      .pipe(
        Effect.provide(configured(fixture, overrides)),
        Effect.provideService(Actor.Service, actor),
      ),
  );
const seed = (
  fixture: Fixture,
  actors: ReadonlyArray<Actor.Value>,
  assignments: ReadonlyArray<Assignment.Record> = [],
  roles: ReadonlyArray<Role.Record> = [],
) =>
  Effect.runPromise(
    fixture.store.transaction(
      Effect.gen(function* () {
        for (const actor of actors) yield* fixture.members(workspaceId).insert(membership(actor));
        for (const role of roles) yield* fixture.roles(workspaceId).insert(role);
        for (const assignment of assignments)
          yield* fixture.assignments(workspaceId).insert(assignment);
      }),
    ),
  );

test("authorization reads each caller's actor and uses an agent's own grants", async () => {
  expectTypeOf<Layer.Services<typeof Authorization.layer>>().toEqualTypeOf<
    MemberStore.Service | GrantResolver.Service | PermissionCatalog.Service
  >();
  expectTypeOf<
    Layer.Error<typeof Authorization.layer>
  >().toEqualTypeOf<Authorization.WorkspaceMismatch>();
  expectTypeOf<Effect.Services<ReturnType<Authorization.Interface["require"]>>>().toEqualTypeOf<
    Actor.Service | Store.Transaction
  >();
  expectTypeOf<
    Effect.Success<ReturnType<typeof Authorization.make>>
  >().toEqualTypeOf<Authorization.Interface>();
  expectTypeOf<
    Effect.Error<ReturnType<Authorization.Interface["require"]>>
  >().toEqualTypeOf<Authorization.Error>();
  const fixture = await Effect.runPromise(make());
  await seed(
    fixture,
    [alice, agent],
    [
      direct("alice-remove", alice.memberId, MemberPermissions.Remove),
      direct("agent-read", agent.memberId, MemberPermissions.Read),
    ],
  );
  const authorization = await Effect.runPromise(
    Authorization.Service.pipe(
      Effect.provide(configured(fixture)),
      Effect.provideService(Actor.Service, alice),
    ),
  );
  expect(authorization.workspaceId).toBe(workspaceId);
  await Effect.runPromise(
    fixture.store
      .transaction(authorization.require([removeBob]))
      .pipe(Effect.provideService(Actor.Service, alice)),
  );
  const agentDenied = await Effect.runPromise(
    fixture.store
      .transaction(authorization.require([removeBob]).pipe(Effect.flip))
      .pipe(Effect.provideService(Actor.Service, agent)),
  );
  expect(agentDenied).toMatchObject({
    _tag: "Authorization.Denied",
    memberId: agent.memberId,
    requirement: removeBob,
  });
  await Effect.runPromise(
    fixture.store
      .transaction(authorization.require([readBob]))
      .pipe(Effect.provideService(Actor.Service, agent)),
  );
  const humanDenied = await Effect.runPromise(
    fixture.store
      .transaction(authorization.require([readBob]).pipe(Effect.flip))
      .pipe(Effect.provideService(Actor.Service, alice)),
  );
  expect(humanDenied).toMatchObject({ _tag: "Authorization.Denied", memberId: alice.memberId });
});

test("authorization requires a matching permission and scope for the actual target", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [alice]);
  expect(await run(fixture, Effect.flip(check([readBob])))).toMatchObject({
    _tag: "Authorization.Denied",
    requirement: readBob,
  });
  await seed(fixture, [], [direct("read-bob", alice.memberId, MemberPermissions.Read, bobScope)]);
  await run(fixture, check([readBob]));
  expect(await run(fixture, Effect.flip(check([readCharlie])))).toMatchObject({
    _tag: "Authorization.Denied",
    requirement: readCharlie,
  });
  expect(await run(fixture, Effect.flip(check([removeBob])))).toMatchObject({
    _tag: "Authorization.Denied",
    requirement: removeBob,
  });
  await seed(
    fixture,
    [],
    [
      direct("remove-wide", alice.memberId, MemberPermissions.Remove),
      direct(
        "create",
        alice.memberId,
        Create,
        Scope.Value.cases.Target.make({ target: workspaceTarget }),
      ),
    ],
  );
  await run(fixture, check([removeBob, removeCharlie, createInWorkspace]));
  expect(await run(fixture, Effect.flip(check([readCharlie])))).toMatchObject({
    _tag: "Authorization.Denied",
  });
});

test("every requirement must be satisfied across role and direct assignments", async () => {
  const fixture = await Effect.runPromise(make());
  const roleId = Role.Id.make("reader");
  await seed(
    fixture,
    [alice],
    [
      Assignment.Record.make({
        id: Assignment.Id.make("role"),
        workspaceId,
        memberId: alice.memberId,
        status: "active",
        source: Assignment.Source.cases.Role.make({ roleId, scope: workspaceScope }),
      }),
      direct("remove-bob", alice.memberId, MemberPermissions.Remove, bobScope),
    ],
    [
      {
        id: roleId,
        workspaceId,
        name: "Administrator",
        permissions: [MemberPermissions.Read.name],
      },
    ],
  );
  await run(fixture, check([readBob, readCharlie, removeBob]));
  expect(await run(fixture, Effect.flip(check([readBob, removeBob, removeCharlie])))).toMatchObject(
    { _tag: "Authorization.Denied", requirement: removeCharlie },
  );
});

test("a built-in role's identity and permission tiers never bypass its stored permissions or scope", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(
    fixture,
    [alice],
    [
      {
        id: Assignment.Id.make("owner"),
        workspaceId,
        memberId: alice.memberId,
        status: "active",
        source: Assignment.Source.cases.Role.make({
          roleId: BuiltinRoles.OwnerId,
          scope: bobScope,
        }),
      },
    ],
    [
      {
        id: BuiltinRoles.OwnerId,
        workspaceId,
        name: "Owner",
        permissions: [MemberPermissions.Remove.name],
      },
    ],
  );
  await run(fixture, check([removeBob]));
  // Possessing an administrator-tier permission does not imply viewer-tier access.
  expect(await run(fixture, Effect.flip(check([readBob])))).toMatchObject({
    _tag: "Authorization.Denied",
    requirement: readBob,
  });
  expect(await run(fixture, Effect.flip(check([removeCharlie])))).toMatchObject({
    _tag: "Authorization.Denied",
    requirement: removeCharlie,
  });
});

test("missing or removed acting memberships fail even when assignments still grant access", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [], [direct("remove", alice.memberId, MemberPermissions.Remove)]);
  for (const requirements of [[], [removeBob]]) {
    expect(await run(fixture, Effect.flip(check(requirements)))).toMatchObject({
      _tag: "Authorization.InvalidActor",
      memberId: alice.memberId,
      reason: "membership-missing",
    });
  }
  await seed(fixture, [alice]);
  await run(fixture, check([removeBob]));
  await run(fixture, check([]));
  await Effect.runPromise(
    fixture.store.transaction(fixture.members(workspaceId).markRemoved(alice.memberId)),
  );
  for (const requirements of [[], [removeBob]]) {
    expect(await run(fixture, Effect.flip(check(requirements)))).toMatchObject({
      _tag: "Authorization.InvalidActor",
      memberId: alice.memberId,
      reason: "membership-removed",
    });
  }
});

test("acting identity must match both the membership's identity kind and ID", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [alice], [direct("remove", alice.memberId, MemberPermissions.Remove)]);
  const wrongIdentities = [
    Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("different") }),
    agent.identity,
  ];
  for (const identity of wrongIdentities) {
    const mismatched = Actor.Value.make({ workspaceId, memberId: alice.memberId, identity });
    expect(await run(fixture, Effect.flip(check([removeBob])), mismatched)).toMatchObject({
      _tag: "Authorization.InvalidActor",
      reason: "identity-mismatch",
    });
  }
});

test("workspace guards reject mismatched composition, actors, membership records, and targets", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [alice], [direct("read", alice.memberId, MemberPermissions.Read)]);
  const mismatch = {
    _tag: "Authorization.WorkspaceMismatch",
    expectedWorkspaceId: workspaceId,
    actualWorkspaceId: foreignWorkspaceId,
  };
  expect(
    await Effect.runPromise(
      Effect.void.pipe(
        Effect.provide(configured(fixture, { members: { workspaceId: foreignWorkspaceId } })),
        Effect.flip,
      ),
    ),
  ).toMatchObject(mismatch);
  const foreignActor = Actor.Value.make({
    workspaceId: foreignWorkspaceId,
    memberId: alice.memberId,
    identity: alice.identity,
  });
  expect(await run(fixture, Effect.flip(check([readBob])), foreignActor)).toMatchObject(mismatch);
  const foreignRequirement = Requirement.make(
    MemberPermissions.Read,
    Target.Reference.cases.Member.make({ workspaceId: foreignWorkspaceId, memberId: bob.memberId }),
  );
  expect(await run(fixture, Effect.flip(check([foreignRequirement])))).toMatchObject(mismatch);
  const foreignMember = Member.Record.make({
    id: alice.memberId,
    workspaceId: foreignWorkspaceId,
    identity: alice.identity,
    status: "active",
  });
  expect(
    await run(fixture, Effect.flip(check([readBob])), alice, {
      members: { get: () => Effect.succeedSome(foreignMember) },
    }),
  ).toMatchObject(mismatch);
});

test("requirements are validated against canonical permission definitions", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [alice], [direct("remove", alice.memberId, MemberPermissions.Remove)]);
  const unregistered = Permission.make("member.unregistered", {
    targetKind: "Member",
    builtinTier: "viewer",
  });
  expect(
    await run(fixture, Effect.flip(check([Requirement.make(unregistered, bobTarget)]))),
  ).toMatchObject({ _tag: "PermissionCatalog.Unknown", name: unregistered.name });
  const wrongDefinition = Permission.make(MemberPermissions.Remove.name, {
    targetKind: "Workspace",
    builtinTier: "administrator",
  });
  const wrongKind = Requirement.make(wrongDefinition, workspaceTarget);
  expect(await run(fixture, Effect.flip(check([wrongKind])))).toMatchObject({
    _tag: "SchemaError",
  });
  const malformed: Requirement.Value = {
    permission: MemberPermissions.Remove,
    target: workspaceTarget,
  };
  expect(await run(fixture, Effect.flip(check([malformed])))).toMatchObject({
    _tag: "SchemaError",
  });
});

test("authorization observes transactional changes and protects the mutation in the same commit", async () => {
  const fixture = await Effect.runPromise(make());
  const roleId = Role.Id.make("manager");
  const assignmentId = Assignment.Id.make("manager-assignment");
  const source = Assignment.Source.cases.Role.make({ roleId, scope: workspaceScope });
  await seed(
    fixture,
    [alice, bob, charlie],
    [
      Assignment.Record.make({
        id: assignmentId,
        workspaceId,
        memberId: alice.memberId,
        status: "active",
        source,
      }),
    ],
    [{ id: roleId, workspaceId, name: "Manager", permissions: [MemberPermissions.Remove.name] }],
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const authorization = yield* Authorization.Service;
      const journal = yield* Journal.make({
        logId: Log.Id.make("workspace-one/journal"),
        projections: [
          MemberProjection.definition,
          RoleProjection.definition,
          AssignmentProjection.definition,
        ],
      });
      yield* journal.commit(
        Effect.gen(function* () {
          yield* authorization.require([removeBob]);
          yield* journal.publish(
            MemberFacts.Removed,
            { workspaceId, memberId: bob.memberId },
            testProvenance(workspaceId),
          );
        }),
      );
      expect(
        Option.map(
          yield* fixture.members(workspaceId).get(bob.memberId),
          (member) => member.status,
        ),
      ).toEqual(Option.some("removed"));

      const before = yield* fixture.snapshot;
      const denied = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(
              RoleFacts.PermissionsChanged,
              {
                roleId,
                workspaceId,
                permissions: [],
              },
              testProvenance(workspaceId),
            );
            yield* authorization.require([removeCharlie]);
            yield* journal.publish(
              MemberFacts.Removed,
              {
                workspaceId,
                memberId: charlie.memberId,
              },
              testProvenance(workspaceId),
            );
          }),
        ),
      );
      expect(denied._tag).toBe("Authorization.Denied");
      expect(yield* fixture.snapshot).toEqual(before);
      yield* journal.publish(
        RoleFacts.PermissionsChanged,
        {
          roleId,
          workspaceId,
          permissions: [],
        },
        testProvenance(workspaceId),
      );
      expect(
        yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
      ).toMatchObject({ _tag: "Authorization.Denied" });
      yield* journal.publish(
        RoleFacts.PermissionsChanged,
        {
          roleId,
          workspaceId,
          permissions: [MemberPermissions.Remove.name],
        },
        testProvenance(workspaceId),
      );
      yield* journal.publish(
        AssignmentFacts.Revoked,
        { assignmentId, workspaceId },
        testProvenance(workspaceId),
      );
      expect(
        yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
      ).toMatchObject({ _tag: "Authorization.Denied" });
      yield* journal.publish(
        AssignmentFacts.Created,
        {
          assignmentId: Assignment.Id.make("reassigned"),
          workspaceId,
          memberId: alice.memberId,
          source,
        },
        testProvenance(workspaceId),
      );
      yield* journal.commit(authorization.require([removeCharlie]));

      const beforeRemoval = yield* fixture.snapshot;
      const inactive = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(
              MemberFacts.Removed,
              { workspaceId, memberId: alice.memberId },
              testProvenance(workspaceId),
            );
            yield* authorization.require([removeCharlie]);
          }),
        ),
      );
      expect(inactive).toMatchObject({
        _tag: "Authorization.InvalidActor",
        reason: "membership-removed",
      });
      expect(yield* fixture.snapshot).toEqual(beforeRemoval);
      yield* journal.publish(
        MemberFacts.Removed,
        { workspaceId, memberId: alice.memberId },
        testProvenance(workspaceId),
      );
      expect(
        yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
      ).toMatchObject({ _tag: "Authorization.InvalidActor", reason: "membership-removed" });
    }).pipe(
      Effect.provide(Layer.mergeAll(configured(fixture), Log.layer)),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provide(CommittedEvents.layer(workspaceId)),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(MemberStore.Service, fixture.members(workspaceId)),
      Effect.provideService(RoleStore.Service, fixture.roles(workspaceId)),
      Effect.provideService(AssignmentStore.Service, fixture.assignments(workspaceId)),
      Effect.provideService(Actor.Service, alice),
    ),
  );
});

test("malformed membership responses and storage failures fail authorization", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [alice], [direct("read", alice.memberId, MemberPermissions.Read)]);
  const failure = new MemberStore.Failure({ operation: "get", cause: "unavailable" });
  expect(
    await run(fixture, Effect.flip(check([readBob])), alice, {
      members: { get: () => Effect.fail(failure) },
    }),
  ).toBe(failure);
  const wrongMember = Member.Record.make({
    id: bob.memberId,
    workspaceId,
    identity: alice.identity,
    status: "active",
  });
  expect(
    await run(fixture, Effect.flip(check([readBob])), alice, {
      members: { get: () => Effect.succeedSome(wrongMember) },
    }),
  ).toMatchObject({ _tag: "Authorization.InvalidResponse" });
  const malformed = membership(alice);
  Reflect.set(malformed, "status", "unknown");
  expect(
    await run(fixture, Effect.flip(check([readBob])), alice, {
      members: { get: () => Effect.succeedSome(malformed) },
    }),
  ).toMatchObject({ _tag: "SchemaError" });
});

test("resolver failures propagate even when another assignment could satisfy the requirement", async () => {
  const fixture = await Effect.runPromise(make());
  const missingRoleId = Role.Id.make("missing");
  await seed(
    fixture,
    [alice],
    [
      direct("read", alice.memberId, MemberPermissions.Read),
      Assignment.Record.make({
        id: Assignment.Id.make("missing-role"),
        workspaceId,
        memberId: alice.memberId,
        status: "active",
        source: Assignment.Source.cases.Role.make({ roleId: missingRoleId, scope: workspaceScope }),
      }),
    ],
  );
  expect(await run(fixture, Effect.flip(check([readBob])))).toMatchObject({
    _tag: "GrantResolver.MissingRole",
    roleId: missingRoleId,
  });
  const failure = new RoleStore.Failure({ operation: "get", cause: "unavailable" });
  expect(
    await run(fixture, Effect.flip(check([readBob])), alice, {
      roles: { get: () => Effect.fail(failure) },
    }),
  ).toBe(failure);
});
