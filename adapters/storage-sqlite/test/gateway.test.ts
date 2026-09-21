import {
  ThreadPermissions,
  ThreadMessagePermissions,
  ThreadParticipationPermissions,
} from "@amends/core/thread";
import { AgentPermissions } from "@amends/core/agent";
import { expect, expectTypeOf, it } from "@effect/vitest";
import { AssignmentPermissions, BuiltinRoles } from "@amends/core/authorization";
import { Log } from "@amends/core/journal";
import {
  InvitationPermissions,
  MemberPermissions,
  MemberProjection,
  OwnershipPermissions,
} from "@amends/core/workspace";
import { Gateway, WorkspaceDirectory } from "@amends/gateway";
import { Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { GroupPermissions, GroupMembershipPermissions } from "@amends/core/group";
import { Operations } from "./operations.ts";
import { alice, bob, views, inDatabase, host, temporary, boundTo } from "./support.ts";

it.effect(
  "one host creates two isolated workspaces and uses each operation's authenticated identity",
  () =>
    temporary((filename) =>
      Effect.gen(function* () {
        expectTypeOf<
          Effect.Services<ReturnType<typeof Operations.getMember>>
        >().toEqualTypeOf<Gateway.Service>();
        expectTypeOf<
          Effect.Services<ReturnType<Gateway.Interface["createWorkspace"]>>
        >().toEqualTypeOf<never>();
        const workspaces = yield* Effect.gen(function* () {
          const a = yield* Operations.createWorkspace(alice.id);
          const b = yield* Operations.createWorkspace(bob.id);
          const requests = Array.from({ length: 20 }, (_, index) => {
            const [workspace, identity] =
              index % 2 === 0 ? ([a, alice] as const) : ([b, bob] as const);
            return Operations.getMember(workspace.id, identity, workspace.ownerMemberId).pipe(
              Effect.tap((record) => {
                expect(record.workspaceId).toBe(workspace.id);
                expect(record.identity).toEqual(identity);
                return Effect.void;
              }),
            );
          });
          yield* Effect.all(requests, { concurrency: "unbounded" });
          expect(
            yield* Effect.flip(Operations.getMember(b.id, alice, b.ownerMemberId)),
          ).toMatchObject({
            _tag: "Gateway.NotMember",
          });
          expect(
            yield* Effect.flip(Operations.getMember(a.id, bob, a.ownerMemberId)),
          ).toMatchObject({
            _tag: "Gateway.NotMember",
          });
          expect(
            yield* Effect.flip(Operations.getMember(a.id, alice, b.ownerMemberId)),
          ).toMatchObject({
            _tag: "MemberApplication.NotFound",
          });
          return [a, b];
        }).pipe(Effect.provide(host(filename)));
        yield* inDatabase(
          filename,
          Effect.gen(function* () {
            const storage = yield* views;
            for (const workspace of workspaces) {
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
                    ThreadMessagePermissions.Publish.name,
                    ThreadParticipationPermissions.Follow.name,
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
                      ThreadMessagePermissions.Publish.name,
                      ThreadParticipationPermissions.Follow.name,
                      AgentPermissions.Use.name,
                    ],
                  }),
                );
              }
              const batches = yield* bound.store.read(Log.Id.make("journal"), { limit: 10 });
              expect(batches).toHaveLength(1);
              expect(batches[0]?.entries).toHaveLength(6);
              expect(batches[0]?.commit.entryCount).toBe(6);
            }
          }),
        );
      }),
    ),
);

it.effect("workspace creation rejects blank names before persisting a workspace", () =>
  temporary((location) =>
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

it.effect(
  "cold workspace boot replays pending membership history before resolving the caller",
  () =>
    temporary((filename) =>
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id).pipe(
          Effect.provide(host(filename)),
        );
        // Prepare a fresh projection target while the host is offline.
        const before = yield* inDatabase(
          filename,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const bound = yield* boundTo(workspace.id);
            yield* sql.withTransaction(
              Effect.gen(function* () {
                yield* sql`DELETE FROM members WHERE workspace_id = ${workspace.id}`;
                yield* sql`DELETE FROM checkpoints WHERE workspace_id = ${workspace.id} AND name = ${MemberProjection.definition.name}`;
              }),
            );
            expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
            return yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
          }),
        );
        yield* Effect.gen(function* () {
          const member = yield* Operations.getMember(workspace.id, alice, workspace.ownerMemberId);
          expect(member).toMatchObject({
            id: workspace.ownerMemberId,
            identity: alice,
            status: "active",
          });
          const bound = yield* boundTo(workspace.id);
          expect(yield* bound.members.findActive(alice)).toEqual(Option.some(member));
          expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        }).pipe(Effect.provide(host(filename)));
      }),
    ),
);
