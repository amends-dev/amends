import * as Publication from "../../src/journal/Publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Exit, Layer, Option } from "effect";
import * as AssignmentFacts from "../../src/authorization/AssignmentFacts.ts";
import * as AssignmentProjection from "../../src/authorization/AssignmentProjection.ts";
import * as AssignmentStore from "../../src/authorization/AssignmentStore.ts";
import * as Assignment from "../../src/authorization/Assignment.ts";
import * as Authorization from "../../src/authorization/Authorization.ts";
import * as BuiltinRoles from "../../src/authorization/BuiltinRoles.ts";
import * as GrantResolver from "../../src/authorization/GrantResolver.ts";
import * as Grant from "../../src/authorization/Grant.ts";
import * as PermissionCatalog from "../../src/authorization/PermissionCatalog.ts";
import * as Permission from "../../src/authorization/Permission.ts";
import * as Requirement from "../../src/authorization/Requirement.ts";
import * as RoleFacts from "../../src/authorization/RoleFacts.ts";
import * as RoleProjection from "../../src/authorization/RoleProjection.ts";
import * as RoleStore from "../../src/authorization/RoleStore.ts";
import * as Role from "../../src/authorization/Role.ts";
import * as Scope from "../../src/authorization/Scope.ts";
import * as Target from "../../src/authorization/Target.ts";
import * as Actor from "../../src/identity/Actor.ts";
import * as Identity from "../../src/identity/Identity.ts";
import * as Checkpoint from "../../src/journal/Checkpoint.ts";
import * as Journal from "../../src/journal/Journal.ts";
import * as Entry from "../../src/journal/Entry.ts";
import * as Log from "../../src/journal/Log.ts";
import * as Store from "../../src/journal/Store.ts";
import * as MemberFacts from "../../src/workspace/MemberFacts.ts";
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts";
import * as MemberProjection from "../../src/workspace/MemberProjection.ts";
import * as MemberStore from "../../src/workspace/MemberStore.ts";
import * as Member from "../../src/workspace/Member.ts";
import * as Workspace from "../../src/workspace/Workspace.ts";
import { make, type Fixture } from "../memory.ts";
import * as StoreError from "../../src/journal/StoreError.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const foreignWorkspaceId = Workspace.Id.make("workspace-two");
const alice = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("alice"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("same-id") }),
});
const bob = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("bob"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
});
const charlie = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("charlie"),
  identity: Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("charlie") }),
});
const agent = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("agent"),
  identity: Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("same-id") }),
});
const membership = (actor: Actor.Actor["Service"]) =>
  Member.Member.make({
    id: actor.memberId,
    workspaceId: actor.workspaceId,
    identity: actor.identity,
    name: Member.Name.make(actor.identity.id),
    status: "active",
  });
const workspaceScope = Scope.Scope.cases.Workspace.make({ workspaceId });
const bobTarget = Target.Reference.cases.Member.make({ workspaceId, memberId: bob.memberId });
const charlieTarget = Target.Reference.cases.Member.make({
  workspaceId,
  memberId: charlie.memberId,
});
const bobScope = Scope.Scope.cases.Target.make({ target: bobTarget });
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
  scope: Scope.Scope = workspaceScope,
) =>
  Assignment.Assignment.make({
    id: Assignment.Id.make(id),
    workspaceId,
    memberId: recipient,
    source: Assignment.Source.cases.Direct.make({ grant: Grant.make(permission, scope) }),
    status: "active",
  });
interface Overrides {
  readonly members?: Partial<MemberStore.MemberStore["Service"]>;
  readonly roles?: Partial<RoleStore.RoleStore["Service"]>;
}
const dependencies = (fixture: Fixture, overrides: Overrides = {}) =>
  Layer.mergeAll(
    Layer.succeed(
      MemberStore.MemberStore,
      MemberStore.MemberStore.of({ ...fixture.members, ...overrides.members }),
    ),
    Layer.succeed(
      RoleStore.RoleStore,
      RoleStore.RoleStore.of({ ...fixture.roles, ...overrides.roles }),
    ),
    Layer.succeed(AssignmentStore.AssignmentStore, fixture.assignments),
    Layer.succeed(Store.Store, fixture.store),
    PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Remove, Create]),
  );
const configured = (fixture: Fixture, overrides: Overrides = {}) =>
  Authorization.layer.pipe(
    Layer.provide(GrantResolver.layer),
    Layer.provide(dependencies(fixture, overrides)),
  );
const check = Effect.fn("AuthorizationTest.check")(function* (
  requirements: ReadonlyArray<Requirement.Requirement>,
) {
  yield* (yield* Authorization.Authorization).require(requirements);
});
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, Authorization.Authorization | Actor.Actor>,
  actor: Actor.Actor["Service"] = alice,
  overrides: Overrides = {},
) =>
  program.pipe(
    Effect.provide(configured(fixture, overrides)),
    Effect.provideService(Actor.Actor, actor),
  );
const seed = (
  fixture: Fixture,
  actors: ReadonlyArray<Actor.Actor["Service"]>,
  assignments: ReadonlyArray<Assignment.Assignment> = [],
  roles: ReadonlyArray<Role.Role> = [],
) =>
  fixture.store.transaction(
    Effect.gen(function* () {
      for (const actor of actors) yield* fixture.members.insert(membership(actor));
      for (const role of roles) yield* fixture.roles.insert(role);
      for (const assignment of assignments) yield* fixture.assignments.insert(assignment);
    }),
  );
it.effect("authorization reads each caller's actor and uses an agent's own grants", () =>
  Effect.gen(function* () {
    expectTypeOf<Layer.Services<typeof Authorization.layer>>().toEqualTypeOf<
      | MemberStore.MemberStore
      | GrantResolver.GrantResolver
      | PermissionCatalog.PermissionCatalog
      | Store.Store
    >();
    expectTypeOf<Layer.Error<typeof Authorization.layer>>().toEqualTypeOf<never>();
    expectTypeOf<
      Effect.Services<ReturnType<Authorization.Authorization["Service"]["require"]>>
    >().toEqualTypeOf<Actor.Actor>();
    expectTypeOf<Effect.Success<ReturnType<typeof Authorization.make>>>().toEqualTypeOf<
      Authorization.Authorization["Service"]
    >();
    expectTypeOf<
      Effect.Error<ReturnType<Authorization.Authorization["Service"]["require"]>>
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
    const authorization = yield* Authorization.Authorization.pipe(
      Effect.provide(configured(fixture)),
      Effect.provideService(Actor.Actor, alice),
    );
    yield* fixture.store
      .transaction(authorization.require([removeBob]))
      .pipe(Effect.provideService(Actor.Actor, alice));
    const agentDenied = yield* fixture.store
      .transaction(authorization.require([removeBob]).pipe(Effect.flip))
      .pipe(Effect.provideService(Actor.Actor, agent));
    expect(agentDenied).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", memberId: agent.memberId, requirement: removeBob },
    });
    yield* fixture.store
      .transaction(authorization.require([readBob]))
      .pipe(Effect.provideService(Actor.Actor, agent));
    const humanDenied = yield* fixture.store
      .transaction(authorization.require([readBob]).pipe(Effect.flip))
      .pipe(Effect.provideService(Actor.Actor, alice));
    expect(humanDenied).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", memberId: alice.memberId },
    });
  }),
);

it.effect("authorization requires a matching permission and scope for the actual target", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [alice]);
    expect(yield* run(fixture, Effect.flip(check([readBob])))).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", requirement: readBob },
    });
    yield* seed(
      fixture,
      [],
      [direct("read-bob", alice.memberId, MemberPermissions.Read, bobScope)],
    );
    yield* run(fixture, check([readBob]));
    expect(yield* run(fixture, Effect.flip(check([readCharlie])))).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", requirement: readCharlie },
    });
    expect(yield* run(fixture, Effect.flip(check([removeBob])))).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", requirement: removeBob },
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
          Scope.Scope.cases.Target.make({ target: workspaceTarget }),
        ),
      ],
    );
    yield* run(fixture, check([removeBob, removeCharlie, createInWorkspace]));
    expect(yield* run(fixture, Effect.flip(check([readCharlie])))).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted" },
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
        Assignment.Assignment.make({
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
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", requirement: removeCharlie },
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
    const permitted = (requirements: ReadonlyArray<Requirement.Requirement>) =>
      Effect.flatMap(Authorization.Authorization, (authorization) =>
        authorization.permitted(requirements),
      );
    expect(
      yield* run(fixture, permitted([readBob, removeBob, removeCharlie, readCharlie])),
    ).toEqual([true, true, false, true]);
    expect(yield* run(fixture, permitted([]))).toEqual([]);
    expect(yield* run(fixture, permitted([readBob]), bob)).toEqual([false]);
    // The actor check still fails rather than reporting denials.
    expect(yield* run(fixture, Effect.flip(permitted([readBob])), charlie)).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "InvalidActor" },
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
        _tag: "CoreError.Denied",
        reason: { _tag: "NotGranted", requirement: readBob },
      });
      expect(yield* run(fixture, Effect.flip(check([removeCharlie])))).toMatchObject({
        _tag: "CoreError.Denied",
        reason: { _tag: "NotGranted", requirement: removeCharlie },
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
          _tag: "CoreError.Denied",
          reason: { _tag: "InvalidActor", memberId: alice.memberId, reason: "membership-missing" },
        });
      }
      yield* seed(fixture, [alice]);
      yield* run(fixture, check([removeBob]));
      yield* run(fixture, check([]));
      yield* fixture.store.transaction(fixture.members.markRemoved(alice.memberId));
      for (const requirements of [[], [removeBob]]) {
        expect(yield* run(fixture, Effect.flip(check(requirements)))).toMatchObject({
          _tag: "CoreError.Denied",
          reason: { _tag: "InvalidActor", memberId: alice.memberId, reason: "membership-removed" },
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
      const mismatched = Actor.Actor.of({ workspaceId, memberId: alice.memberId, identity });
      expect(yield* run(fixture, Effect.flip(check([removeBob])), mismatched)).toMatchObject({
        _tag: "CoreError.Denied",
        reason: { _tag: "InvalidActor", reason: "identity-mismatch" },
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
    const foreignActor = Actor.Actor.of({
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
    // A requirement naming a permission the host does not declare, or a target other than the
    // kind the catalog declares, is a bug, not a denial.
    const wrongDefinition = Permission.make(MemberPermissions.Remove.name, {
      targetKind: "Workspace",
      builtinTier: "administrator",
    });
    const wrongKind = Requirement.make(wrongDefinition, workspaceTarget);
    const malformed: Requirement.Requirement = {
      permission: MemberPermissions.Remove,
      target: workspaceTarget,
    };
    for (const requirement of [Requirement.make(unregistered, bobTarget), wrongKind, malformed])
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
          Assignment.Assignment.make({
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
        const authorization = yield* Authorization.Authorization;
        const journal = yield* Journal.make({
          logId: Entry.LogId.make("workspace-one/journal"),
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
              .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
          }),
        );
        expect(
          Option.map(yield* fixture.members.get(bob.memberId), (member) => member.status),
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
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
              yield* authorization.require([removeCharlie]);
              yield* journal
                .publish(MemberFacts.Removed, {
                  workspaceId,
                  memberId: charlie.memberId,
                })
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
            }),
          ),
        );
        expect(denied._tag).toBe("CoreError.Denied");
        expect(yield* fixture.snapshot).toEqual(before);
        yield* journal
          .publish(RoleFacts.PermissionsChanged, {
            roleId,
            workspaceId,
            permissions: [],
          })
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        expect(
          yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
        ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } });
        yield* journal
          .publish(RoleFacts.PermissionsChanged, {
            roleId,
            workspaceId,
            permissions: [MemberPermissions.Remove.name],
          })
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        yield* journal
          .publish(AssignmentFacts.Revoked, { assignmentId, workspaceId, memberId: alice.memberId })
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        expect(
          yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
        ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } });
        yield* journal
          .publish(AssignmentFacts.Created, {
            assignmentId: Assignment.Id.make("reassigned"),
            workspaceId,
            memberId: alice.memberId,
            source,
          })
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        yield* journal.commit(authorization.require([removeCharlie]));
        const beforeRemoval = yield* fixture.snapshot;
        const inactive = yield* Effect.flip(
          journal.commit(
            Effect.gen(function* () {
              yield* journal
                .publish(MemberFacts.Removed, { workspaceId, memberId: alice.memberId })
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
              yield* authorization.require([removeCharlie]);
            }),
          ),
        );
        expect(inactive).toMatchObject({
          _tag: "CoreError.Denied",
          reason: { _tag: "InvalidActor", reason: "membership-removed" },
        });
        expect(yield* fixture.snapshot).toEqual(beforeRemoval);
        yield* journal
          .publish(MemberFacts.Removed, { workspaceId, memberId: alice.memberId })
          .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)));
        expect(
          yield* Effect.flip(journal.commit(authorization.require([removeCharlie]))),
        ).toMatchObject({
          _tag: "CoreError.Denied",
          reason: { _tag: "InvalidActor", reason: "membership-removed" },
        });
      }).pipe(
        Effect.provide(Layer.mergeAll(configured(fixture), Log.layer)),
        Effect.provideService(Store.Store, fixture.store),
        Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
        Effect.provideService(MemberStore.MemberStore, fixture.members),
        Effect.provideService(RoleStore.RoleStore, fixture.roles),
        Effect.provideService(AssignmentStore.AssignmentStore, fixture.assignments),
        Effect.provideService(Actor.Actor, alice),
      );
    }),
);

it.effect("a membership storage failure fails authorization", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* seed(fixture, [alice], [direct("read", alice.memberId, MemberPermissions.Read)]);
    const failure = StoreError.failed("MemberStore", "get")("unavailable");
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
          Assignment.Assignment.make({
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
      const failure = StoreError.failed("RoleStore", "get")("unavailable");
      expect(
        yield* run(fixture, Effect.flip(check([readBob])), alice, {
          roles: { get: () => Effect.fail(failure) },
        }),
      ).toBe(failure);
    }),
);
