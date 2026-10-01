import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Exit, Layer, Option } from "effect";
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
  program: Effect.Effect<A, E, Authorization.Service | Actor.Service>,
  actor: Actor.Value = alice,
  overrides: Overrides = {},
) =>
  program.pipe(
    Effect.provide(configured(fixture, overrides)),
    Effect.provideService(Actor.Service, actor),
  );
const seed = (
  fixture: Fixture,
  actors: ReadonlyArray<Actor.Value>,
  assignments: ReadonlyArray<Assignment.Record> = [],
  roles: ReadonlyArray<Role.Record> = [],
) =>
  fixture.store.transaction(
    Effect.gen(function* () {
      for (const actor of actors) yield* fixture.members(workspaceId).insert(membership(actor));
      for (const role of roles) yield* fixture.roles(workspaceId).insert(role);
      for (const assignment of assignments)
        yield* fixture.assignments(workspaceId).insert(assignment);
    }),
  );
it.effect("authorization reads each caller's actor and uses an agent's own grants", () =>
  Effect.gen(function* () {
    expectTypeOf<Layer.Services<typeof Authorization.layer>>().toEqualTypeOf<
      MemberStore.Service | GrantResolver.Service | PermissionCatalog.Service
    >();
    expectTypeOf<Layer.Error<typeof Authorization.layer>>().toEqualTypeOf<never>();
    expectTypeOf<
      Effect.Services<ReturnType<Authorization.Interface["require"]>>
    >().toEqualTypeOf<Actor.Service>();
    expectTypeOf<
      Effect.Success<ReturnType<typeof Authorization.make>>
    >().toEqualTypeOf<Authorization.Interface>();
    expectTypeOf<
      Effect.Error<ReturnType<Authorization.Interface["require"]>>
    >().toEqualTypeOf<Authorization.Error>();
    const fixture = yield* make();
    yield* seed(
      fixture,
      [alice, agent],
      [
        direct("alice-remove", alice.memberId, MemberPermissions.Remove),
        direct("agent-read", agent.memberId, MemberPermissions.Read),
      ],
    );
    const authorization = yield* Authorization.Service.pipe(
      Effect.provide(configured(fixture)),
      Effect.provideService(Actor.Service, alice),
    );
    expect(authorization.workspaceId).toBe(workspaceId);
    yield* fixture.store
      .transaction(authorization.require([removeBob]))
      .pipe(Effect.provideService(Actor.Service, alice));
    const agentDenied = yield* fixture.store
      .transaction(authorization.require([removeBob]).pipe(Effect.flip))
      .pipe(Effect.provideService(Actor.Service, agent));
    expect(agentDenied).toMatchObject({
      _tag: "Authorization.Denied",
      memberId: agent.memberId,
      requirement: removeBob,
    });
    yield* fixture.store
      .transaction(authorization.require([readBob]))
      .pipe(Effect.provideService(Actor.Service, agent));
    const humanDenied = yield* fixture.store
      .transaction(authorization.require([readBob]).pipe(Effect.flip))
      .pipe(Effect.provideService(Actor.Service, alice));
    expect(humanDenied).toMatchObject({ _tag: "Authorization.Denied", memberId: alice.memberId });
  }),
);

it.effect("authorization requires a matching permission and scope for the actual target", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [alice]);
    expect(yield* run(fixture, Effect.flip(check([readBob])))).toMatchObject({
      _tag: "Authorization.Denied",
      requirement: readBob,
    });
    yield* seed(
      fixture,
      [],
      [direct("read-bob", alice.memberId, MemberPermissions.Read, bobScope)],
    );
    yield* run(fixture, check([readBob]));
    expect(yield* run(fixture, Effect.flip(check([readCharlie])))).toMatchObject({
      _tag: "Authorization.Denied",
      requirement: readCharlie,
    });
    expect(yield* run(fixture, Effect.flip(check([removeBob])))).toMatchObject({
      _tag: "Authorization.Denied",
      requirement: removeBob,
    });
    yield* seed(
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
    yield* run(fixture, check([removeBob, removeCharlie, createInWorkspace]));
    expect(yield* run(fixture, Effect.flip(check([readCharlie])))).toMatchObject({
      _tag: "Authorization.Denied",
    });
  }),
);

it.effect("every requirement must be satisfied across role and direct assignments", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const roleId = Role.Id.make("reader");
    yield* seed(
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
    yield* run(fixture, check([readBob, readCharlie, removeBob]));
    expect(
      yield* run(fixture, Effect.flip(check([readBob, removeBob, removeCharlie]))),
    ).toMatchObject({
      _tag: "Authorization.Denied",
      requirement: removeCharlie,
    });
  }),
);

it.effect("permitted reports each requirement in order without failing on denials", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(
      fixture,
      [alice, bob],
      [
        direct("read-all", alice.memberId, MemberPermissions.Read),
        direct("remove-bob", alice.memberId, MemberPermissions.Remove, bobScope),
      ],
    );
    const permitted = (requirements: ReadonlyArray<Requirement.Value>) =>
      Effect.flatMap(Authorization.Service, (service) => service.permitted(requirements));
    expect(
      yield* run(fixture, permitted([readBob, removeBob, removeCharlie, readCharlie])),
    ).toEqual([true, true, false, true]);
    expect(yield* run(fixture, permitted([]))).toEqual([]);
    expect(yield* run(fixture, permitted([readBob]), bob)).toEqual([false]);
    // The actor check still fails rather than reporting denials.
    expect(yield* run(fixture, Effect.flip(permitted([readBob])), charlie)).toMatchObject({
      _tag: "Authorization.InvalidActor",
    });
  }),
);

it.effect(
  "a built-in role's identity and permission tiers never bypass its stored permissions or scope",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* seed(
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
      yield* run(fixture, check([removeBob]));
      // Possessing an administrator-tier permission does not imply viewer-tier access.
      expect(yield* run(fixture, Effect.flip(check([readBob])))).toMatchObject({
        _tag: "Authorization.Denied",
        requirement: readBob,
      });
      expect(yield* run(fixture, Effect.flip(check([removeCharlie])))).toMatchObject({
        _tag: "Authorization.Denied",
        requirement: removeCharlie,
      });
    }),
);

it.effect(
  "missing or removed acting memberships fail even when assignments still grant access",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* seed(fixture, [], [direct("remove", alice.memberId, MemberPermissions.Remove)]);
      for (const requirements of [[], [removeBob]]) {
        expect(yield* run(fixture, Effect.flip(check(requirements)))).toMatchObject({
          _tag: "Authorization.InvalidActor",
          memberId: alice.memberId,
          reason: "membership-missing",
        });
      }
      yield* seed(fixture, [alice]);
      yield* run(fixture, check([removeBob]));
      yield* run(fixture, check([]));
      yield* fixture.store.transaction(fixture.members(workspaceId).markRemoved(alice.memberId));
      for (const requirements of [[], [removeBob]]) {
        expect(yield* run(fixture, Effect.flip(check(requirements)))).toMatchObject({
          _tag: "Authorization.InvalidActor",
          memberId: alice.memberId,
          reason: "membership-removed",
        });
      }
    }),
);

it.effect("acting identity must match both the membership's identity kind and ID", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [alice], [direct("remove", alice.memberId, MemberPermissions.Remove)]);
    const wrongIdentities = [
      Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("different") }),
      agent.identity,
    ];
    for (const identity of wrongIdentities) {
      const mismatched = Actor.Value.make({ workspaceId, memberId: alice.memberId, identity });
      expect(yield* run(fixture, Effect.flip(check([removeBob])), mismatched)).toMatchObject({
        _tag: "Authorization.InvalidActor",
        reason: "identity-mismatch",
      });
    }
  }),
);

it.effect("an actor or a target from another workspace is refused", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [alice], [direct("read", alice.memberId, MemberPermissions.Read)]);
    const mismatch = {
      _tag: "Authorization.WorkspaceMismatch",
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: foreignWorkspaceId,
    };
    const foreignActor = Actor.Value.make({
      workspaceId: foreignWorkspaceId,
      memberId: alice.memberId,
      identity: alice.identity,
    });
    expect(yield* run(fixture, Effect.flip(check([readBob])), foreignActor)).toMatchObject(
      mismatch,
    );
    const foreignRequirement = Requirement.make(
      MemberPermissions.Read,
      Target.Reference.cases.Member.make({
        workspaceId: foreignWorkspaceId,
        memberId: bob.memberId,
      }),
    );
    expect(yield* run(fixture, Effect.flip(check([foreignRequirement])))).toMatchObject(mismatch);
  }),
);

it.effect("requirements are validated against canonical permission definitions", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [alice], [direct("remove", alice.memberId, MemberPermissions.Remove)]);
    const unregistered = Permission.make("member.unregistered", {
      targetKind: "Member",
      builtinTier: "member",
    });
    expect(
      yield* run(fixture, Effect.flip(check([Requirement.make(unregistered, bobTarget)]))),
    ).toMatchObject({ _tag: "PermissionCatalog.Unknown", name: unregistered.name });
    // A requirement whose target is not the kind the catalog declares is a bug, not a denial.
    const wrongDefinition = Permission.make(MemberPermissions.Remove.name, {
      targetKind: "Workspace",
      builtinTier: "administrator",
    });
    const wrongKind = Requirement.make(wrongDefinition, workspaceTarget);
    const malformed: Requirement.Value = {
      permission: MemberPermissions.Remove,
      target: workspaceTarget,
    };
    for (const requirement of [wrongKind, malformed])
      expect(Exit.hasDies(yield* Effect.exit(run(fixture, check([requirement]))))).toBe(true);
  }),
);

it.effect(
  "authorization observes transactional changes and protects the mutation in the same commit",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const roleId = Role.Id.make("manager");
      const assignmentId = Assignment.Id.make("manager-assignment");
      const source = Assignment.Source.cases.Role.make({ roleId, scope: workspaceScope });
      yield* seed(
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
        [
          {
            id: roleId,
            workspaceId,
            name: "Manager",
            permissions: [MemberPermissions.Remove.name],
          },
        ],
      );
      yield* Effect.gen(function* () {
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
            yield* journal
              .publish(MemberFacts.Removed, { workspaceId, memberId: bob.memberId })
              .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
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
              yield* journal
                .publish(RoleFacts.PermissionsChanged, {
                  roleId,
                  workspaceId,
                  permissions: [],
                })
                .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
              yield* authorization.require([removeCharlie]);
              yield* journal
                .publish(MemberFacts.Removed, {
                  workspaceId,
                  memberId: charlie.memberId,
                })
                .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
            }),
          ),
        );
        expect(denied._tag).toBe("Authorization.Denied");
        expect(yield* fixture.snapshot).toEqual(before);
        yield* journal
          .publish(RoleFacts.PermissionsChanged, {
            roleId,
            workspaceId,
            permissions: [],
          })
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        expect(
          yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        yield* journal
          .publish(RoleFacts.PermissionsChanged, {
            roleId,
            workspaceId,
            permissions: [MemberPermissions.Remove.name],
          })
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        yield* journal
          .publish(AssignmentFacts.Revoked, { assignmentId, workspaceId, memberId: alice.memberId })
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        expect(
          yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        yield* journal
          .publish(AssignmentFacts.Created, {
            assignmentId: Assignment.Id.make("reassigned"),
            workspaceId,
            memberId: alice.memberId,
            source,
          })
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        yield* journal.commit(authorization.require([removeCharlie]));
        const beforeRemoval = yield* fixture.snapshot;
        const inactive = yield* Effect.flip(
          journal.commit(
            Effect.gen(function* () {
              yield* journal
                .publish(MemberFacts.Removed, { workspaceId, memberId: alice.memberId })
                .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
              yield* authorization.require([removeCharlie]);
            }),
          ),
        );
        expect(inactive).toMatchObject({
          _tag: "Authorization.InvalidActor",
          reason: "membership-removed",
        });
        expect(yield* fixture.snapshot).toEqual(beforeRemoval);
        yield* journal
          .publish(MemberFacts.Removed, { workspaceId, memberId: alice.memberId })
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        expect(
          yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
        ).toMatchObject({ _tag: "Authorization.InvalidActor", reason: "membership-removed" });
      }).pipe(
        Effect.provide(Layer.mergeAll(configured(fixture), Log.layer)),
        Effect.provideService(Store.Service, fixture.store),
        Effect.provideService(Checkpoint.Service, fixture.checkpoints),
        Effect.provideService(MemberStore.Service, fixture.members(workspaceId)),
        Effect.provideService(RoleStore.Service, fixture.roles(workspaceId)),
        Effect.provideService(AssignmentStore.Service, fixture.assignments(workspaceId)),
        Effect.provideService(Actor.Service, alice),
      );
    }),
);

it.effect("a membership storage failure fails authorization", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [alice], [direct("read", alice.memberId, MemberPermissions.Read)]);
    const failure = new MemberStore.Failure({ operation: "get", cause: "unavailable" });
    expect(
      yield* run(fixture, Effect.flip(check([readBob])), alice, {
        members: { get: () => Effect.fail(failure) },
      }),
    ).toBe(failure);
  }),
);

it.effect(
  "resolver failures propagate even when another assignment could satisfy the requirement",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* seed(
        fixture,
        [alice],
        [
          direct("read", alice.memberId, MemberPermissions.Read),
          Assignment.Record.make({
            id: Assignment.Id.make("by-role"),
            workspaceId,
            memberId: alice.memberId,
            status: "active",
            source: Assignment.Source.cases.Role.make({
              roleId: BuiltinRoles.MemberId,
              scope: workspaceScope,
            }),
          }),
        ],
      );
      const failure = new RoleStore.Failure({ operation: "get", cause: "unavailable" });
      expect(
        yield* run(fixture, Effect.flip(check([readBob])), alice, {
          roles: { get: () => Effect.fail(failure) },
        }),
      ).toBe(failure);
    }),
);
