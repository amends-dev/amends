import { Actor, type Identity } from "@amends-dev/core/identity";
import { Journal, Store } from "@amends-dev/core/journal";
import { BuiltinRoles, type Role } from "@amends-dev/core/authorization";
import { Identity as Identities } from "@amends-dev/core/identity";
import { Workspace, WorkspaceSettingsService } from "@amends-dev/core/workspace";
import { Gateway, WorkspaceDirectory } from "@amends-dev/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Tracer } from "effect";
import { withStorage } from "./fixture.ts";
import * as Operations from "./operations.ts";
import * as Support from "./support.ts";
import {
  alice,
  bob,
  boundTo,
  charlie,
  failingLate,
  future,
  journalLog,
  request,
} from "./support.ts";

const read = (id: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.asMember(
      id,
      identity,
      Effect.flatMap(
        WorkspaceSettingsService.WorkspaceSettingsService,
        (workspaceSettingsService) => workspaceSettingsService.get,
      ),
    ),
  );
const listing = (id: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.asMember(
      id,
      identity,
      Effect.flatMap(
        WorkspaceSettingsService.WorkspaceSettingsService,
        (workspaceSettingsService) => workspaceSettingsService.members,
      ),
    ),
  );
const rename = (
  id: Workspace.Id,
  identity: Identity.MemberReference,
  name: string,
  expectedName: string,
) =>
  Effect.flatMap(Gateway.Gateway, (gateway) =>
    gateway.asMember(
      id,
      identity,
      Effect.flatMap(
        WorkspaceSettingsService.WorkspaceSettingsService,
        (workspaceSettingsService) => workspaceSettingsService.rename({ name, expectedName }),
      ),
    ),
  );
const dave = Identities.Reference.cases.Human.make({ id: Identities.HumanId.make("dave") });
const erin = Identities.Reference.cases.Human.make({ id: Identities.HumanId.make("erin") });
const { core, runGateway } = Support;
describe("workspace settings", () => {
  it.effect("renames once, rejects stale values, updates the directory, and survives replay", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const bound = yield* boundTo(workspace.id);
          expect((yield* read(workspace.id, alice)).canRename).toBe(true);
          const renamed = yield* rename(workspace.id, alice, "Studio", workspace.name);
          expect(renamed).toEqual({
            id: workspace.id,
            createdBy: workspace.createdBy,
            ownerMemberId: workspace.ownerMemberId,
            name: "Studio",
          });
          const journal = yield* bound.store.read(journalLog, { limit: 50 });
          expect(yield* rename(workspace.id, alice, "Studio", workspace.name)).toEqual(renamed);
          expect(yield* bound.store.read(journalLog, { limit: 50 })).toEqual(journal);
          expect(
            yield* Effect.flip(rename(workspace.id, alice, "Stale", workspace.name)),
          ).toMatchObject({ _tag: "CoreError.Changed" });
          const workspaceDirectory = yield* WorkspaceDirectory.WorkspaceDirectory;
          expect((yield* workspaceDirectory.list(alice)).memberships[0]?.workspace.name).toBe(
            "Studio",
          );
          yield* storage.discardProjections;
          yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
            Effect.provide(core(bound)),
          );
          expect(yield* bound.workspace.get).toEqual(Option.some(renamed));
        }),
      ),
    ),
  );
  it.effect(
    "computes member actions for owners, administrators, viewers, and removed members",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const invitation = yield* Operations.invite(
              workspace.id,
              alice,
              request(yield* future),
            );
            const member = yield* Operations.acceptInvitation(
              workspace.id,
              bob.id,
              invitation.details.id,
            );
            expect(yield* read(workspace.id, bob)).toMatchObject({
              canRename: false,
              canInvite: false,
              canReadInvitations: false,
            });
            expect(
              (yield* listing(workspace.id, bob)).every(
                (entry) => !entry.canRemove && !entry.access?.canManage,
              ),
            ).toBe(true);
            const own = yield* listing(workspace.id, alice);
            expect(
              own.find((entry) => entry.member.id === workspace.ownerMemberId)?.canRemove,
            ).toBe(false);
            expect(own.find((entry) => entry.member.id === member.id)).toMatchObject({
              canRemove: true,
              access: { canManage: true },
            });
            expect(
              yield* Effect.flip(rename(workspace.id, bob, "No", workspace.name)),
            ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } });
            yield* Operations.assign(workspace.id, alice, {
              memberId: member.id,
              roleId: BuiltinRoles.AdministratorId,
            });
            expect(yield* read(workspace.id, bob)).toMatchObject({
              canRename: false,
              canInvite: true,
              canReadInvitations: true,
            });
            expect(
              (yield* listing(workspace.id, bob)).find(
                (entry) => entry.member.id === workspace.ownerMemberId,
              )?.canRemove,
            ).toBe(false);
            yield* Operations.removeMember(workspace.id, alice, member.id);
            expect(
              (yield* listing(workspace.id, alice)).find((entry) => entry.member.id === member.id),
            ).toMatchObject({ canRemove: false, access: { canManage: false } });
          }),
        ),
      ),
  );
  it.effect("member actions follow the delegation policy for every actor and target", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const join = Effect.fnUntraced(function* (identity: Identity.HumanId, roleId: Role.Id) {
            const invitation = yield* Operations.invite(
              workspace.id,
              alice,
              request(yield* future, identity, roleId),
            );
            return yield* Operations.acceptInvitation(
              workspace.id,
              identity,
              invitation.details.id,
            );
          });
          yield* join(bob.id, BuiltinRoles.AdministratorId);
          yield* join(charlie.id, BuiltinRoles.MemberId);
          yield* join(dave.id, BuiltinRoles.AdministratorId);
          const removed = yield* join(erin.id, BuiltinRoles.MemberId);
          yield* Operations.removeMember(workspace.id, alice, removed.id);
          const summary = Effect.fnUntraced(function* (actor: Identity.MemberReference) {
            const entries = yield* listing(workspace.id, actor);
            return Object.fromEntries(
              entries.map((entry) => [
                entry.member.identity.id,
                [
                  entry.access ? "read" : "hidden",
                  entry.access?.canManage ? "manage" : "",
                  entry.canRemove ? "remove" : "",
                  entry.access?.roles
                    .filter((choice) => choice.assignable)
                    .map((choice) => choice.role.id)
                    .join("+") ?? "",
                ]
                  .filter(Boolean)
                  .join(" "),
              ]),
            );
          });
          const viewer = BuiltinRoles.MemberId,
            both = `${BuiltinRoles.MemberId}+${BuiltinRoles.AdministratorId}`;
          expect({
            owner: yield* summary(alice),
            administrator: yield* summary(bob),
            viewer: yield* summary(charlie),
          }).toEqual({
            // The owner manages and removes everyone but themselves and closed memberships.
            owner: {
              alice: `read ${both}`,
              bob: `read manage remove ${both}`,
              charlie: `read manage remove ${both}`,
              dave: `read manage remove ${both}`,
              erin: `read ${both}`,
            },
            // An administrator manages Viewers only, may leave, and grants only Viewer.
            administrator: {
              alice: `read ${viewer}`,
              bob: `read remove ${viewer}`,
              charlie: `read manage remove ${viewer}`,
              dave: `read ${viewer}`,
              erin: `read ${viewer}`,
            },
            viewer: { alice: "read", bob: "read", charlie: "read", dave: "read", erin: "read" },
          });
        }),
      ),
    ),
  );
  it.effect("lists members with one assignment read each and a fixed number of other reads", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id);
          // Count core spans by name, whatever the adapter underneath.
          const counted = Effect.fnUntraced(function* () {
            const counts = new Map<string, number>();
            yield* listing(workspace.id, alice).pipe(
              Effect.withTracer(
                Tracer.make({
                  span(options) {
                    counts.set(options.name, (counts.get(options.name) ?? 0) + 1);
                    return Tracer.nativeTracer.span(options);
                  },
                }),
              ),
            );
            return (name: string) => counts.get(name) ?? 0;
          });
          const small = yield* counted();
          for (const index of [1, 2, 3, 4, 5, 6]) {
            const identity = Identities.HumanId.make(`member-${index}`);
            const invitation = yield* Operations.invite(
              workspace.id,
              alice,
              request(yield* future, identity),
            );
            yield* Operations.acceptInvitation(workspace.id, identity, invitation.details.id);
          }
          const large = yield* counted();
          expect(large("Delegation.assignmentsFor") - small("Delegation.assignmentsFor")).toBe(6);
          for (const name of ["GrantResolver.resolve", "Delegation.loadRole"])
            expect({ name, reads: large(name) }).toEqual({ name, reads: small(name) });
        }),
      ),
    ),
  );
  it.effect("guards store updates and rolls back a failed rename with its fact", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id),
            bound = yield* boundTo(workspace.id);
          for (const change of [
            {
              workspaceId: Workspace.Id.make("foreign"),
              previousName: workspace.name,
              name: "Studio",
            },
            { workspaceId: workspace.id, previousName: "stale", name: "Studio" },
            { workspaceId: workspace.id, previousName: workspace.name, name: "" },
          ])
            expect(
              yield* Effect.flip(bound.store.transaction(bound.workspace.rename(change))),
            ).toMatchObject({ _tag: "WorkspaceStore.Conflict" });
          const before = yield* bound.store.read(journalLog, { limit: 50 });
          const failure = new Store.Failure({
            operation: "transaction",
            cause: "Late write failed",
          });
          const broken = failingLate(bound, failure);
          expect(
            yield* Effect.flip(
              Effect.flatMap(
                WorkspaceSettingsService.WorkspaceSettingsService,
                (workspaceSettingsService) =>
                  workspaceSettingsService.rename({
                    name: "Studio",
                    expectedName: workspace.name,
                  }),
              ).pipe(
                Effect.provide(core(broken)),
                Effect.provideService(Actor.Actor, {
                  workspaceId: workspace.id,
                  memberId: workspace.ownerMemberId,
                  identity: alice,
                }),
              ),
            ),
          ).toBe(failure);
          expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
          expect(yield* bound.store.read(journalLog, { limit: 50 })).toEqual(before);
        }),
      ),
    ),
  );
});
