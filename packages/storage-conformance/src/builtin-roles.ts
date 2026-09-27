import * as Core from "@amends/core";
import { AgentPermissions } from "@amends/core/agent";
import {
  Assignment,
  AssignmentApplication,
  AssignmentFacts,
  BuiltinRoles,
  BuiltinRoleUpgrade,
  Permission,
  RoleFacts,
  Scope,
} from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Journal, Publication } from "@amends/core/journal";
import {
  InvitationApplication,
  Member,
  MemberFacts,
  MemberPermissions,
  WorkspaceFacts,
} from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Clock, DateTime, Deferred, Effect, Exit, Fiber, Layer, Option } from "effect";
import type { Harness } from "./harness.ts";
import {
  alice,
  type Bound,
  forWorkspace,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";

const roleIds = [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId];
const current = BuiltinRoles.make(workspaceId, Core.permissions);
/** The next revision's declarations: member removal becomes a viewer's, agent use nobody's. */
const next: BuiltinRoleUpgrade.Target = {
  revision: BuiltinRoles.revision + 1,
  definitions: Core.permissions.flatMap((permission): ReadonlyArray<Permission.Definition> => {
    if (permission.name === AgentPermissions.Use.name) return [];
    return [
      permission.name === MemberPermissions.Remove.name
        ? Object.assign({}, permission, { builtinTier: "member" as const })
        : permission,
    ];
  }),
};
/** A later revision that gives every role a permission this host does not declare yet. */
const later: BuiltinRoleUpgrade.Target = {
  revision: BuiltinRoles.revision + 1,
  definitions: [
    ...Core.permissions,
    Permission.makeGroup("later", { targetKind: "Workspace" }).make("feature", {
      builtinTier: "member",
    }),
  ],
};
/** Earlier declarations, before agent use existed. */
const older = Core.permissions.filter(({ name }) => name !== AgentPermissions.Use.name);
const ownerMemberId = Member.Id.make("owner");

/** Built-in role bundles: recorded at creation, and upgraded through facts to later revisions. */
export const builtinRoles = (harness: Harness) => {
  const { core, initialized, gateway } = Support.make(harness);
  const roles = (bound: Bound) => Effect.forEach(roleIds, (id) => bound.roles.get(id));
  const upgrade = (bound: Bound, target?: BuiltinRoleUpgrade.Target) =>
    BuiltinRoleUpgrade.upgrade(target).pipe(Effect.provide(core(bound)));
  const history = (bound: Bound) =>
    Effect.flatMap(Journal.Service, (journal) => journal.log.read({ limit: 100 })).pipe(
      Effect.provide(core(bound)),
    );
  /**
   * A workspace recorded before revisions: no revision, a Viewer like today's, no Administrator,
   * and an Owner with another name and an earlier bundle.
   */
  const recordedBeforeRevisions = (bound: Bound) =>
    Effect.flatMap(Journal.Service, (journal) =>
      journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(WorkspaceFacts.Initialized, {
            id: workspaceId,
            name: "Studio",
            createdBy: alice.id,
            ownerMemberId,
          });
          yield* journal.publish(MemberFacts.Added, {
            workspaceId,
            memberId: ownerMemberId,
            identity: alice,
          });
          const [viewer] = current;
          const [, , owner] = BuiltinRoles.make(workspaceId, older);
          for (const role of [viewer, Object.assign({}, owner, { name: "Proprietor" })])
            if (role !== undefined)
              yield* journal.publish(RoleFacts.Created, {
                roleId: role.id,
                workspaceId,
                name: role.name,
                permissions: role.permissions,
              });
          yield* journal.publish(AssignmentFacts.Created, {
            workspaceId,
            assignmentId: Assignment.Id.make("owner"),
            memberId: ownerMemberId,
            source: Assignment.Source.cases.Role.make({
              roleId: BuiltinRoles.OwnerId,
              scope: Scope.Value.cases.Workspace.make({ workspaceId }),
            }),
          });
        }),
      ),
    ).pipe(
      Effect.provideService(Publication.Service, testProvenance()),
      Effect.provide(core(bound)),
    );

  describe.skipIf(!harness.available)(`${harness.name}: built-in roles`, () => {
    // Real time: the host tries again a second after the first attempt failed.
    it.live(
      "a host that cannot upgrade the roles as it loads the workspace upgrades them once it can",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            yield* recordedBeforeRevisions(bound);
            // Another host holds the workspace, so the upgrade cannot run as this host loads it.
            const held = yield* Deferred.make<void>();
            const release = yield* Deferred.make<void>();
            const holder = yield* Effect.forkChild(
              bound.store.transaction(
                Deferred.succeed(held, undefined).pipe(Effect.andThen(Deferred.await(release))),
              ),
            );
            yield* Deferred.await(held);
            const host = yield* Layer.build(gateway(yield* storage.connect({ failFast: true })));
            // The workspace still loads and admits its members, with the roles it recorded.
            yield* Effect.flatMap(Gateway.Service, (g) =>
              g.asMember(workspaceId, alice, Effect.void),
            ).pipe(Effect.provide(host));
            expect(yield* bound.roles.builtinRevision).toEqual(Option.none());
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(holder);
            // It tries again in the background while the workspace stays prepared.
            const deadline = (yield* Clock.currentTimeMillis) + 10_000;
            while (
              Option.isNone(yield* bound.roles.builtinRevision) &&
              (yield* Clock.currentTimeMillis) < deadline
            )
              yield* Effect.sleep("100 millis");
            expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision));
            expect(yield* roles(bound)).toEqual(current.map(Option.some));
          }).pipe(Effect.scoped),
        ),
      20_000,
    );

    it.effect("a new workspace holds the current revision, and upgrading it records nothing", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          yield* initialized(bound);
          expect(yield* roles(bound)).toEqual(current.map(Option.some));
          expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision));
          const before = yield* history(bound);
          expect(yield* upgrade(bound)).toBe(false);
          expect(yield* history(bound)).toEqual(before);
          // The recorded revision only moves forward.
          for (const revision of [BuiltinRoles.revision, 0])
            expect(
              yield* Effect.flip(
                bound.store.transaction(bound.roles.recordBuiltinRevision(revision)),
              ),
            ).toMatchObject({ _tag: "RoleStore.Conflict" });
          expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision));
        }),
      ),
    );

    it.effect(
      "a workspace recorded before revisions takes the current bundles when a host loads it",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            yield* recordedBeforeRevisions(bound);
            expect(yield* bound.roles.builtinRevision).toEqual(Option.none());
            // Any operation loads the workspace; the owner's grants already hold the new bundle.
            const choices = yield* Effect.flatMap(Gateway.Service, (g) =>
              g.asMember(
                workspaceId,
                alice,
                Effect.flatMap(AssignmentApplication.Service, (assignments) => assignments.roles),
              ),
            ).pipe(Effect.provide(gateway(yield* storage.connect())));
            expect(choices.map(({ role }) => role)).toEqual(current);
            expect(yield* roles(bound)).toEqual(current.map(Option.some));
            expect(yield* bound.roles.builtinRevision).toEqual(Option.some(BuiltinRoles.revision));
            // One commit, attributed to the system, records only what differed.
            const upgraded = (yield* history(bound)).at(-1)?.entries ?? [];
            expect(upgraded.map((entry) => entry.payload.name)).toEqual([
              RoleFacts.Created.name,
              RoleFacts.Renamed.name,
              RoleFacts.PermissionsChanged.name,
              RoleFacts.BuiltinsRevised.name,
            ]);
            for (const entry of upgraded)
              expect(entry.payload.provenance.performedBy).toEqual(BuiltinRoleUpgrade.performer);
          }),
        ),
    );

    it.effect(
      "a later revision replaces the bundles once, and an earlier one never reverts it",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            yield* initialized(bound);
            expect(yield* upgrade(bound, next)).toBe(true);
            const upgraded = BuiltinRoles.make(workspaceId, next.definitions).map(Option.some);
            expect(yield* roles(bound)).toEqual(upgraded);
            expect(yield* bound.roles.builtinRevision).toEqual(Option.some(next.revision));
            const after = yield* history(bound);
            // The same revision again, and a host still on the current one, change nothing.
            expect(yield* upgrade(bound, next)).toBe(false);
            expect(yield* upgrade(bound)).toBe(false);
            expect(yield* history(bound)).toEqual(after);
            expect(yield* roles(bound)).toEqual(upgraded);
            // Replay restores the upgraded bundles and their revision from the recorded facts.
            yield* storage.discardProjections;
            yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
              Effect.provide(core(bound)),
            );
            expect(yield* roles(bound)).toEqual(upgraded);
            expect(yield* bound.roles.builtinRevision).toEqual(Option.some(next.revision));
          }),
        ),
    );

    it.effect("roles holding a permission only a newer host declares still work on this host", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          yield* initialized(bound);
          // A newer host upgrades the bundles; this host, still on the current revision, loads them.
          expect(yield* upgrade(bound, later)).toBe(true);
          const [choices, invitation] = yield* Effect.flatMap(Gateway.Service, (g) =>
            g.asMember(
              workspaceId,
              alice,
              Effect.gen(function* () {
                const choices = yield* (yield* AssignmentApplication.Service).roles;
                const invitation = yield* (yield* InvitationApplication.Service).issue({
                  recipientId: Identity.HumanId.make("recipient"),
                  roleId: BuiltinRoles.MemberId,
                  expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
                });
                return [choices, invitation] as const;
              }),
            ),
          ).pipe(Effect.provide(gateway(yield* storage.connect())));
          expect(choices.map(({ role }) => role)).toEqual(
            BuiltinRoles.make(workspaceId, later.definitions),
          );
          expect(invitation).toMatchObject({
            details: { roleId: BuiltinRoles.MemberId },
            state: { _tag: "Pending" },
          });
        }),
      ),
    );

    it.effect("hosts upgrading one workspace together record the upgrade once", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          yield* initialized(bound);
          const hosts = yield* Effect.forEach([1, 2, 3], () =>
            Effect.flatMap(storage.connect(), (host) => forWorkspace(host, workspaceId)),
          );
          const outcomes = yield* Effect.forEach(
            hosts,
            (host) => Effect.exit(upgrade(host, next)),
            {
              concurrency: "unbounded",
            },
          );
          // One upgrades; the others find it done or, where storage reports contention, retry later.
          expect(outcomes.filter((exit) => Exit.isSuccess(exit) && exit.value)).toHaveLength(1);
          for (const exit of outcomes)
            if (Exit.isFailure(exit))
              expect(Exit.findErrorOption(exit)).toMatchObject({
                _tag: "Some",
                value: { _tag: "JournalStore.Conflict" },
              });
          const revised = (yield* history(bound))
            .flatMap((batch) => batch.entries)
            .filter((entry) => entry.payload.name === RoleFacts.BuiltinsRevised.name);
          // Creation's revision and one upgrade.
          expect(revised).toHaveLength(2);
          expect(yield* roles(bound)).toEqual(
            BuiltinRoles.make(workspaceId, next.definitions).map(Option.some),
          );
        }),
      ),
    );
  });
};
