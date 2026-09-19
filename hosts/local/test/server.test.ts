import { Assignment, BuiltinRoles } from "@amends/core/authorization";
import { expect, test } from "bun:test";
import { Identity } from "@amends/core/identity";
import { Invitation, Member, Workspace } from "@amends/core/workspace";
import { DateTime, Schema } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withServer } from "./server.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const charlie = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("charlie") });
const temporary = async (run: (filename: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "amends-server-"));
  try {
    await run(join(directory, "test.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("role invitations and assignment endpoints enforce required roles, delegation, and stale changes", async () =>
  temporary(async (filename) =>
    withServer(filename, async (call) => {
      const workspace = Schema.decodeUnknownSync(Workspace.Record)(
        (await call(alice.id, "POST", "/workspaces", { name: "Roles" })).body,
      );
      const base = `/workspaces/${workspace.id}`;
      const expiresAt = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
      expect(
        (await call(alice.id, "POST", `${base}/invitations`, { recipientId: bob.id, expiresAt }))
          .status,
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
        (await call(bob.id, "POST", `${base}/invitations/${invitation.details.id}/accept`)).body,
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
      expect(choices.filter(({ assignable }) => assignable).map(({ role }) => role.id)).toEqual([
        BuiltinRoles.ViewerId,
      ]);
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
      expect((await call(bob.id, "GET", `${base}/members/${joined.id}/assignments`)).status).toBe(
        403,
      );
    }),
  ));

test("workspace creation requires a name and preserves it across server restarts", async () =>
  temporary(async (filename) => {
    const workspace = await withServer(filename, async (call) => {
      for (const payload of [undefined, {}, { name: "" }, { name: " \t\n" }, { name: 42 }]) {
        expect((await call(alice.id, "POST", "/workspaces", payload)).status).toBe(400);
      }
      expect((await call(alice.id, "GET", "/me/workspaces")).body).toEqual({
        memberships: [],
        invitations: [],
      });
      const created = await call(alice.id, "POST", "/workspaces", { name: "Design & Engineering" });
      expect(created.status).toBe(201);
      const record = Schema.decodeUnknownSync(Workspace.Record)(created.body);
      expect(record.name).toBe("Design & Engineering");
      return record;
    });
    await withServer(filename, async (call) => {
      expect((await call(alice.id, "GET", "/me/workspaces")).body).toMatchObject({
        memberships: [{ workspace }],
      });
    });
  }));

test("the server entry point serves persisted memberships to another process, and denies another identity", async () =>
  temporary(async (filename) => {
    const workspace = await withServer(filename, async (call) => {
      const created = await call(alice.id, "POST", "/workspaces", { name: "Test workspace" });
      expect(created.status).toBe(201);
      return Schema.decodeUnknownSync(Workspace.Record)(created.body);
    });
    // A fresh server process reads what the previous one committed.
    await withServer(filename, async (call) => {
      const path = `/workspaces/${workspace.id}/members/${workspace.ownerMemberId}`;
      const read = await call(alice.id, "GET", path);
      expect(read.status).toBe(200);
      expect(Schema.decodeUnknownSync(Member.Record)(read.body).identity).toEqual(alice);
      const denied = await call(bob.id, "GET", path);
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ _tag: "Gateway.NotMember" });
    });
  }));

test("invitation, acceptance, revocation, and removal survive separate server processes", async () =>
  temporary(async (filename) => {
    const expiresAt = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
    const first = await withServer(filename, async (call) => {
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
    await withServer(filename, async (call) => {
      const owner = `/workspaces/${workspace.id}/members/${workspace.ownerMemberId}`;
      const accept = `/workspaces/${workspace.id}/invitations/${invitation.details.id}/accept`;
      expect((await call(bob.id, "GET", owner)).status).toBe(200);
      // Repeating acceptance returns the recorded membership.
      expect((await call(bob.id, "POST", accept)).body).toEqual(first.member);
      const issuedAgain = await call(alice.id, "POST", `/workspaces/${workspace.id}/invitations`, {
        recipientId: charlie.id,
        expiresAt,
        roleId: BuiltinRoles.ViewerId,
      });
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
        (await call(alice.id, "DELETE", `/workspaces/${workspace.id}/members/${member.id}`)).status,
      ).toBe(409);
    });
  }));
