import { expect, expectTypeOf, test } from "bun:test";
import { Effect, Layer } from "effect";
import { AssignmentFacts } from "../src/authorization/assignment-facts.ts";
import { AssignmentProjection } from "../src/authorization/assignment-projection.ts";
import { AssignmentStore } from "../src/authorization/assignment-store.ts";
import { Assignment } from "../src/authorization/assignment.ts";
import { Authorization } from "../src/authorization/authorization.ts";
import { GrantResolver } from "../src/authorization/grant-resolver.ts";
import { Grant } from "../src/authorization/grant.ts";
import { PermissionCatalog } from "../src/authorization/permission-catalog.ts";
import { RoleStore } from "../src/authorization/role-store.ts";
import { Scope } from "../src/authorization/scope.ts";
import { Target } from "../src/authorization/target.ts";
import { Actor } from "../src/identity/actor.ts";
import { Identity } from "../src/identity/identity.ts";
import { Checkpoint } from "../src/journal/checkpoint.ts";
import { Journal } from "../src/journal/journal.ts";
import { Log } from "../src/journal/log.ts";
import { Store } from "../src/journal/store.ts";
import { MemberApplication } from "../src/workspace/member-application.ts";
import { MemberFacts } from "../src/workspace/member-facts.ts";
import { MemberPermissions } from "../src/workspace/member-permissions.ts";
import { MemberProjection } from "../src/workspace/member-projection.ts";
import { MemberStore } from "../src/workspace/member-store.ts";
import { Member } from "../src/workspace/member.ts";
import { Workspace } from "../src/workspace/workspace.ts";
import { make, type Fixture } from "./memory-store.ts";

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
const assignment = (id: string, scope: Scope.Value = bobScope) =>
  Assignment.Record.make({
    id: Assignment.Id.make(id),
    workspaceId,
    memberId: alice.memberId,
    source: Assignment.Source.cases.Direct.make({
      grant: Grant.make(MemberPermissions.Read, scope),
    }),
    status: "active",
  });

const configured = (fixture: Fixture, overrides: Partial<MemberStore.Interface> = {}) => {
  const members = Layer.succeed(MemberStore.Service, {
    ...fixture.members(workspaceId),
    ...overrides,
  });
  const host = Layer.mergeAll(
    members,
    Layer.succeed(Store.Service, fixture.store),
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
  // Keep the journal available to exercise reads inside an outer application commit.
  return MemberApplication.layer.pipe(Layer.provideMerge(services), Layer.provide(members));
};
const get = Effect.fn("MemberApplicationTest.get")(function* (id: Member.Id) {
  return yield* (yield* MemberApplication.Service).get(id);
});
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    MemberApplication.Service | Journal.Service | Authorization.Service | Actor.Service
  >,
  actor: Actor.Value = alice,
  overrides: Partial<MemberStore.Interface> = {},
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(configured(fixture, overrides)),
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
    MemberStore.Service | Authorization.Service | Journal.Service
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
