import { Assignment, BuiltinRoles } from "@amends/core/authorization";
import { describe, expect, it } from "@effect/vitest";
import { Identity } from "@amends/core/identity";
import { Invitation, Member, Ownership, Workspace } from "@amends/core/workspace";
import { DateTime, Effect, Schema } from "effect";
import { setup } from "./database.ts";
import { withServer } from "./server.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const charlie = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("charlie") });
const { available, withDatabase } = setup();
/** A Promise-based subprocess test over a fresh database. */
const temporary = (run: (url: string) => Promise<unknown>) =>
  withDatabase((url) => Effect.promise(() => run(url)));

describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "ownership endpoints transfer to an active human, update directory state, and reject the previous owner's authority",
    () =>
      temporary(async (url) =>
        withServer(url, async (call) => {
          const workspace = Schema.decodeUnknownSync(Workspace.Record)(
            (await call(alice.id, "POST", "/workspaces", { name: "Ownership" })).body,
          );
          const base = `/workspaces/${workspace.id}`;
          const initial = Schema.decodeUnknownSync(Ownership.View)(
            (await call(alice.id, "GET", `${base}/ownership`)).body,
          );
          expect(initial.canTransfer).toBe(true);
          expect(initial.candidates).toEqual([]);
          const expiresAt = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
          const invitation = Schema.decodeUnknownSync(Invitation.Record)(
            (
              await call(alice.id, "POST", `${base}/invitations`, {
                recipientId: bob.id,
                expiresAt,
                roleId: BuiltinRoles.ViewerId,
              })
            ).body,
          );
          const member = Schema.decodeUnknownSync(Member.Record)(
            (await call(bob.id, "POST", `${base}/invitations/${invitation.details.id}/accept`))
              .body,
          );
          const payload = {
            memberId: member.id,
            expectedOwnerAssignmentId: initial.ownerAssignmentId,
          };
          expect((await call(charlie.id, "GET", `${base}/ownership`)).status).toBe(403);
          expect((await call(bob.id, "POST", `${base}/ownership`, payload)).status).toBe(403);
          expect(
            (await call(alice.id, "POST", `${base}/ownership`, { memberId: member.id })).status,
          ).toBe(400);
          expect(
            (
              await call(alice.id, "POST", `${base}/ownership`, {
                ...payload,
                memberId: workspace.ownerMemberId,
              })
            ).status,
          ).toBe(409);
          const transferred = await call(alice.id, "POST", `${base}/ownership`, payload);
          expect(transferred.status).toBe(200);
          expect(transferred.body).toEqual({
            id: workspace.id,
            name: workspace.name,
            createdBy: alice.id,
            ownerMemberId: member.id,
          });
          expect((await call(alice.id, "POST", `${base}/ownership`, payload)).status).toBe(403);
          expect((await call(alice.id, "DELETE", `${base}/members/${member.id}`)).status).toBe(409);
          const current = Schema.decodeUnknownSync(Ownership.View)(
            (await call(bob.id, "GET", `${base}/ownership`)).body,
          );
          expect(current.owner.id).toBe(member.id);
          expect(current.canTransfer).toBe(true);
          expect(current.ownerAssignmentId).not.toBe(initial.ownerAssignmentId);
          expect((await call(alice.id, "GET", "/me/workspaces")).body).toMatchObject({
            memberships: [{ workspace: { ownerMemberId: member.id, createdBy: alice.id } }],
          });
          expect(
            (
              await call(bob.id, "POST", `${base}/ownership`, {
                memberId: workspace.ownerMemberId,
                expectedOwnerAssignmentId: initial.ownerAssignmentId,
              })
            ).status,
          ).toBe(409);
        }),
      ),
  );

  it.live(
    "role invitations and assignment endpoints enforce required roles, delegation, and stale changes",
    () =>
      temporary(async (url) =>
        withServer(url, async (call) => {
          const workspace = Schema.decodeUnknownSync(Workspace.Record)(
            (await call(alice.id, "POST", "/workspaces", { name: "Roles" })).body,
          );
          const base = `/workspaces/${workspace.id}`;
          const expiresAt = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
          expect(
            (
              await call(alice.id, "POST", `${base}/invitations`, {
                recipientId: bob.id,
                expiresAt,
              })
            ).status,
          ).toBe(400);
          expect(
            (
              await call(alice.id, "POST", `${base}/invitations`, {
                recipientId: bob.id,
                expiresAt,
                roleId: BuiltinRoles.OwnerId,
              })
            ).status,
          ).toBe(409);
          const issued = await call(alice.id, "POST", `${base}/invitations`, {
            recipientId: bob.id,
            expiresAt,
            roleId: BuiltinRoles.ViewerId,
          });
          const invitation = Schema.decodeUnknownSync(Invitation.Record)(issued.body);
          const joined = Schema.decodeUnknownSync(Member.Record)(
            (await call(bob.id, "POST", `${base}/invitations/${invitation.details.id}/accept`))
              .body,
          );
          const listing = Schema.decodeUnknownSync(Assignment.Access)(
            (await call(alice.id, "GET", `${base}/members/${joined.id}/assignments`)).body,
          );
          expect(listing.canManage).toBe(true);
          const input = {
            memberId: joined.id,
            roleId: BuiltinRoles.AdministratorId,
            expectedAssignmentIds: listing.assignments.map(({ id }) => id),
          };
          const changed = await call(alice.id, "PUT", `${base}/assignments`, input);
          expect(changed.status).toBe(200);
          const assignment = Schema.decodeUnknownSync(Assignment.Record)(changed.body);
          expect((await call(alice.id, "PUT", `${base}/assignments`, input)).status).toBe(409);
          const choices = Schema.decodeUnknownSync(Schema.Array(Assignment.RoleChoice))(
            (await call(bob.id, "GET", `${base}/roles`)).body,
          );
          expect(choices.filter(({ assignable }) => assignable).map(({ role }) => role.id)).toEqual(
            [BuiltinRoles.ViewerId],
          );
          expect(
            (
              await call(bob.id, "POST", `${base}/invitations`, {
                recipientId: charlie.id,
                expiresAt,
                roleId: BuiltinRoles.AdministratorId,
              })
            ).status,
          ).toBe(403);
          expect(
            (
              await call(bob.id, "POST", `${base}/invitations`, {
                recipientId: charlie.id,
                expiresAt,
                roleId: BuiltinRoles.ViewerId,
              })
            ).status,
          ).toBe(201);
          expect(
            (
              await call(alice.id, "POST", `${base}/assignments`, {
                memberId: joined.id,
                roleId: BuiltinRoles.AdministratorId,
              })
            ).body,
          ).toEqual(changed.body);
          expect(
            (
              await call(
                alice.id,
                "DELETE",
                `${base}/members/${joined.id}/assignments/${assignment.id}`,
              )
            ).status,
          ).toBe(200);
          expect(
            (
              await call(
                alice.id,
                "DELETE",
                `${base}/members/${joined.id}/assignments/${assignment.id}`,
              )
            ).status,
          ).toBe(200);
          expect(
            (await call(bob.id, "GET", `${base}/members/${joined.id}/assignments`)).status,
          ).toBe(403);
        }),
      ),
  );

  it.live("workspace creation requires a name and preserves it across server restarts", () =>
    temporary(async (url) => {
      const workspace = await withServer(url, async (call) => {
        for (const payload of [undefined, {}, { name: "" }, { name: " \t\n" }, { name: 42 }]) {
          expect((await call(alice.id, "POST", "/workspaces", payload)).status).toBe(400);
        }
        expect((await call(alice.id, "GET", "/me/workspaces")).body).toEqual({
          memberships: [],
          invitations: [],
        });
        const created = await call(alice.id, "POST", "/workspaces", {
          name: "Design & Engineering",
        });
        expect(created.status).toBe(201);
        const record = Schema.decodeUnknownSync(Workspace.Record)(created.body);
        expect(record.name).toBe("Design & Engineering");
        return record;
      });
      await withServer(url, async (call) => {
        expect((await call(alice.id, "GET", "/me/workspaces")).body).toMatchObject({
          memberships: [{ workspace }],
        });
      });
    }),
  );

  it.live(
    "the server entry point serves persisted memberships to another process, and denies another identity",
    () =>
      temporary(async (url) => {
        const workspace = await withServer(url, async (call) => {
          const created = await call(alice.id, "POST", "/workspaces", { name: "Test workspace" });
          expect(created.status).toBe(201);
          return Schema.decodeUnknownSync(Workspace.Record)(created.body);
        });
        // A fresh server process reads what the previous one committed.
        await withServer(url, async (call) => {
          const path = `/workspaces/${workspace.id}/members/${workspace.ownerMemberId}`;
          const read = await call(alice.id, "GET", path);
          expect(read.status).toBe(200);
          expect(Schema.decodeUnknownSync(Member.Record)(read.body).identity).toEqual(alice);
          const denied = await call(bob.id, "GET", path);
          expect(denied.status).toBe(403);
          expect(denied.body).toMatchObject({ _tag: "Gateway.NotMember" });
        });
      }),
  );

  it.live("invitation, acceptance, revocation, and removal survive separate server processes", () =>
    temporary(async (url) => {
      const expiresAt = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
      const first = await withServer(url, async (call) => {
        const created = await call(alice.id, "POST", "/workspaces", { name: "Test workspace" });
        expect(created.status).toBe(201);
        const workspace = Schema.decodeUnknownSync(Workspace.Record)(created.body);
        const issued = await call(alice.id, "POST", `/workspaces/${workspace.id}/invitations`, {
          recipientId: bob.id,
          expiresAt,
          roleId: BuiltinRoles.ViewerId,
        });
        expect(issued.status).toBe(201);
        const invitation = Schema.decodeUnknownSync(Invitation.Record)(issued.body);
        const accept = `/workspaces/${workspace.id}/invitations/${invitation.details.id}/accept`;
        expect((await call(charlie.id, "POST", accept)).status).toBe(403);
        const accepted = await call(bob.id, "POST", accept);
        expect(accepted.status).toBe(200);
        return {
          workspace,
          invitation,
          member: Schema.decodeUnknownSync(Member.Record)(accepted.body),
        };
      });
      const { workspace, invitation, member } = first;
      expect(member.identity).toEqual(bob);
      await withServer(url, async (call) => {
        const owner = `/workspaces/${workspace.id}/members/${workspace.ownerMemberId}`;
        const accept = `/workspaces/${workspace.id}/invitations/${invitation.details.id}/accept`;
        expect((await call(bob.id, "GET", owner)).status).toBe(200);
        // Repeating acceptance returns the recorded membership.
        expect((await call(bob.id, "POST", accept)).body).toEqual(first.member);
        const issuedAgain = await call(
          alice.id,
          "POST",
          `/workspaces/${workspace.id}/invitations`,
          {
            recipientId: charlie.id,
            expiresAt,
            roleId: BuiltinRoles.ViewerId,
          },
        );
        expect(issuedAgain.status).toBe(201);
        const second = Schema.decodeUnknownSync(Invitation.Record)(issuedAgain.body);
        const revoke = `/workspaces/${workspace.id}/invitations/${second.details.id}/revoke`;
        expect((await call(alice.id, "POST", revoke)).status).toBe(200);
        const revoked = await call(
          charlie.id,
          "POST",
          `/workspaces/${workspace.id}/invitations/${second.details.id}/accept`,
        );
        expect(revoked.status).toBe(410);
        expect(revoked.body).toMatchObject({
          _tag: "InvitationApplication.Unavailable",
          reason: "revoked",
        });
        expect((await call(bob.id, "DELETE", owner)).status).toBe(403);
        expect((await call(alice.id, "DELETE", owner)).status).toBe(409);
        const removed = await call(
          alice.id,
          "DELETE",
          `/workspaces/${workspace.id}/members/${member.id}`,
        );
        expect(removed.status).toBe(200);
        expect(removed.body).toMatchObject({ id: member.id, status: "removed" });
        expect((await call(bob.id, "GET", owner)).status).toBe(403);
        expect(
          (await call(alice.id, "GET", `/workspaces/${workspace.id}/members/${member.id}`)).body,
        ).toEqual(removed.body);
        expect((await call(bob.id, "POST", accept)).body).toEqual(removed.body);
        expect(
          (await call(alice.id, "DELETE", `/workspaces/${workspace.id}/members/${member.id}`))
            .status,
        ).toBe(409);
      });
    }),
  );
});
