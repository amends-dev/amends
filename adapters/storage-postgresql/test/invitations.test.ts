import { expect } from "bun:test";
import { Grant, Scope, Target } from "@amends/core/authorization";
import { Invitation, Member, MemberPermissions } from "@amends/core/workspace";
import { DateTime, Effect, Option } from "effect";

import { bob, workspaceId, views, inDatabase, initialized, setup } from "./support.ts";
const { it, withDatabase } = await setup();
it("invitations keep their grants, instants, and terminal states across settlement", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        const issuedAt = yield* DateTime.now;
        const grants = [
          Grant.make(MemberPermissions.Read, Scope.Value.cases.Workspace.make({ workspaceId })),
          Grant.make(
            MemberPermissions.Remove,
            Scope.Value.cases.Target.make({
              target: Target.Reference.cases.Member.make({
                workspaceId,
                memberId: workspace.ownerMemberId,
              }),
            }),
          ),
        ];
        const details = (id: string, granted = grants): Invitation.Issuance => ({
          id: Invitation.Id.make(id),
          workspaceId,
          recipientId: bob.id,
          inviterMemberId: workspace.ownerMemberId,
          issuedAt,
          expiresAt: DateTime.add(issuedAt, { hours: 1 }),
          grants: granted,
        });
        const memberId = Member.Id.make("joined");
        const settledAt = DateTime.add(issuedAt, { minutes: 5 });
        const pending = (id: string, granted = grants): Invitation.Record => ({
          details: details(id, granted),
          state: { _tag: "Pending" },
        });
        yield* bound.store.transaction(
          Effect.gen(function* () {
            yield* bound.invitations.insert(pending("first"));
            yield* bound.invitations.insert(pending("second", []));
            yield* bound.invitations.settle(Invitation.Id.make("first"), {
              _tag: "Accepted",
              memberId,
              acceptedAt: settledAt,
            });
          }),
        );
        // A settled invitation stays settled, and a duplicate is refused by the database.
        expect(
          yield* Effect.flip(
            bound.store.transaction(
              bound.invitations.settle(Invitation.Id.make("first"), {
                _tag: "Revoked",
                revokedBy: memberId,
                revokedAt: settledAt,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "InvitationStore.Conflict", operation: "settle" });
        expect(
          yield* Effect.flip(bound.store.transaction(bound.invitations.insert(pending("first")))),
        ).toMatchObject({ _tag: "InvitationStore.Conflict", operation: "insert" });
        // A refused statement aborts the PostgreSQL transaction. A program that
        // swallows the refusal and carries on must not see its commit succeed.
        expect(
          yield* Effect.flip(
            bound.store.transaction(
              Effect.gen(function* () {
                yield* Effect.ignore(bound.invitations.insert(pending("first")));
                yield* bound.invitations.insert(pending("third")).pipe(Effect.ignore);
              }),
            ),
          ),
        ).toMatchObject({ _tag: "JournalStore.Failure", operation: "commit" });
        expect(yield* bound.invitations.get(Invitation.Id.make("third"))).toEqual(Option.none());
        const first = yield* bound.invitations.get(Invitation.Id.make("first"));
        expect(first).toEqual(
          Option.some({
            details: details("first"),
            state: { _tag: "Accepted", memberId, acceptedAt: settledAt },
          }),
        );
        expect((yield* bound.invitations.list).map((record) => String(record.details.id))).toEqual([
          "first",
          "second",
        ]);
        expect(
          (yield* bound.invitations.listPendingByRecipient(bob.id)).map((record) =>
            String(record.details.id),
          ),
        ).toEqual(["second"]);
      }),
    );
  }));
