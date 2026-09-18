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

test("the server entry point serves persisted memberships to another process, and denies another identity", async () =>
  temporary(async (filename) => {
    const workspace = await withServer(filename, async (call) => {
      const created = await call(alice.id, "POST", "/workspaces");
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
      const created = await call(alice.id, "POST", "/workspaces");
      expect(created.status).toBe(201);
      const workspace = Schema.decodeUnknownSync(Workspace.Record)(created.body);
      const issued = await call(alice.id, "POST", `/workspaces/${workspace.id}/invitations`, {
        recipientId: bob.id,
        expiresAt,
        grants: [
          { permission: "member.read", scope: { _tag: "Workspace", workspaceId: workspace.id } },
        ],
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
        grants: [],
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
