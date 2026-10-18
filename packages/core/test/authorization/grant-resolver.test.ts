import { WorkspaceId, MemberId } from "@amends-dev/core/workspace"
import * as Entry from "@amends-dev/log/Entry"
import * as Log from "@amends-dev/log/Log"
import * as Store from "@amends-dev/log/Store"
import * as StoreError from "@amends-dev/log/StoreError"
import { expect, expectTypeOf, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer } from "effect"
import * as Assignment from "../../src/authorization/Assignment.ts"
import * as AssignmentFacts from "../../src/authorization/AssignmentFacts.ts"
import * as AssignmentProjection from "../../src/authorization/AssignmentProjection.ts"
import * as AssignmentStore from "../../src/authorization/AssignmentStore.ts"
import * as Grant from "../../src/authorization/Grant.ts"
import * as GrantResolver from "../../src/authorization/GrantResolver.ts"
import * as Permission from "../../src/authorization/Permission.ts"
import * as PermissionCatalog from "../../src/authorization/PermissionCatalog.ts"
import * as Role from "../../src/authorization/Role.ts"
import * as RoleFacts from "../../src/authorization/RoleFacts.ts"
import * as RoleProjection from "../../src/authorization/RoleProjection.ts"
import * as RoleStore from "../../src/authorization/RoleStore.ts"
import * as Scope from "../../src/authorization/Scope.ts"
import * as Target from "../../src/authorization/Target.ts"
import * as Checkpoint from "../../src/journal/Checkpoint.ts"
import * as Journal from "../../src/journal/Journal.ts"
import * as Publication from "../../src/journal/Publication.ts"
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts"
import { make, type Fixture } from "../memory.ts"
import { testProvenance } from "../publication.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-one")
const foreignWorkspaceId = WorkspaceId.WorkspaceId.make("workspace-two")
const memberId = MemberId.MemberId.make("recipient")
const roleId = Role.RoleId.make("manager")
const workspaceScope = Scope.Scope.cases.Workspace.make({ workspaceId })
const memberScope = Scope.Scope.cases.Target.make({
  target: Target.Reference.cases.Member.make({ workspaceId, memberId: MemberId.MemberId.make("subject") })
})
const workspaceTargetScope = Scope.Scope.cases.Target.make({
  target: Target.Reference.cases.Workspace.make({ workspaceId })
})
const ManageWorkspace = Permission.make("test.workspace.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator"
})
const role = {
  id: roleId,
  workspaceId,
  name: "Manager",
  permissions: [MemberPermissions.Read.name, MemberPermissions.Remove.name]
}
const roleSource = (scope: Scope.Scope = workspaceScope, id = roleId) =>
  Assignment.Source.cases.Role.make({ roleId: id, scope })
const directSource = (permission: Permission.Name, scope: Scope.Scope) =>
  Assignment.Source.cases.Direct.make({ grant: { permission, scope } })
const assigned = (id: string, source: Assignment.Source) =>
  Assignment.Assignment.make({
    id: Assignment.AssignmentId.make(id),
    workspaceId,
    memberId,
    source,
    status: "active"
  })
interface Overrides {
  readonly assignments?: Partial<AssignmentStore.AssignmentStore["Service"]>
  readonly roles?: Partial<RoleStore.RoleStore["Service"]>
}
const dependencies = (fixture: Fixture, overrides: Overrides = {}) =>
  Layer.mergeAll(
    Layer.succeed(
      AssignmentStore.AssignmentStore,
      AssignmentStore.AssignmentStore.of({ ...fixture.assignments, ...overrides.assignments })
    ),
    Layer.succeed(RoleStore.RoleStore, RoleStore.RoleStore.of({ ...fixture.roles, ...overrides.roles })),
    PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Remove, ManageWorkspace])
  )
const configured = (fixture: Fixture, overrides: Overrides = {}) =>
  GrantResolver.layer.pipe(Layer.provide(dependencies(fixture, overrides)))
const resolve = Effect.gen(function* () {
  return yield* (yield* GrantResolver.GrantResolver).resolve(memberId)
})
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, GrantResolver.GrantResolver>,
  overrides: Overrides = {}
) => program.pipe(Effect.provide(configured(fixture, overrides)))
const seed = (fixture: Fixture, roles: ReadonlyArray<Role.Role>, assignments: ReadonlyArray<Assignment.Assignment>) =>
  fixture.store.transaction(
    Effect.gen(function* () {
      for (const record of roles) yield* fixture.roles.insert(record)
      for (const record of assignments) yield* fixture.assignments.insert(record)
    })
  )
it.effect("the resolver reads current state without requiring a transaction", () =>
  Effect.gen(function* () {
    expectTypeOf<Layer.Services<typeof GrantResolver.layer>>().toEqualTypeOf<
      AssignmentStore.AssignmentStore | RoleStore.RoleStore | PermissionCatalog.PermissionCatalog
    >()
    expectTypeOf<Layer.Error<typeof GrantResolver.layer>>().toEqualTypeOf<never>()
    expectTypeOf<Effect.Success<typeof GrantResolver.make>>().toEqualTypeOf<GrantResolver.GrantResolver["Service"]>()
    expectTypeOf<Effect.Services<typeof resolve>>().toEqualTypeOf<GrantResolver.GrantResolver>()
    expectTypeOf<Effect.Error<typeof resolve>>().toEqualTypeOf<GrantResolver.Error>()
    const fixture = yield* make()
    yield* seed(fixture, [], [assigned("direct", directSource(MemberPermissions.Read.name, memberScope))])
    // Building within an earlier transaction must not capture its now-expired handle.
    const resolver = yield* fixture.store.transaction(GrantResolver.make).pipe(Effect.provide(dependencies(fixture)))
    expect(yield* resolver.resolve(memberId)).toEqual([Grant.make(MemberPermissions.Read, memberScope)])
  })
)

it.effect("resolution expands role and direct assignments at their individual scopes", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const emptyRoleId = Role.RoleId.make("empty")
    yield* seed(
      fixture,
      [role, { id: emptyRoleId, workspaceId, name: "Empty", permissions: [] }],
      [
        assigned("workspace-role", roleSource()),
        assigned("member-role", roleSource(memberScope)),
        assigned("empty-role", roleSource(workspaceScope, emptyRoleId)),
        assigned("direct-workspace", directSource(ManageWorkspace.name, workspaceTargetScope)),
        assigned("overlapping-direct", directSource(MemberPermissions.Read.name, workspaceScope))
      ]
    )
    const grants = yield* run(fixture, resolve)
    expect(grants).toHaveLength(6)
    expect(grants).toEqual(
      expect.arrayContaining([
        Grant.make(MemberPermissions.Read, workspaceScope),
        Grant.make(MemberPermissions.Remove, workspaceScope),
        Grant.make(MemberPermissions.Read, memberScope),
        Grant.make(MemberPermissions.Remove, memberScope),
        Grant.make(ManageWorkspace, workspaceTargetScope)
      ])
    )
    expect(
      grants.filter(
        (grant) => grant.permission === MemberPermissions.Read.name && Scope.Scope.isAnyOf(["Workspace"])(grant.scope)
      )
    ).toHaveLength(2)
  })
)

it("grantsOf expands role and direct assignments from records alone, and a role it is not given confers nothing", () => {
  const assignments = [
    assigned("workspace-role", roleSource()),
    assigned("unknown-role", roleSource(workspaceScope, Role.RoleId.make("unknown"))),
    assigned("direct-workspace", directSource(ManageWorkspace.name, workspaceTargetScope))
  ]
  expect(GrantResolver.grantsOf(assignments, (id) => (id === roleId ? role : undefined))).toEqual([
    { permission: MemberPermissions.Read.name, scope: workspaceScope },
    { permission: MemberPermissions.Remove.name, scope: workspaceScope },
    { permission: ManageWorkspace.name, scope: workspaceTargetScope }
  ])
})

it.effect("one resolver observes staged journal changes, later role edits, and assignment revocations", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const roleAssignmentId = Assignment.AssignmentId.make("role-assignment")
    const directAssignmentId = Assignment.AssignmentId.make("direct-assignment")
    yield* Effect.gen(function* () {
      const grantResolver = yield* GrantResolver.GrantResolver
      const journal = yield* Journal.make({
        logId: Entry.LogId.make("workspace-one/journal"),
        projections: [RoleProjection.definition, AssignmentProjection.definition]
      })
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal
            .publish(RoleFacts.Created, {
              roleId,
              workspaceId,
              name: role.name,
              permissions: role.permissions
            })
            .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
          yield* journal
            .publish(AssignmentFacts.Created, {
              assignmentId: roleAssignmentId,
              workspaceId,
              memberId,
              source: roleSource()
            })
            .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
          yield* journal
            .publish(AssignmentFacts.Created, {
              assignmentId: directAssignmentId,
              workspaceId,
              memberId,
              source: directSource(MemberPermissions.Read.name, memberScope)
            })
            .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
          expect(yield* grantResolver.resolve(memberId)).toHaveLength(3)
        })
      )
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal
            .publish(RoleFacts.PermissionsChanged, {
              roleId,
              workspaceId,
              permissions: [MemberPermissions.Read.name]
            })
            .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
          yield* journal
            .publish(AssignmentFacts.Revoked, {
              assignmentId: directAssignmentId,
              workspaceId,
              memberId: memberId
            })
            .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
          expect(yield* grantResolver.resolve(memberId)).toEqual([Grant.make(MemberPermissions.Read, workspaceScope)])
        })
      )
      expect(yield* journal.commit(grantResolver.resolve(memberId))).toEqual([
        Grant.make(MemberPermissions.Read, workspaceScope)
      ])
      yield* journal
        .publish(AssignmentFacts.Revoked, {
          assignmentId: roleAssignmentId,
          workspaceId,
          memberId: memberId
        })
        .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
      expect(yield* journal.commit(grantResolver.resolve(memberId))).toEqual([])
    }).pipe(
      Effect.provide([configured(fixture), Log.layer]),
      Effect.provideService(Store.Store, fixture.store),
      Effect.provideService(WorkspaceId.CurrentWorkspaceId, fixture.workspaceId),
      Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
      Effect.provideService(RoleStore.RoleStore, fixture.roles),
      Effect.provideService(AssignmentStore.AssignmentStore, fixture.assignments)
    )
  })
)

it.effect("members without active assignments receive no grants", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    expect(yield* run(fixture, resolve)).toEqual([])
    const revoked = assigned("revoked", roleSource(workspaceScope, Role.RoleId.make("missing")))
    yield* seed(fixture, [], [revoked])
    yield* fixture.store.transaction(fixture.assignments.markRevoked(revoked.id))
    expect(yield* run(fixture, resolve)).toEqual([])
  })
)

it.effect("a missing role is a defect, even after a valid direct grant", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    yield* seed(
      fixture,
      [],
      [
        assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)),
        assigned("missing-role", roleSource())
      ]
    )
    expect(Exit.hasDies(yield* Effect.exit(run(fixture, resolve)))).toBe(true)
  })
)

it.effect("a permission the catalog no longer declares grants nothing, directly or by role", () =>
  Effect.gen(function* () {
    const retired = Permission.Name.make("member.retired")
    const read = { permission: MemberPermissions.Read.name, scope: workspaceScope }
    for (const [source, expected] of [
      [directSource(retired, workspaceScope), [read]],
      [roleSource(), [read, read]]
    ] as const) {
      const fixture = yield* make()
      yield* seed(
        fixture,
        [{ ...role, permissions: [MemberPermissions.Read.name, retired] }],
        [assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)), assigned("retired", source)]
      )
      // The member keeps every other grant.
      expect(yield* run(fixture, resolve)).toEqual(expected)
    }
  })
)

it.effect("incompatible scopes fail whole role assignments and direct grants", () =>
  Effect.gen(function* () {
    for (const source of [directSource(ManageWorkspace.name, memberScope), roleSource(memberScope)]) {
      const fixture = yield* make()
      yield* seed(
        fixture,
        [{ ...role, permissions: [MemberPermissions.Read.name, ManageWorkspace.name] }],
        [assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)), assigned("invalid", source)]
      )
      // A stored scope that no longer fits its permission is a defect, not the caller's input.
      const exit = yield* Effect.exit(run(fixture, resolve))
      expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("requires a Workspace target")
    }
  })
)

it.effect("a direct grant scoped to another workspace authorizes nothing here", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const wrongScope = {
      id: Assignment.AssignmentId.make("foreign-scope"),
      workspaceId,
      memberId,
      status: "active",
      source: directSource(
        MemberPermissions.Read.name,
        Scope.Scope.cases.Workspace.make({ workspaceId: foreignWorkspaceId })
      )
    } satisfies Assignment.Assignment
    const grants = yield* run(fixture, resolve, {
      assignments: { listActiveByMember: () => Effect.succeed([wrongScope]) }
    })
    const here = Target.Reference.cases.Workspace.make({ workspaceId })
    expect(grants.some((grant) => Scope.covers(grant.scope, here))).toBe(false)
  })
)

it.effect("assignment and role storage failures propagate instead of returning partial grants", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const assignmentFailure = StoreError.failed("AssignmentStore", "listActiveByMember")("unavailable")
    expect(
      yield* run(fixture, Effect.flip(resolve), {
        assignments: { listActiveByMember: () => Effect.fail(assignmentFailure) }
      })
    ).toBe(assignmentFailure)
    yield* seed(
      fixture,
      [],
      [assigned("valid", directSource(MemberPermissions.Read.name, workspaceScope)), assigned("role", roleSource())]
    )
    const roleFailure = StoreError.failed("RoleStore", "get")("unavailable")
    expect(
      yield* run(fixture, Effect.flip(resolve), {
        roles: { get: () => Effect.fail(roleFailure) }
      })
    ).toBe(roleFailure)
  })
)
