import { Actor, type Identity } from "@amends/core/identity";
import { Journal, Store } from "@amends/core/journal";
import { BuiltinRoles } from "@amends/core/authorization";
import { Workspace, WorkspaceSettingsApplication } from "@amends/core/workspace";
import { Gateway, WorkspaceDirectory } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import type { Harness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  boundTo,
  failingLate,
  future,
  journalLog,
  request,
  Support,
} from "./support.ts";

const read = (id: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      id,
      identity,
      Effect.flatMap(WorkspaceSettingsApplication.Service, (service) => service.get),
    ),
  );
const listing = (id: Workspace.Id, identity: Identity.MemberReference) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      id,
      identity,
      Effect.flatMap(WorkspaceSettingsApplication.Service, (service) => service.members),
    ),
  );
const rename = (
  id: Workspace.Id,
  identity: Identity.MemberReference,
  name: string,
  expectedName: string,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    gateway.asMember(
      id,
      identity,
      Effect.flatMap(WorkspaceSettingsApplication.Service, (service) =>
        service.rename({ name, expectedName }),
      ),
    ),
  );
export const workspaceSettings = (harness: Harness) => {
  const { core, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: workspace settings`, () => {
    it.effect(
      "renames once, rejects stale values, updates the directory, and survives replay",
      () =>
        harness.withStorage((storage) =>
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
              ).toMatchObject({ _tag: "WorkspaceSettings.Changed" });
              const directory = yield* WorkspaceDirectory.Service;
              expect((yield* directory.list(alice)).memberships[0]?.workspace.name).toBe("Studio");
              yield* storage.discardProjections;
              yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
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
        harness.withStorage((storage) =>
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
              ).toMatchObject({ _tag: "Authorization.Denied" });
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
                (yield* listing(workspace.id, alice)).find(
                  (entry) => entry.member.id === member.id,
                ),
              ).toMatchObject({ canRemove: false, access: { canManage: false } });
            }),
          ),
        ),
    );
    it.effect("guards store updates and rolls back a failed rename with its fact", () =>
      harness.withStorage((storage) =>
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
                Effect.flatMap(WorkspaceSettingsApplication.Service, (service) =>
                  service.rename({ name: "Studio", expectedName: workspace.name }),
                ).pipe(
                  Effect.provide(core(broken)),
                  Effect.provideService(Actor.Service, {
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
};
