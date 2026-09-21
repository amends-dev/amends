import { ThreadPermissions } from "@amends/core/thread";
import { AgentPermissions } from "@amends/core/agent";
import { describe, it, expect } from "@effect/vitest";
import { AssignmentPermissions, BuiltinRoles } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { GroupPermissions, GroupMembershipPermissions } from "@amends/core/group";
import {
  InvitationApplication,
  InvitationPermissions,
  OwnershipPermissions,
  MemberApplication,
  MemberPermissions,
  Workspace,
} from "@amends/core/workspace";
import { Gateway, WorkspaceDirectory } from "@amends/gateway";
import { Effect, Option } from "effect";
import { alice, bob, journalLog, views, inDatabase, host, future, setup } from "./support.ts";

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect("the gateway runs the membership workflow over two isolated workspaces", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const outcome = yield* Effect.gen(function* () {
          const entry = yield* Gateway.Service;
          const a = yield* entry.createWorkspace(alice.id, { name: "Alice workspace" });
          const b = yield* entry.createWorkspace(bob.id, { name: "Bob workspace" });
          const getMember = (workspace: Workspace.Record, identity: Identity.MemberReference) =>
            entry.asMember(
              workspace.id,
              identity,
              Effect.flatMap(MemberApplication.Service, (members) =>
                members.get(workspace.ownerMemberId),
              ),
            );
          yield* Effect.all(
            Array.from({ length: 20 }, (_, index) =>
              index % 2 === 0 ? getMember(a, alice) : getMember(b, bob),
            ),
            { concurrency: "unbounded" },
          );
          const crossed = yield* Effect.flip(getMember(b, alice));
          const expiresAt = yield* future;
          const invitation = yield* entry.asMember(
            a.id,
            alice,
            Effect.flatMap(InvitationApplication.Service, (invitations) =>
              invitations.issue({ recipientId: bob.id, expiresAt, roleId: BuiltinRoles.ViewerId }),
            ),
          );
          const listing = yield* (yield* WorkspaceDirectory.Service).list(bob);
          const joined = yield* entry.inWorkspace(
            a.id,
            Effect.flatMap(InvitationApplication.Service, (invitations) =>
              invitations.accept(invitation.details.id, bob.id),
            ),
          );
          const afterJoin = yield* (yield* WorkspaceDirectory.Service).list(bob);
          const stored = yield* entry.asMember(
            a.id,
            alice,
            Effect.flatMap(InvitationApplication.Service, (invitations) => invitations.list),
          );
          const removed = yield* entry.asMember(
            a.id,
            alice,
            Effect.flatMap(MemberApplication.Service, (members) => members.remove(joined.id)),
          );
          const members = yield* entry.asMember(
            a.id,
            alice,
            Effect.flatMap(MemberApplication.Service, (members) => members.list),
          );
          return {
            a,
            b,
            crossed,
            invitation,
            listing,
            joined,
            afterJoin,
            stored,
            removed,
            members,
          };
        }).pipe(Effect.provide(host(url)));
        expect(outcome.crossed).toMatchObject({ _tag: "Gateway.NotMember" });
        expect(outcome.listing.memberships.map((m) => m.workspace.id)).toEqual([outcome.b.id]);
        expect(outcome.listing.invitations).toEqual([outcome.invitation]);
        expect(outcome.joined).toMatchObject({ identity: bob, status: "active" });
        expect(outcome.afterJoin.invitations).toEqual([]);
        const activeMemberCounts = new Map(
          outcome.afterJoin.memberships.map((m) => [m.workspace.id, m.activeMemberCount]),
        );
        expect(activeMemberCounts).toEqual(
          new Map([
            [outcome.a.id, 2],
            [outcome.b.id, 1],
          ]),
        );
        // Grants come back in their issued order, with their exact scopes and instants.
        expect(outcome.stored).toEqual([
          {
            details: outcome.invitation.details,
            state: { _tag: "Accepted", memberId: outcome.joined.id, acceptedAt: expect.anything() },
          },
        ]);
        expect(outcome.removed).toMatchObject({ id: outcome.joined.id, status: "removed" });
        expect(outcome.members.map((m) => m.status).sort()).toEqual(["active", "removed"]);
        yield* inDatabase(
          url,
          Effect.gen(function* () {
            const storage = yield* views();
            for (const workspace of [outcome.a, outcome.b]) {
              const bound = yield* storage.forWorkspace(workspace.id);
              expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
              const assignments = yield* bound.assignments.listActiveByMember(
                workspace.ownerMemberId,
              );
              expect(assignments.map((assignment) => assignment.source)).toEqual([
                {
                  _tag: "Role",
                  roleId: BuiltinRoles.OwnerId,
                  scope: { _tag: "Workspace", workspaceId: workspace.id },
                },
              ]);
              expect(yield* bound.roles.get(BuiltinRoles.ViewerId)).toEqual(
                Option.some({
                  id: BuiltinRoles.ViewerId,
                  workspaceId: workspace.id,
                  name: "Viewer",
                  permissions: [
                    MemberPermissions.Read.name,
                    AssignmentPermissions.Read.name,
                    GroupPermissions.Read.name,
                    ThreadPermissions.Start.name,
                    ThreadPermissions.Read.name,
                    AgentPermissions.Use.name,
                  ],
                }),
              );
              for (const [id, name] of [
                [BuiltinRoles.AdministratorId, "Administrator"],
                [BuiltinRoles.OwnerId, "Owner"],
              ] as const) {
                expect(yield* bound.roles.get(id)).toEqual(
                  Option.some({
                    id,
                    workspaceId: workspace.id,
                    name,
                    permissions: [
                      MemberPermissions.Read.name,
                      MemberPermissions.Remove.name,
                      InvitationPermissions.Manage.name,
                      AssignmentPermissions.Read.name,
                      AssignmentPermissions.Manage.name,
                      ...(id === BuiltinRoles.OwnerId ? [OwnershipPermissions.Transfer.name] : []),
                      GroupPermissions.Create.name,
                      GroupPermissions.Read.name,
                      GroupMembershipPermissions.Manage.name,
                      ThreadPermissions.Start.name,
                      ThreadPermissions.Read.name,
                      AgentPermissions.Use.name,
                    ],
                  }),
                );
              }
            }
            const bound = yield* storage.forWorkspace(outcome.a.id);
            const batches = yield* bound.store.read(journalLog, { limit: 10 });
            expect(batches.map((batch) => Number(batch.position))).toEqual([0, 1, 2, 3]);
            expect(batches[0]?.entries).toHaveLength(6);
            expect(batches[0]?.commit.entryCount).toBe(6);
            expect(yield* bound.store.get(journalLog, batches[1]!.commit.id)).toEqual(
              Option.some(batches[1]!),
            );
            const accepted = yield* bound.assignments.listActiveByMember(outcome.joined.id);
            expect(accepted.map((assignment) => assignment.source)).toEqual(
              expect.arrayContaining([
                {
                  _tag: "Role",
                  roleId: BuiltinRoles.ViewerId,
                  scope: { _tag: "Workspace", workspaceId: outcome.a.id },
                },
              ]),
            );
            expect(accepted).toHaveLength(1);
          }),
        );
      }),
    ),
  );

  it.effect("workspace creation rejects blank names before persisting a workspace", () =>
    withDatabase((location) =>
      Effect.gen(function* () {
        const gateway = yield* Gateway.Service;
        for (const name of ["", " \t\n"]) {
          expect(yield* Effect.flip(gateway.createWorkspace(alice.id, { name }))).toMatchObject({
            _tag: "Gateway.InvalidInput",
          });
        }
        expect(yield* (yield* WorkspaceDirectory.Service).list(alice)).toEqual({
          memberships: [],
          invitations: [],
        });
        const workspace = yield* gateway.createWorkspace(alice.id, { name: "Studio" });
        expect(workspace.name).toBe("Studio");
        const listing = yield* (yield* WorkspaceDirectory.Service).list(alice);
        expect(listing.memberships.map((membership) => membership.workspace)).toEqual([workspace]);
      }).pipe(Effect.provide(host(location))),
    ),
  );
});
