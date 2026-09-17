import { Grant, Identity, MemberPermissions, Scope } from "@amends/core";
import { DateTime, Effect, Schema } from "effect";
import { LocalHost } from "./host.ts";

class Failed extends Schema.TaggedError<Failed>()("LocalDemo.Failed", { message: Schema.String }) {}

/** Exercise real application operations, then close and reopen their persistent storage. */
export const run = Effect.fn("LocalDemo.run")(function* (filename: string) {
  const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("demo-alice") });
  const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("demo-bob") });
  const created = yield* Effect.scoped(
    Effect.gen(function* () {
      const host = yield* LocalHost.Service;
      const a = yield* host.createWorkspace(alice.id);
      const b = yield* host.createWorkspace(bob.id);
      const members = yield* Effect.all(
        [host.getMember(a.id, alice, a.ownerMemberId), host.getMember(b.id, bob, b.ownerMemberId)],
        { concurrency: "unbounded" },
      );
      const rejected = yield* host.getMember(b.id, alice, b.ownerMemberId).pipe(
        Effect.match({
          onFailure: (error) => error._tag === "LocalHost.NotMember",
          onSuccess: () => false,
        }),
      );
      if (!rejected || members[0]?.identity.id !== alice.id || members[1]?.identity.id !== bob.id)
        return yield* new Failed({ message: "Workspace isolation failed" });
      const expiresAt = DateTime.add(yield* DateTime.now, { hours: 1 });
      const invitation = yield* host.invite(a.id, alice, {
        recipientId: bob.id,
        expiresAt,
        grants: [
          Grant.make(
            MemberPermissions.Read,
            Scope.Value.cases.Workspace.make({ workspaceId: a.id }),
          ),
        ],
      });
      const wrongRecipient = yield* host
        .acceptInvitation(a.id, alice.id, invitation.details.id)
        .pipe(
          Effect.match({
            onFailure: (error) => error._tag === "InvitationApplication.NotRecipient",
            onSuccess: () => false,
          }),
        );
      if (!wrongRecipient)
        return yield* new Failed({ message: "Invitation accepted by the wrong person" });
      const joined = yield* host.acceptInvitation(a.id, bob.id, invitation.details.id);
      yield* host.getMember(a.id, bob, a.ownerMemberId);
      const cannotInvite = yield* host
        .invite(a.id, bob, {
          recipientId: Identity.HumanId.make("demo-charlie"),
          expiresAt,
          grants: [],
        })
        .pipe(
          Effect.match({
            onFailure: (error) => error._tag === "Authorization.Denied",
            onSuccess: () => false,
          }),
        );
      if (!cannotInvite)
        return yield* new Failed({ message: "Read permission unexpectedly allowed invitations" });
      const revoked = yield* host.invite(a.id, alice, {
        recipientId: Identity.HumanId.make("demo-charlie"),
        expiresAt,
        grants: [],
      });
      yield* host.revokeInvitation(a.id, alice, revoked.details.id);
      const cannotAccept = yield* host
        .acceptInvitation(a.id, revoked.details.recipientId, revoked.details.id)
        .pipe(
          Effect.match({
            onFailure: (error) => error._tag === "InvitationApplication.Unavailable",
            onSuccess: () => false,
          }),
        );
      if (!cannotAccept) return yield* new Failed({ message: "Revoked invitation was accepted" });
      return { workspaces: [a, b] as const, invitation, joined };
    }).pipe(Effect.provide(LocalHost.layer(filename))),
  );

  // Layer and database resource scopes from creation have closed before this opens.
  yield* Effect.scoped(
    Effect.gen(function* () {
      const host = yield* LocalHost.Service;
      for (const [workspace, identity] of [
        [created.workspaces[0], alice],
        [created.workspaces[1], bob],
      ] as const) {
        const member = yield* host.getMember(workspace.id, identity, workspace.ownerMemberId);
        if (member.identity.id !== identity.id)
          return yield* new Failed({ message: "Reopened data differs" });
      }
      const receipt = yield* host.acceptInvitation(
        created.workspaces[0].id,
        bob.id,
        created.invitation.details.id,
      );
      if (receipt.id !== created.joined.id)
        return yield* new Failed({ message: "Repeated acceptance created a new membership" });
      yield* host.getMember(created.workspaces[0].id, bob, created.joined.id);
    }).pipe(Effect.provide(LocalHost.layer(filename))),
  );
  yield* Effect.log(
    "Created two workspaces; verified isolation, invitation acceptance, limited access, revocation, and persistence after reopening.",
    {
      database: filename,
      workspaces: created.workspaces,
      invitationId: created.invitation.details.id,
      invitedMemberId: created.joined.id,
    },
  );
});

export * as LocalDemo from "./demo.ts";
