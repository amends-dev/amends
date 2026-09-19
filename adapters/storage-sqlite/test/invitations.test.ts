import { expect, expectTypeOf, test } from "bun:test";
import { Actor } from "@amends/core/identity";
import { Log } from "@amends/core/journal";
import { InvitationApplication } from "@amends/core/workspace";
import { Effect, Option } from "effect";
import { Operations } from "./operations.ts";

import {
  alice,
  bob,
  charlie,
  runHost,
  temporary,
  request,
  future,
  boundTo,
} from "./invitation-support.ts";
test("owner invites a reader; concurrent repeat acceptance grants once and never reactivates removed membership", async () =>
  temporary(async (filename) => {
    expectTypeOf<
      Effect.Services<ReturnType<InvitationApplication.Interface["accept"]>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Effect.Services<ReturnType<InvitationApplication.Interface["issue"]>>
    >().toEqualTypeOf<Actor.Service>();
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const bound = yield* boundTo(workspace.id);
        expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
        const accepted = yield* Effect.forEach(
          [1, 2],
          () => Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id),
          { concurrency: "unbounded" },
        );
        const first = accepted[0];
        if (first === undefined) throw new Error("Missing acceptance");
        expect(accepted[1]?.id).toBe(first.id);
        expect(yield* bound.assignments.listActiveByMember(first.id)).toHaveLength(1);
        expect(
          (yield* Operations.getMember(workspace.id, bob, workspace.ownerMemberId)).identity,
        ).toEqual(alice);
        expect(
          yield* Effect.flip(
            Operations.invite(workspace.id, bob, request(workspace.id, yield* future, charlie.id)),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        expect(before).toHaveLength(3);
        expect(before[2]?.entries).toHaveLength(3);
        yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        yield* Operations.removeMember(workspace.id, alice, first.id);
        expect(
          (yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id)).status,
        ).toBe("removed");
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, workspace.ownerMemberId)),
        ).toMatchObject({ _tag: "Gateway.NotMember" });
        const freshInvite = yield* Operations.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [],
        });
        const rejoined = yield* Operations.acceptInvitation(
          workspace.id,
          bob.id,
          freshInvite.details.id,
        );
        expect(rejoined.id).not.toBe(first.id);
        expect(yield* bound.assignments.listActiveByMember(rejoined.id)).toEqual([]);
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, workspace.ownerMemberId)),
        ).toMatchObject({ _tag: "Authorization.Denied" });
      }),
    );
  }));

test("revocation is persistent and idempotent; accepted invitations cannot be revoked", async () =>
  temporary(async (filename) => {
    const saved = await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        yield* Operations.revokeInvitation(workspace.id, alice, invitation.details.id);
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        yield* Operations.revokeInvitation(workspace.id, alice, invitation.details.id);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        return { workspace, invitation };
      }),
    );
    await runHost(
      filename,
      Effect.gen(function* () {
        expect(
          yield* Effect.flip(
            Operations.acceptInvitation(saved.workspace.id, bob.id, saved.invitation.details.id),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "revoked" });
        const replacement = yield* Operations.invite(
          saved.workspace.id,
          alice,
          request(saved.workspace.id, yield* future),
        );
        yield* Operations.acceptInvitation(saved.workspace.id, bob.id, replacement.details.id);
        expect(
          yield* Effect.flip(
            Operations.revokeInvitation(saved.workspace.id, alice, replacement.details.id),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "accepted" });
      }),
    );
  }));

test("competing invitations cannot create two active memberships or combine their grants", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const a = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const b = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const results = yield* Effect.forEach(
          [a, b],
          (invitation) =>
            Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id).pipe(
              Effect.result,
            ),
          { concurrency: "unbounded" },
        );
        expect(results.filter((value) => value._tag === "Success")).toHaveLength(1);
        const failure = results.find((value) => value._tag === "Failure");
        expect(failure).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "InvitationApplication.AlreadyMember" },
        });
        const bound = yield* boundTo(workspace.id);
        const member = yield* bound.members.findActive(bob);
        if (Option.isNone(member)) throw new Error("Missing member");
        expect(yield* bound.assignments.listActiveByMember(member.value.id)).toHaveLength(1);
      }),
    );
  }));
