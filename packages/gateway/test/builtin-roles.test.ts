import { Core } from "@amends-dev/core"
import { AgentPermissions } from "@amends-dev/core/agent"
import {
  Assignment,
  AssignmentService,
  AssignmentFacts,
  BuiltinRoles,
  BuiltinRoleUpgrade,
  Permission,
  RoleFacts,
  Scope
} from "@amends-dev/core/authorization"
import { Identity } from "@amends-dev/core/identity"
import { Journal, Publication } from "@amends-dev/core/journal"
import {
  InvitationService,
  Member,
  MemberFacts,
  MemberPermissions,
  WorkspaceFacts,
  MemberId
} from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Deferred, Effect, Exit, Fiber, Layer, Option } from "effect"
import { TestClock } from "effect/testing"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { alice, type Bound, forWorkspace, journalLog, testProvenance, workspaceId } from "./support.ts"

const roleIds = [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId]
const current = BuiltinRoles.make(workspaceId, Core.permissions)
/** The next revision's declarations: member removal becomes a viewer's, agent use nobody's. */
const next: BuiltinRoleUpgrade.Options = {
  revision: BuiltinRoles.revision + 1,
  definitions: Core.permissions.flatMap((permission): ReadonlyArray<Permission.Definition> => {
    if (permission.name === AgentPermissions.Use.name) return []
    return [
      permission.name === MemberPermissions.Remove.name
        ? Object.assign({}, permission, { builtinTier: "member" as const })
        : permission
    ]
  })
}
/** A later revision that gives every role a permission this host does not declare yet. */
const later: BuiltinRoleUpgrade.Options = {
  revision: BuiltinRoles.revision + 1,
  definitions: [
    ...Core.permissions,
    Permission.makeGroup("later", { targetKind: "Workspace" }).make("feature", {
      builtinTier: "member"
    })
  ]
}
/** Earlier declarations, before agent use existed. */
const older = Core.permissions.filter(({ name }) => name !== AgentPermissions.Use.name)
const ownerMemberId = MemberId.MemberId.make("owner")

/** Built-in role bundles: recorded at creation, and upgraded through facts to later revisions. */
const { core, initialized, gateway } = Support
const roles = (bound: Bound) => Effect.forEach(roleIds, (id) => bound.roles.get(id))
const upgrade = (bound: Bound, options?: BuiltinRoleUpgrade.Options) =>
  BuiltinRoleUpgrade.upgrade(options).pipe(Effect.provide(core(bound)))
const history = (bound: Bound) =>
  Effect.flatMap(Journal.Journal, (journal) => journal.log.read({ limit: 100 })).pipe(Effect.provide(core(bound)))
/**
 * A workspace recorded before revisions: no revision, a Viewer like today's, no Administrator,
 * and an Owner with another name and an earlier bundle.
 */
const recordedBeforeRevisions = (bound: Bound) =>
  Effect.flatMap(Journal.Journal, (journal) =>
    journal.commit(
      Effect.gen(function* () {
        yield* journal.publish(WorkspaceFacts.Initialized, {
          id: workspaceId,
          name: "Studio",
          createdBy: alice.id,
          ownerMemberId
        })
        yield* journal.publish(MemberFacts.Added, {
          workspaceId,
          memberId: ownerMemberId,
          identity: alice,
          name: Member.Name.make(alice.id)
        })
        const [viewer] = current
        const [, , owner] = BuiltinRoles.make(workspaceId, older)
        for (const role of [viewer, Object.assign({}, owner, { name: "Proprietor" })])
          if (role !== undefined)
            yield* journal.publish(RoleFacts.Created, {
              roleId: role.id,
              workspaceId,
              name: role.name,
              permissions: role.permissions
            })
        yield* journal.publish(AssignmentFacts.Created, {
          workspaceId,
          assignmentId: Assignment.AssignmentId.make("owner"),
          memberId: ownerMemberId,
          source: Assignment.Source.cases.Role.make({
            roleId: BuiltinRoles.OwnerId,
            scope: Scope.Scope.cases.Workspace.make({ workspaceId })
          })
        })
      })
    )
  ).pipe(Effect.provideService(Publication.Publication, testProvenance()), Effect.provide(core(bound)))

describe("built-in roles", () => {
  it.effect("a host that cannot upgrade the roles as it loads the workspace upgrades them once it can", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const bound = yield* forWorkspace(yield* storage.connect(), workspaceId)
        yield* recordedBeforeRevisions(bound)
        // Another host holds the workspace, so the upgrade cannot run as this host loads it.
        const held = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const holder = yield* Effect.forkChild(
          bound.store.transaction(Deferred.succeed(held, undefined).pipe(Effect.andThen(Deferred.await(release))))
        )
        yield* Deferred.await(held)
        const host = yield* Layer.build(gateway(yield* storage.connect({ failFast: true })))
        // The workspace still loads and admits its members, with the roles it recorded.
        yield* Effect.flatMap(Gateway.Gateway, (gateway) => gateway.asMember(workspaceId, alice, Effect.void)).pipe(
          Effect.provide(host)
        )
        // It tries again in the background, backing off, while the other host still holds it.
        yield* TestClock.adjust("1 minute")
        expect(yield* bound.roles.builtinRevision).toEqual(Option.none())
        const upgraded = yield* Effect.forkChild(
          bound.store.waitForAppend(journalLog, yield* bound.store.head(journalLog))
        )
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(holder)
        // Its next try, at most a minute away, upgrades them.
        yield* TestClock.adjust("1 minute")
        yield* Fiber.join(upgraded)
        expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision))
        expect(yield* roles(bound)).toEqual(current.map(Option.some))
      }).pipe(Effect.scoped)
    )
  )

  it.effect("a new workspace holds the current revision, and upgrading it records nothing", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const bound = yield* forWorkspace(yield* storage.connect(), workspaceId)
        yield* initialized(bound)
        expect(yield* roles(bound)).toEqual(current.map(Option.some))
        expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision))
        const before = yield* history(bound)
        expect(yield* upgrade(bound)).toBe(false)
        expect(yield* history(bound)).toEqual(before)
        // The recorded revision only moves forward.
        for (const revision of [BuiltinRoles.revision, 0])
          expect(
            yield* Effect.flip(bound.store.transaction(bound.roles.recordBuiltinRevision(revision)))
          ).toMatchObject({ _tag: "StoreError", store: "RoleStore", reason: { _tag: "Rejected" } })
        expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision))
      })
    )
  )

  it.effect("a workspace recorded before revisions takes the current bundles when a host loads it", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const bound = yield* forWorkspace(yield* storage.connect(), workspaceId)
        yield* recordedBeforeRevisions(bound)
        expect(yield* bound.roles.builtinRevision).toEqual(Option.none())
        // Any operation loads the workspace; the owner's grants already hold the new bundle.
        const choices = yield* Effect.flatMap(Gateway.Gateway, (gateway) =>
          gateway.asMember(
            workspaceId,
            alice,
            Effect.flatMap(AssignmentService.AssignmentService, (assignmentService) => assignmentService.roles)
          )
        ).pipe(Effect.provide(gateway(yield* storage.connect())))
        expect(choices.map(({ role }) => role)).toEqual(current)
        expect(yield* roles(bound)).toEqual(current.map(Option.some))
        expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision))
        // One commit, attributed to the system, records only what differed.
        const upgraded = (yield* history(bound)).at(-1)?.entries ?? []
        expect(upgraded.map((entry) => entry.payload.name)).toEqual([
          RoleFacts.Created.name,
          RoleFacts.Renamed.name,
          RoleFacts.PermissionsChanged.name,
          RoleFacts.BuiltinsRevised.name
        ])
        for (const entry of upgraded) expect(entry.payload.provenance.performedBy).toEqual(BuiltinRoleUpgrade.performer)
      })
    )
  )

  it.effect("a later revision replaces the bundles once, and an earlier one never reverts it", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const bound = yield* forWorkspace(yield* storage.connect(), workspaceId)
        yield* initialized(bound)
        expect(yield* upgrade(bound, next)).toBe(true)
        const upgraded = BuiltinRoles.make(workspaceId, next.definitions).map(Option.some)
        expect(yield* roles(bound)).toEqual(upgraded)
        expect(yield* bound.roles.builtinRevision).toEqual(Option.some(next.revision))
        const after = yield* history(bound)
        // The same revision again, and a host still on the current one, change nothing.
        expect(yield* upgrade(bound, next)).toBe(false)
        expect(yield* upgrade(bound)).toBe(false)
        expect(yield* history(bound)).toEqual(after)
        expect(yield* roles(bound)).toEqual(upgraded)
        // Replay restores the upgraded bundles and their revision from the recorded facts.
        yield* storage.discardProjections
        yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(Effect.provide(core(bound)))
        expect(yield* roles(bound)).toEqual(upgraded)
        expect(yield* bound.roles.builtinRevision).toEqual(Option.some(next.revision))
      })
    )
  )

  it.effect("roles holding a permission only a newer host declares still work on this host", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const bound = yield* forWorkspace(yield* storage.connect(), workspaceId)
        yield* initialized(bound)
        // A newer host upgrades the bundles; this host, still on the current revision, loads them.
        expect(yield* upgrade(bound, later)).toBe(true)
        const [choices, invitation] = yield* Effect.flatMap(Gateway.Gateway, (gateway) =>
          gateway.asMember(
            workspaceId,
            alice,
            Effect.gen(function* () {
              const choices = yield* (yield* AssignmentService.AssignmentService).roles
              const invitation = yield* (yield* InvitationService.InvitationService).issue({
                recipientId: Identity.HumanId.make("recipient"),
                roleId: BuiltinRoles.MemberId,
                expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 })
              })
              return [choices, invitation] as const
            })
          )
        ).pipe(Effect.provide(gateway(yield* storage.connect())))
        expect(choices.map(({ role }) => role)).toEqual(BuiltinRoles.make(workspaceId, later.definitions))
        expect(invitation).toMatchObject({
          details: { roleId: BuiltinRoles.MemberId },
          state: { _tag: "Pending" }
        })
      })
    )
  )

  it.effect("hosts upgrading one workspace together record the upgrade once", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const bound = yield* forWorkspace(yield* storage.connect(), workspaceId)
        yield* initialized(bound)
        const hosts = yield* Effect.forEach([1, 2, 3], () =>
          Effect.flatMap(storage.connect(), (host) => forWorkspace(host, workspaceId))
        )
        const outcomes = yield* Effect.forEach(hosts, (host) => Effect.exit(upgrade(host, next)), {
          concurrency: "unbounded"
        })
        // One upgrades; the others find it done or, where storage reports contention, retry later.
        expect(outcomes.filter((exit) => Exit.isSuccess(exit) && exit.value)).toHaveLength(1)
        for (const exit of outcomes)
          if (Exit.isFailure(exit))
            expect(Exit.findErrorOption(exit)).toMatchObject({
              _tag: "Some",
              value: { _tag: "StoreError", store: "Store", reason: { _tag: "Contended" } }
            })
        const revised = (yield* history(bound))
          .flatMap((batch) => batch.entries)
          .filter((entry) => entry.payload.name === RoleFacts.BuiltinsRevised.name)
        // Creation's revision and one upgrade.
        expect(revised).toHaveLength(2)
        expect(yield* roles(bound)).toEqual(BuiltinRoles.make(workspaceId, next.definitions).map(Option.some))
      })
    )
  )
})
