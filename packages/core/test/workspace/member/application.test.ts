import { expect, expectTypeOf, test } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { AssignmentFacts } from "../../../src/authorization/assignment/facts.ts";
import { AssignmentProjection } from "../../../src/authorization/assignment/projection.ts";
import { AssignmentStore } from "../../../src/authorization/assignment/store.ts";
import { Assignment } from "../../../src/authorization/assignment/assignment.ts";
import { Delegation } from "../../../src/authorization/delegation.ts";
import { Authorization } from "../../../src/authorization/authorization.ts";
import { GrantResolver } from "../../../src/authorization/grant-resolver.ts";
import { Grant } from "../../../src/authorization/grant.ts";
import { PermissionCatalog } from "../../../src/authorization/permission-catalog.ts";
import { RoleStore } from "../../../src/authorization/role/store.ts";
import { Scope } from "../../../src/authorization/scope.ts";
import { Target } from "../../../src/authorization/target.ts";
import { Actor } from "../../../src/identity/actor.ts";
import { Identity } from "../../../src/identity/identity.ts";
import { Checkpoint } from "../../../src/journal/checkpoint.ts";
import { Journal } from "../../../src/journal/journal.ts";
import { Log } from "../../../src/journal/log.ts";
import { Store } from "../../../src/journal/store.ts";
import { CommittedEvents } from "../../../src/journal/committed-events.ts";
import { InvitationStore } from "../../../src/workspace/invitation/store.ts";
import { MemberApplication } from "../../../src/workspace/member/application.ts";
import { MemberFacts } from "../../../src/workspace/member/facts.ts";
import { MemberPermissions } from "../../../src/workspace/member/permissions.ts";
import { MemberProjection } from "../../../src/workspace/member/projection.ts";
import { MemberStore } from "../../../src/workspace/member/store.ts";
import { Member } from "../../../src/workspace/member/member.ts";
import { WorkspaceStore } from "../../../src/workspace/store.ts";
import { Workspace } from "../../../src/workspace/workspace.ts";
import { make, type Fixture } from "../../memory-store.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const foreignWorkspaceId = Workspace.Id.make("workspace-two");
const alice = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("alice"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
});
const agent = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("agent"),
  identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("agent") }),
});
const bob = Member.Record.make({
  id: Member.Id.make("bob"),
  workspaceId,
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
  status: "active",
});
const missingId = Member.Id.make("missing");
const bobScope = Scope.Value.cases.Target.make({
  target: Target.Reference.cases.Member.make({ workspaceId, memberId: bob.id }),
});
const assignment = (
  id: string,
  scope: Scope.Value = bobScope,
  permission = MemberPermissions.Read,
) =>
  Assignment.Record.make({
    id: Assignment.Id.make(id),
    workspaceId,
    memberId: alice.memberId,
    source: Assignment.Source.cases.Direct.make({
      grant: Grant.make(permission, scope),
    }),
    status: "active",
  });

const configured = (
  fixture: Fixture,
  overrides: Partial<MemberStore.Interface> = {},
  workspaceOverrides: Partial<WorkspaceStore.Interface> = {},
) => {
  const members = Layer.succeed(MemberStore.Service, {
    ...fixture.members(workspaceId),
    ...overrides,
  });
  const host = Layer.mergeAll(
    members,
    Layer.succeed(Store.Service, fixture.store),
    CommittedEvents.layer(workspaceId),
    Layer.succeed(Checkpoint.Service, fixture.checkpoints),
    Layer.succeed(RoleStore.Service, fixture.roles(workspaceId)),
    Layer.succeed(AssignmentStore.Service, fixture.assignments(workspaceId)),
    PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Remove]),
  );
  const journal = Journal.layer({
    logId: Log.Id.make("workspace-one/journal"),
    projections: [MemberProjection.definition, AssignmentProjection.definition],
  }).pipe(Layer.provide(Log.layer));
  const authorization = Authorization.layer.pipe(Layer.provide(GrantResolver.layer));
  const services = Layer.mergeAll(journal, authorization).pipe(Layer.provide(host));
  const workspace = Layer.succeed(WorkspaceStore.Service, {
    workspaceId,
    get: Effect.succeedSome({
      id: workspaceId,
      createdBy: Identity.HumanId.make("alice"),
      name: "Test workspace",
      ownerMemberId: alice.memberId,
    }),
    insert: () => Effect.die("Workspace insertion is not used by membership operations"),
    transferOwnership: () => Effect.die("Ownership transfer is not used by membership operations"),
    ...workspaceOverrides,
  });
  const invitations = Layer.succeed(InvitationStore.Service, {
    workspaceId,
    listPendingByRecipient: () => Effect.succeed([]),
    list: Effect.succeed([]),
    get: () => Effect.die("Invitation lookup is not used in these member tests"),
    insert: () => Effect.die("Invitation insertion is not used in these member tests"),
    settle: () => Effect.die("These member tests have no pending invitations"),
  });
  const delegation = Delegation.layer.pipe(
    Layer.provide(Layer.mergeAll(services, workspace, host)),
  );
  // Keep the journal available to exercise reads inside an outer application commit.
  return MemberApplication.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(services, workspace, invitations, delegation)),
    Layer.provide(members),
  );
};
const get = Effect.fn("MemberApplicationTest.get")(function* (id: Member.Id) {
  return yield* (yield* MemberApplication.Service).get(id);
});
const remove = Effect.fn("MemberApplicationTest.remove")(function* (id: Member.Id) {
  return yield* (yield* MemberApplication.Service).remove(id);
});
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    | MemberApplication.Service
    | Journal.Service
    | Authorization.Service
    | Delegation.Service
    | WorkspaceStore.Service
    | InvitationStore.Service
    | Actor.Service
  >,
  actor: Actor.Value = alice,
  overrides: Partial<MemberStore.Interface> = {},
  workspaceOverrides: Partial<WorkspaceStore.Interface> = {},
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(configured(fixture, overrides, workspaceOverrides)),
      Effect.provideService(Actor.Service, actor),
    ),
  );
const seed = (fixture: Fixture, assignments: ReadonlyArray<Assignment.Record> = []) =>
  Effect.runPromise(
    fixture.store.transaction(
      Effect.gen(function* () {
        const members = fixture.members(workspaceId);
        for (const actor of [alice, agent]) {
          yield* members.insert({
            id: actor.memberId,
            workspaceId,
            identity: actor.identity,
            status: "active",
          });
        }
        yield* members.insert(bob);
        for (const value of assignments) yield* fixture.assignments(workspaceId).insert(value);
      }),
    ),
  );

test("member reads require only the current actor and leave the journal unchanged", async () => {
  expectTypeOf<Layer.Services<typeof MemberApplication.layer>>().toEqualTypeOf<
    | MemberStore.Service
    | WorkspaceStore.Service
    | InvitationStore.Service
    | Authorization.Service
    | Delegation.Service
    | Journal.Service
  >();
  expectTypeOf<
    Layer.Error<typeof MemberApplication.layer>
  >().toEqualTypeOf<MemberApplication.WorkspaceMismatch>();
  expectTypeOf<
    Effect.Services<ReturnType<MemberApplication.Interface["get"]>>
  >().toEqualTypeOf<Actor.Service>();
  expectTypeOf<
    Effect.Error<ReturnType<MemberApplication.Interface["get"]>>
  >().toEqualTypeOf<MemberApplication.Error>();
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("read-bob")]);
  const before = await Effect.runPromise(fixture.snapshot);
  const attempts = await Effect.runPromise(fixture.attempts);
  expect(await run(fixture, get(bob.id))).toEqual(bob);
  expect(await Effect.runPromise(fixture.attempts)).toBe(attempts + 1);
  expect(await Effect.runPromise(fixture.snapshot)).toEqual(before);

  await Effect.runPromise(
    fixture.store.transaction(fixture.members(workspaceId).markRemoved(bob.id)),
  );
  expect(await run(fixture, get(bob.id))).toMatchObject({ id: bob.id, status: "removed" });
});

test("authorization precedes the target lookup and NotFound is only exposed to authorized callers", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("read-bob")]);
  const lookedUp: Array<Member.Id> = [];
  const overrides = {
    get: Effect.fn("MemberApplicationTest.observeGet")(function* (id: Member.Id) {
      lookedUp.push(id);
      return yield* fixture.members(workspaceId).get(id);
    }),
  };
  for (const id of [agent.memberId, missingId]) {
    expect(await run(fixture, get(id).pipe(Effect.flip), alice, overrides)).toMatchObject({
      _tag: "Authorization.Denied",
      requirement: { permission: { name: MemberPermissions.Read.name }, target: { memberId: id } },
    });
  }
  expect(lookedUp).toEqual([alice.memberId, alice.memberId]);

  await Effect.runPromise(
    fixture.store.transaction(
      fixture
        .assignments(workspaceId)
        .insert(assignment("read-workspace", Scope.Value.cases.Workspace.make({ workspaceId }))),
    ),
  );
  expect(await run(fixture, get(missingId).pipe(Effect.flip))).toMatchObject({
    _tag: "MemberApplication.NotFound",
    workspaceId,
    memberId: missingId,
  });
});

test("a shared member application uses each call's actor and current membership", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("read-bob")]);
  const application = await run(fixture, MemberApplication.Service);
  expect(application.workspaceId).toBe(workspaceId);
  const read = application.get(bob.id);
  expect(await Effect.runPromise(read.pipe(Effect.provideService(Actor.Service, alice)))).toEqual(
    bob,
  );
  expect(
    await Effect.runPromise(read.pipe(Effect.provideService(Actor.Service, agent), Effect.flip)),
  ).toMatchObject({ _tag: "Authorization.Denied", memberId: agent.memberId });
  await Effect.runPromise(
    fixture.store.transaction(fixture.members(workspaceId).markRemoved(alice.memberId)),
  );
  expect(
    await Effect.runPromise(read.pipe(Effect.provideService(Actor.Service, alice), Effect.flip)),
  ).toMatchObject({ _tag: "Authorization.InvalidActor", reason: "membership-removed" });
});

test("member reads join the current commit and see staged grants and membership projections", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  const readBob = assignment("read-bob");
  const attempts = await Effect.runPromise(fixture.attempts);
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* Journal.Service;
      const application = yield* MemberApplication.Service;
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(AssignmentFacts.Created, {
            assignmentId: readBob.id,
            workspaceId,
            memberId: alice.memberId,
            source: readBob.source,
          });
          yield* journal.publish(MemberFacts.Removed, { workspaceId, memberId: bob.id });
          expect(yield* application.get(bob.id)).toMatchObject({ id: bob.id, status: "removed" });
        }),
      );
    }),
  );
  expect(await Effect.runPromise(fixture.attempts)).toBe(attempts + 1);
  const snapshot = await Effect.runPromise(fixture.snapshot);
  expect(snapshot.logs.size).toBe(1);
  expect(
    [...snapshot.logs.values()].flatMap((batches) => batches.flatMap((batch) => batch.entries)),
  ).toHaveLength(2);
});

test("a staged revocation denies the read and rolls back the enclosing commit", async () => {
  const fixture = await Effect.runPromise(make());
  const readBob = assignment("read-bob");
  await seed(fixture, [readBob]);
  const before = await Effect.runPromise(fixture.snapshot);
  const failure = await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* Journal.Service;
      const application = yield* MemberApplication.Service;
      return yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(AssignmentFacts.Revoked, {
            workspaceId,
            assignmentId: readBob.id,
          });
          return yield* application.get(bob.id);
        }),
      );
    }).pipe(Effect.flip),
  );
  expect(failure).toMatchObject({ _tag: "Authorization.Denied" });
  expect(await Effect.runPromise(fixture.snapshot)).toEqual(before);
  expect(await run(fixture, get(bob.id))).toEqual(bob);
});

test("member application rejects mismatched workspace composition and callers", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("read-bob")]);
  const failure = await run(
    fixture,
    MemberApplication.make().pipe(
      Effect.provideService(MemberStore.Service, fixture.members(foreignWorkspaceId)),
      Effect.flip,
    ),
  );
  expect(failure).toMatchObject({
    _tag: "MemberApplication.WorkspaceMismatch",
    expectedWorkspaceId: workspaceId,
    actualWorkspaceId: foreignWorkspaceId,
  });
  const foreignActor = Actor.Value.make({
    workspaceId: foreignWorkspaceId,
    memberId: alice.memberId,
    identity: alice.identity,
  });
  expect(await run(fixture, get(bob.id).pipe(Effect.flip), foreignActor)).toMatchObject({
    _tag: "Authorization.WorkspaceMismatch",
  });
});

test("member reads preserve storage failures and reject records outside the authorized target", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("read-bob")]);
  const storageFailure = new MemberStore.Failure({ operation: "get", cause: "unavailable" });
  expect(
    await run(fixture, get(bob.id).pipe(Effect.flip), alice, {
      get: (id) =>
        id === bob.id ? Effect.fail(storageFailure) : fixture.members(workspaceId).get(id),
    }),
  ).toBe(storageFailure);

  const responses = [
    {
      record: { id: agent.memberId, workspaceId, identity: bob.identity, status: bob.status },
      tag: "MemberApplication.InvalidResponse",
    },
    {
      record: {
        id: bob.id,
        workspaceId: foreignWorkspaceId,
        identity: bob.identity,
        status: bob.status,
      },
      tag: "MemberApplication.WorkspaceMismatch",
    },
  ];
  for (const { record, tag } of responses) {
    expect(
      await run(fixture, get(bob.id).pipe(Effect.flip), alice, {
        get: (id) =>
          id === bob.id ? Effect.succeedSome(record) : fixture.members(workspaceId).get(id),
      }),
    ).toMatchObject({ _tag: tag });
  }
  const invalid = Member.Record.make({
    id: bob.id,
    workspaceId,
    identity: bob.identity,
    status: "active",
  });
  Object.assign(invalid, { status: "unknown" });
  expect(
    await run(fixture, get(bob.id).pipe(Effect.flip), alice, {
      get: (id) =>
        id === bob.id ? Effect.succeedSome(invalid) : fixture.members(workspaceId).get(id),
    }),
  ).toMatchObject({ _tag: "SchemaError" });
});

test("exact-target removal needs no read grant and rejects an actor retained before removal", async () => {
  expectTypeOf<
    Effect.Services<ReturnType<MemberApplication.Interface["remove"]>>
  >().toEqualTypeOf<Actor.Service>();
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("remove-bob", bobScope, MemberPermissions.Remove)]);
  const application = await run(fixture, MemberApplication.Service);
  expect(await run(fixture, get(bob.id).pipe(Effect.flip))).toMatchObject({
    _tag: "Authorization.Denied",
  });
  expect(await run(fixture, remove(agent.memberId).pipe(Effect.flip))).toMatchObject({
    _tag: "Authorization.Denied",
  });
  const removed = await run(fixture, remove(bob.id));
  expect(removed).toEqual({ id: bob.id, workspaceId, identity: bob.identity, status: "removed" });
  expect(await Effect.runPromise(fixture.members(workspaceId).get(bob.id))).toEqual(
    Option.some(removed),
  );
  const staleActor = Actor.Value.make({ workspaceId, memberId: bob.id, identity: bob.identity });
  expect(
    await Effect.runPromise(
      application.get(bob.id).pipe(Effect.provideService(Actor.Service, staleActor), Effect.flip),
    ),
  ).toMatchObject({ _tag: "Authorization.InvalidActor", reason: "membership-removed" });
  const beforeRepeat = await Effect.runPromise(fixture.snapshot);
  expect(await run(fixture, remove(bob.id).pipe(Effect.flip))).toMatchObject({
    _tag: "MemberApplication.AlreadyRemoved",
  });
  expect(await Effect.runPromise(fixture.snapshot)).toEqual(beforeRepeat);
});

test("removal checks permission before disclosing a missing target and protects the owner from any member", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("read-bob")]);
  const before = await Effect.runPromise(fixture.snapshot);
  // Ownership and read permission each confer no removal authority.
  for (const id of [bob.id, missingId, alice.memberId]) {
    expect(await run(fixture, remove(id).pipe(Effect.flip))).toMatchObject({
      _tag: "Authorization.Denied",
    });
  }
  expect(await Effect.runPromise(fixture.snapshot)).toEqual(before);
  const workspaceScope = Scope.Value.cases.Workspace.make({ workspaceId });
  const ownerGrant = assignment("remove-workspace", workspaceScope, MemberPermissions.Remove);
  await Effect.runPromise(
    fixture.store.transaction(
      Effect.gen(function* () {
        yield* fixture.assignments(workspaceId).insert(ownerGrant);
        yield* fixture.assignments(workspaceId).insert({
          id: Assignment.Id.make("agent-remove-workspace"),
          workspaceId,
          memberId: agent.memberId,
          source: ownerGrant.source,
          status: "active",
        });
      }),
    ),
  );
  const authorized = await Effect.runPromise(fixture.snapshot);
  expect(await run(fixture, remove(missingId).pipe(Effect.flip))).toMatchObject({
    _tag: "MemberApplication.NotFound",
  });
  for (const actor of [alice, agent]) {
    expect(await run(fixture, remove(alice.memberId).pipe(Effect.flip), actor)).toMatchObject({
      _tag: "MemberApplication.OwnerProtected",
      workspaceId,
      memberId: alice.memberId,
    });
  }
  expect(await Effect.runPromise(fixture.snapshot)).toEqual(authorized);
  // An authorized non-owner, including an agent, can remove their own membership.
  expect(await run(fixture, remove(agent.memberId), agent)).toMatchObject({
    id: agent.memberId,
    status: "removed",
  });
});

test("removal fails closed when ownership cannot be read reliably", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("remove-bob", bobScope, MemberPermissions.Remove)]);
  const before = await Effect.runPromise(fixture.snapshot);
  const responses: ReadonlyArray<{ get: WorkspaceStore.Interface["get"]; tag: string }> = [
    { get: Effect.succeedNone, tag: "MemberApplication.InvalidResponse" },
    {
      get: Effect.succeedSome({
        id: foreignWorkspaceId,
        createdBy: Identity.HumanId.make("alice"),
        name: "Test workspace",
        ownerMemberId: alice.memberId,
      }),
      tag: "MemberApplication.WorkspaceMismatch",
    },
    {
      get: Effect.fail(new WorkspaceStore.Failure({ operation: "get", cause: "unavailable" })),
      tag: "WorkspaceStore.Failure",
    },
  ];
  for (const { get: readWorkspace, tag } of responses) {
    expect(
      await run(fixture, remove(bob.id).pipe(Effect.flip), alice, {}, { get: readWorkspace }),
    ).toMatchObject({ _tag: tag });
    expect(await Effect.runPromise(fixture.snapshot)).toEqual(before);
  }
  const composition = await run(
    fixture,
    MemberApplication.make().pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MemberStore.Service, fixture.members(workspaceId)),
          Layer.succeed(WorkspaceStore.Service, {
            workspaceId: foreignWorkspaceId,
            get: Effect.succeedNone,
            insert: () => Effect.die("Unexpected workspace insertion"),
            transferOwnership: () => Effect.die("Unexpected ownership transfer"),
          }),
        ),
      ),
      Effect.flip,
    ),
  );
  expect(composition).toMatchObject({
    _tag: "MemberApplication.WorkspaceMismatch",
    actualWorkspaceId: foreignWorkspaceId,
  });
});

test("removal joins an outer commit, sees staged permission, and rolls back with that commit", async () => {
  const fixture = await Effect.runPromise(make());
  await seed(fixture);
  const granted = assignment("remove-bob", bobScope, MemberPermissions.Remove);
  const program = Effect.gen(function* () {
    const journal = yield* Journal.Service;
    const application = yield* MemberApplication.Service;
    return yield* journal.commit(
      Effect.gen(function* () {
        yield* journal.publish(AssignmentFacts.Created, {
          assignmentId: granted.id,
          workspaceId,
          memberId: alice.memberId,
          source: granted.source,
        });
        return yield* application.remove(bob.id);
      }),
    );
  });
  const before = await Effect.runPromise(fixture.snapshot);
  const failure = await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* Journal.Service;
      return yield* journal.commit(
        Effect.gen(function* () {
          yield* program;
          return yield* Effect.fail("abort");
        }),
      );
    }).pipe(Effect.flip),
  );
  expect(failure).toBe("abort");
  expect(await Effect.runPromise(fixture.snapshot)).toEqual(before);
  const attempts = await Effect.runPromise(fixture.attempts);
  expect(await run(fixture, program)).toMatchObject({ status: "removed" });
  expect(await Effect.runPromise(fixture.attempts)).toBe(attempts + 1);
  const snapshot = await Effect.runPromise(fixture.snapshot);
  expect(
    [...snapshot.logs.values()].flatMap((batches) => batches.flatMap((batch) => batch.entries)),
  ).toHaveLength(2);
});

test("listing returns the memberships the actor may read, including removed ones, and nothing more", async () => {
  const list = Effect.flatMap(MemberApplication.Service, (service) => service.list);
  const fixture = await Effect.runPromise(make());
  await seed(fixture, [assignment("read-bob")]);
  // An exact grant sees that member only; the actor's own record needs its own grant.
  expect((await run(fixture, list)).map((member) => member.id)).toEqual([bob.id]);
  // Without any read grant the listing is empty rather than denied.
  expect(await run(fixture, list, agent)).toEqual([]);
  // A workspace-scoped grant sees everyone, and removal keeps the record listed.
  await Effect.runPromise(
    fixture.store.transaction(
      Effect.gen(function* () {
        yield* fixture
          .assignments(workspaceId)
          .insert(assignment("read-all", Scope.Value.cases.Workspace.make({ workspaceId })));
        yield* fixture.members(workspaceId).markRemoved(bob.id);
      }),
    ),
  );
  const statuses = new Map(
    (await run(fixture, list)).map((member) => [member.id, member.status] as const),
  );
  expect(statuses).toEqual(
    new Map([
      [alice.memberId, "active"],
      [agent.memberId, "active"],
      [bob.id, "removed"],
    ]),
  );
  // A removed actor cannot list at all.
  await Effect.runPromise(
    fixture.store.transaction(fixture.members(workspaceId).markRemoved(alice.memberId)),
  );
  expect(await run(fixture, Effect.flip(list))).toMatchObject({
    _tag: "Authorization.InvalidActor",
    reason: "membership-removed",
  });
});
