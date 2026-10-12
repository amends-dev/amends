import { Assignment, BuiltinRoles } from "@amends-dev/core/authorization";
import { describe, expect, it } from "@effect/vitest";
import { Identity } from "@amends-dev/core/identity";
import { Invitation, Member, Ownership, Workspace } from "@amends-dev/core/workspace";
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
  it.live("names and messages storage cannot keep as given are refused as invalid", () =>
    temporary(async (url) =>
      withServer(url, async (call) => {
        const workspace = Schema.decodeUnknownSync(Workspace.Workspace)(
          (await call(alice.id, "POST", "/workspaces", { name: "Names", memberName: "alice" }))
            .body,
        );
        const base = `/workspaces/${workspace.id}`;
        const statuses = [
          (await call(alice.id, "POST", "/workspaces", { name: "a\u0000b", memberName: "alice" }))
            .status,
          (
            await call(alice.id, "POST", "/workspaces", {
              name: "x".repeat(81),
              memberName: "alice",
            })
          ).status,
          (await call(alice.id, "POST", `${base}/groups`, { name: "a\u0000b", memberIds: [] }))
            .status,
          (await call(alice.id, "POST", `${base}/groups`, { name: "a\u202Eb", memberIds: [] }))
            .status,
          (await call(alice.id, "PUT", `${base}/members/me/name`, { name: "a\u0000b" })).status,
          (
            await call(alice.id, "POST", `${base}/groups/general/threads`, {
              text: "a\u0000b",
              mentions: [],
            })
          ).status,
        ];
        expect(statuses).toEqual([400, 400, 400, 400, 400, 400]);
      }),
    ),
  );

  it.live(
    "the smallest pool serves writes and reads while change streams are open",
    () =>
      temporary(async (url) =>
        withServer(
          url,
          async (call, base) => {
            const workspace = Schema.decodeUnknownSync(Workspace.Workspace)(
              (await call(alice.id, "POST", "/workspaces", { name: "Pool", memberName: "alice" }))
                .body,
            );
            // Streams hold the change feed's listener; the claim and shard locks hold two more.
            const streams = Array.from({ length: 2 }, () => new AbortController());
            for (const stream of streams) {
              const response = await fetch(`${base}/workspaces/${workspace.id}/changes`, {
                headers: { authorization: `Bearer ${alice.id}` },
                signal: stream.signal,
              });
              expect(response.status).toBe(200);
              void response.body
                ?.getReader()
                .read()
                .catch(() => {});
            }
            const path = `/workspaces/${workspace.id}/groups`;
            const results = await Promise.all([
              ...Array.from({ length: 10 }, (_, index) =>
                call(alice.id, "POST", path, { name: `pool-${index}`, memberIds: [] }),
              ),
              ...Array.from({ length: 20 }, () => call(alice.id, "GET", `${path}?limit=10`)),
            ]);
            for (const stream of streams) stream.abort();
            expect(results.map((result) => result.status).toSorted((a, b) => a - b)).toEqual([
              ...Array.from({ length: 20 }, () => 200),
              ...Array.from({ length: 10 }, () => 201),
            ]);
          },
          { env: { AMENDS_DATABASE_POOL_SIZE: "5" } },
        ),
      ),
    20_000,
  );

  it.live(
    "ownership endpoints transfer to an active human, update directory state, and reject the previous owner's authority",
    () =>
      temporary(async (url) =>
        withServer(url, async (call) => {
          const workspace = Schema.decodeUnknownSync(Workspace.Workspace)(
            (
              await call(alice.id, "POST", "/workspaces", {
                name: "Ownership",
                memberName: "alice",
              })
            ).body,
          );
          const base = `/workspaces/${workspace.id}`;
          const initial = Schema.decodeUnknownSync(Ownership.View)(
            (await call(alice.id, "GET", `${base}/ownership`)).body,
          );
          expect(initial.canTransfer).toBe(true);
          expect(initial.candidates).toEqual([]);
          const expiresAt = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
          const invitation = Schema.decodeUnknownSync(Invitation.Invitation)(
            (
              await call(alice.id, "POST", `${base}/invitations`, {
                email: "bob@example.com",
                expiresAt,
                roleId: BuiltinRoles.MemberId,
              })
            ).body,
          );
          // Development tokens are human IDs: Bob's is his account's, which the invitation names.
          const bobId = invitation.details.recipientId;
          const member = Schema.decodeUnknownSync(Member.Member)(
            (
              await call(bobId, "POST", `${base}/invitations/${invitation.details.id}/accept`, {
                name: "bob",
              })
            ).body,
          );
          const payload = {
            memberId: member.id,
            expectedOwnerAssignmentId: initial.ownerAssignmentId,
          };
          expect((await call(charlie.id, "GET", `${base}/ownership`)).status).toBe(403);
          expect((await call(bobId, "POST", `${base}/ownership`, payload)).status).toBe(403);
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
            (await call(bobId, "GET", `${base}/ownership`)).body,
          );
          expect(current.owner.id).toBe(member.id);
          expect(current.canTransfer).toBe(true);
          expect(current.ownerAssignmentId).not.toBe(initial.ownerAssignmentId);
          expect((await call(alice.id, "GET", "/me/workspaces")).body).toMatchObject({
            memberships: [{ workspace: { ownerMemberId: member.id, createdBy: alice.id } }],
          });
          expect(
            (
              await call(bobId, "POST", `${base}/ownership`, {
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
          const workspace = Schema.decodeUnknownSync(Workspace.Workspace)(
            (await call(alice.id, "POST", "/workspaces", { name: "Roles", memberName: "alice" }))
              .body,
          );
          const base = `/workspaces/${workspace.id}`;
          const expiresAt = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
          expect(
            (
              await call(alice.id, "POST", `${base}/invitations`, {
                email: "bob@example.com",
                expiresAt,
              })
            ).status,
          ).toBe(400);
          expect(
            (
              await call(alice.id, "POST", `${base}/invitations`, {
                email: "bob@example.com",
                expiresAt,
                roleId: BuiltinRoles.OwnerId,
              })
            ).status,
          ).toBe(409);
          const issued = await call(alice.id, "POST", `${base}/invitations`, {
            email: "bob@example.com",
            expiresAt,
            roleId: BuiltinRoles.MemberId,
          });
          const invitation = Schema.decodeUnknownSync(Invitation.Invitation)(issued.body);
          const bobId = invitation.details.recipientId;
          const joined = Schema.decodeUnknownSync(Member.Member)(
            (
              await call(bobId, "POST", `${base}/invitations/${invitation.details.id}/accept`, {
                name: "bob",
              })
            ).body,
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
          const assignment = Schema.decodeUnknownSync(Assignment.Assignment)(changed.body);
          expect((await call(alice.id, "PUT", `${base}/assignments`, input)).status).toBe(409);
          const choices = Schema.decodeUnknownSync(Schema.Array(Assignment.RoleChoice))(
            (await call(bobId, "GET", `${base}/roles`)).body,
          );
          expect(choices.filter(({ assignable }) => assignable).map(({ role }) => role.id)).toEqual(
            [BuiltinRoles.MemberId],
          );
          expect(
            (
              await call(bobId, "POST", `${base}/invitations`, {
                email: "charlie@example.com",
                expiresAt,
                roleId: BuiltinRoles.AdministratorId,
              })
            ).status,
          ).toBe(403);
          expect(
            (
              await call(bobId, "POST", `${base}/invitations`, {
                email: "charlie@example.com",
                expiresAt,
                roleId: BuiltinRoles.MemberId,
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
            (await call(bobId, "GET", `${base}/members/${joined.id}/assignments`)).status,
          ).toBe(403);
        }),
      ),
  );

  it.live("workspace creation requires a name and preserves it across server restarts", () =>
    temporary(async (url) => {
      const workspace = await withServer(url, async (call) => {
        for (const payload of [
          undefined,
          {},
          { name: "", memberName: "alice" },
          { name: " \t\n", memberName: "alice" },
          { name: 42, memberName: "alice" },
          { name: "Studio" },
        ]) {
          expect((await call(alice.id, "POST", "/workspaces", payload)).status).toBe(400);
        }
        expect((await call(alice.id, "GET", "/me/workspaces")).body).toEqual({
          memberships: [],
          invitations: [],
        });
        const created = await call(alice.id, "POST", "/workspaces", {
          name: "Design & Engineering",
          memberName: "alice",
        });
        expect(created.status).toBe(201);
        const record = Schema.decodeUnknownSync(Workspace.Workspace)(created.body);
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
          const created = await call(alice.id, "POST", "/workspaces", {
            name: "Test workspace",
            memberName: "alice",
          });
          expect(created.status).toBe(201);
          return Schema.decodeUnknownSync(Workspace.Workspace)(created.body);
        });
        // A fresh server process reads what the previous one committed.
        await withServer(url, async (call) => {
          const path = `/workspaces/${workspace.id}/members/${workspace.ownerMemberId}`;
          const read = await call(alice.id, "GET", path);
          expect(read.status).toBe(200);
          expect(Schema.decodeUnknownSync(Member.Member)(read.body).identity).toEqual(alice);
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
        const created = await call(alice.id, "POST", "/workspaces", {
          name: "Test workspace",
          memberName: "alice",
        });
        expect(created.status).toBe(201);
        const workspace = Schema.decodeUnknownSync(Workspace.Workspace)(created.body);
        const issued = await call(alice.id, "POST", `/workspaces/${workspace.id}/invitations`, {
          email: "bob@example.com",
          expiresAt,
          roleId: BuiltinRoles.MemberId,
        });
        expect(issued.status).toBe(201);
        const invitation = Schema.decodeUnknownSync(Invitation.Invitation)(issued.body);
        const bobId = invitation.details.recipientId;
        const accept = `/workspaces/${workspace.id}/invitations/${invitation.details.id}/accept`;
        expect((await call(charlie.id, "POST", accept, { name: "charlie" })).status).toBe(403);
        expect((await call(bobId, "POST", accept)).status).toBe(400);
        const accepted = await call(bobId, "POST", accept, { name: "bob" });
        expect(accepted.status).toBe(200);
        return {
          workspace,
          invitation,
          member: Schema.decodeUnknownSync(Member.Member)(accepted.body),
        };
      });
      const { workspace, invitation, member } = first;
      const bobId = invitation.details.recipientId;
      expect(member.identity).toEqual({ _tag: "Human", id: bobId });
      await withServer(url, async (call) => {
        const owner = `/workspaces/${workspace.id}/members/${workspace.ownerMemberId}`;
        const accept = `/workspaces/${workspace.id}/invitations/${invitation.details.id}/accept`;
        expect((await call(bobId, "GET", owner)).status).toBe(200);
        // Repeating acceptance returns the recorded membership.
        expect((await call(bobId, "POST", accept, { name: "bob" })).body).toEqual(first.member);
        const issuedAgain = await call(
          alice.id,
          "POST",
          `/workspaces/${workspace.id}/invitations`,
          {
            email: "charlie@example.com",
            expiresAt,
            roleId: BuiltinRoles.MemberId,
          },
        );
        expect(issuedAgain.status).toBe(201);
        const second = Schema.decodeUnknownSync(Invitation.Invitation)(issuedAgain.body);
        const revoke = `/workspaces/${workspace.id}/invitations/${second.details.id}/revoke`;
        expect((await call(alice.id, "POST", revoke)).status).toBe(200);
        const revoked = await call(
          second.details.recipientId,
          "POST",
          `/workspaces/${workspace.id}/invitations/${second.details.id}/accept`,
          { name: "charlie" },
        );
        expect(revoked.status).toBe(410);
        expect(revoked.body).toMatchObject({
          _tag: "InvitationService.Unavailable",
          reason: "revoked",
        });
        expect((await call(bobId, "DELETE", owner)).status).toBe(403);
        expect((await call(alice.id, "DELETE", owner)).status).toBe(409);
        const removed = await call(
          alice.id,
          "DELETE",
          `/workspaces/${workspace.id}/members/${member.id}`,
        );
        expect(removed.status).toBe(200);
        expect(removed.body).toMatchObject({ id: member.id, status: "removed" });
        expect((await call(bobId, "GET", owner)).status).toBe(403);
        expect(
          (await call(alice.id, "GET", `/workspaces/${workspace.id}/members/${member.id}`)).body,
        ).toEqual(removed.body);
        expect((await call(bobId, "POST", accept, { name: "bob" })).body).toEqual(removed.body);
        expect(
          (await call(alice.id, "DELETE", `/workspaces/${workspace.id}/members/${member.id}`))
            .status,
        ).toBe(409);
      });
    }),
  );

  it.live("a request body over a mebibyte is refused before the host reads it", () =>
    temporary(async (url) =>
      withServer(url, async (call, base) => {
        const post = (name: string) =>
          fetch(`${base}/workspaces`, {
            method: "POST",
            headers: { authorization: `Bearer ${alice.id}`, "content-type": "application/json" },
            body: JSON.stringify({ name, memberName: "alice" }),
          });
        expect((await post("x".repeat(2 * 1024 * 1024))).status).toBe(413);
        // A body within the limit is read as usual, and the refused one created nothing.
        expect((await post("Small")).status).toBe(201);
        const me = (await call(alice.id, "GET", "/me/workspaces")).body as {
          readonly memberships: ReadonlyArray<unknown>;
        };
        expect(me.memberships).toHaveLength(1);
      }),
    ),
  );

  it.live("stopping the host ends open change streams at once, telling them to reconnect", () =>
    temporary(async (url) =>
      withServer(url, async (call, base, stop) => {
        const workspace = Schema.decodeUnknownSync(Workspace.Workspace)(
          (await call(alice.id, "POST", "/workspaces", { name: "Streams", memberName: "alice" }))
            .body,
        );
        const response = await fetch(`${base}/workspaces/${workspace.id}/changes`, {
          headers: { authorization: `Bearer ${alice.id}` },
        });
        const reader = response.body?.getReader();
        if (reader === undefined) throw new Error("Expected a stream");
        const decoder = new TextDecoder();
        let received = "";
        while (!received.includes("Ready")) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error("The stream ended before it was ready");
          received += decoder.decode(chunk.value, { stream: true });
        }
        const elapsed = await stop();
        // The server's graceful stop would otherwise wait twenty seconds for the open stream.
        expect(elapsed).toBeLessThan(5_000);
        while (true) {
          const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
          if (chunk.done) break;
          received += decoder.decode(chunk.value, { stream: true });
        }
        expect(received).toContain("ChangeFeed.Unavailable");
      }),
    ),
  );
});
