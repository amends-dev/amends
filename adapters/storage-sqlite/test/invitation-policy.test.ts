import { expect, test } from "bun:test";
import { AssignmentFacts, Grant, Permission } from "@amends/core/authorization";
import { Journal, Log } from "@amends/core/journal";
import {
  InvitationPermissions,
  MemberFacts,
  MemberPermissions,
  Workspace,
} from "@amends/core/workspace";
import { DateTime, Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Operations } from "./operations.ts";

import {
  alice,
  bob,
  charlie,
  core,
  runHost,
  temporary,
  scope,
  request,
  future,
  boundTo,
  at,
} from "./invitation-support.ts";
test("recipient identity and workspace binding protect pending and accepted invitations", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const a = yield* Operations.createWorkspace(alice.id);
        const b = yield* Operations.createWorkspace(charlie.id);
        const invitation = yield* Operations.invite(a.id, alice, request(a.id, yield* future));
        const bound = yield* boundTo(a.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        expect(
          yield* Effect.flip(Operations.acceptInvitation(a.id, charlie.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotRecipient" });
        expect(
          yield* Effect.flip(Operations.acceptInvitation(b.id, bob.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotFound" });
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        yield* Operations.acceptInvitation(a.id, bob.id, invitation.details.id);
        expect(
          yield* Effect.flip(Operations.acceptInvitation(a.id, charlie.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotRecipient" });
        expect(yield* (yield* boundTo(b.id)).members.findActive(bob)).toEqual(Option.none());
      }),
    );
  }));

test("expiry is checked against the operation clock, including the exact deadline", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const now = yield* DateTime.now;
        const expiresAt = DateTime.add(now, { seconds: 30 });
        expect(
          yield* at(
            now,
            Effect.flip(Operations.invite(workspace.id, alice, request(workspace.id, now))),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.InvalidExpiry" });
        const invitation = yield* at(
          now,
          Operations.invite(workspace.id, alice, request(workspace.id, expiresAt)),
        );
        expect(
          yield* at(
            expiresAt,
            Effect.flip(Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id)),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "expired" });
        expect(yield* (yield* boundTo(workspace.id)).members.findActive(bob)).toEqual(
          Option.none(),
        );
        const revoked = yield* at(
          expiresAt,
          Operations.revokeInvitation(workspace.id, alice, invitation.details.id),
        );
        expect(revoked.state._tag).toBe("Revoked");
      }),
    );
  }));

test("holding invitation permission does not confer ownership-based grant authority", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [Grant.make(InvitationPermissions.Manage, scope(workspace.id))],
        });
        yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
        expect(
          yield* Effect.flip(
            Operations.invite(workspace.id, bob, request(workspace.id, yield* future, charlie.id)),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.NotOwner" });
      }),
    );
  }));

test("acceptance rechecks original inviter's permission, membership, and ownership", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        for (const change of ["permission", "membership", "ownership"] as const) {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const invitation = yield* Operations.invite(
            workspace.id,
            alice,
            request(workspace.id, yield* future),
          );
          const bound = yield* boundTo(workspace.id);
          if (change === "permission") {
            const assignment = (yield* bound.assignments.listActiveByMember(
              workspace.ownerMemberId,
            )).find(
              ({ source }) =>
                source._tag === "Direct" &&
                source.grant.permission === InvitationPermissions.Manage.name,
            );
            if (assignment === undefined) throw new Error("Missing invitation assignment");
            yield* Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(AssignmentFacts.Revoked, {
                workspaceId: workspace.id,
                assignmentId: assignment.id,
              }),
            ).pipe(Effect.provide(core(bound)));
          } else if (change === "membership") {
            yield* Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(MemberFacts.Removed, {
                workspaceId: workspace.id,
                memberId: workspace.ownerMemberId,
              }),
            ).pipe(Effect.provide(core(bound)));
          } else {
            const sql = yield* SqlClient.SqlClient;
            yield* sql`UPDATE workspaces SET record = json_set(record, '$.ownerMemberId', 'successor') WHERE workspace_id = ${workspace.id}`;
          }
          const failure = yield* Effect.flip(
            Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id),
          );
          expect(failure._tag).toBe(
            change === "permission"
              ? "Authorization.Denied"
              : change === "membership"
                ? "Authorization.InvalidActor"
                : "InvitationApplication.NotOwner",
          );
          expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
          expect(yield* bound.invitations.get(invitation.details.id)).toMatchObject({
            _tag: "Some",
            value: { state: { _tag: "Pending" } },
          });
        }
      }),
    );
  }));

test("invalid grant names, target kinds, and foreign scopes never publish an invitation", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        const invalid: ReadonlyArray<Grant.Value> = [
          { permission: Permission.Name.make("unknown.permission"), scope: scope(workspace.id) },
          { permission: MemberPermissions.Read.name, scope: scope(Workspace.Id.make("foreign")) },
          {
            permission: MemberPermissions.Read.name,
            scope: { _tag: "Target", target: { _tag: "Workspace", workspaceId: workspace.id } },
          },
        ];
        for (const grant of invalid) {
          yield* Effect.flip(
            Operations.invite(workspace.id, alice, {
              recipientId: bob.id,
              grants: [grant],
              expiresAt: yield* future,
            }),
          );
          expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        }
        expect(
          yield* Effect.flip(
            Operations.invite(workspace.id, alice, request(workspace.id, yield* future, alice.id)),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.AlreadyMember" });
      }),
    );
  }));

test("exact-target grants remain limited to that member after acceptance", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [
            Grant.make(MemberPermissions.Read, {
              _tag: "Target",
              target: {
                _tag: "Member",
                workspaceId: workspace.id,
                memberId: workspace.ownerMemberId,
              },
            }),
          ],
        });
        const member = yield* Operations.acceptInvitation(
          workspace.id,
          bob.id,
          invitation.details.id,
        );
        yield* Operations.getMember(workspace.id, bob, workspace.ownerMemberId);
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, member.id)),
        ).toMatchObject({
          _tag: "Authorization.Denied",
        });
      }),
    );
  }));
