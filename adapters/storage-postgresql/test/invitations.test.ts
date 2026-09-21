import { describe, it, expect } from "@effect/vitest";
import { BuiltinRoles } from "@amends/core/authorization";
import { Invitation, Member } from "@amends/core/workspace";
import { DateTime, Effect, Option } from "effect";
import { bob, workspaceId, views, inDatabase, initialized, setup } from "./support.ts";

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect("invitations keep their roles, instants, and terminal states across settlement", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* (yield* views()).forWorkspace(workspaceId);
          const workspace = yield* initialized(bound);
          const issuedAt = yield* DateTime.now;
          const details = (id: string, roleId = BuiltinRoles.ViewerId): Invitation.Issuance => ({
            id: Invitation.Id.make(id),
            workspaceId,
            recipientId: bob.id,
            inviterMemberId: workspace.ownerMemberId,
            issuedAt,
            expiresAt: DateTime.add(issuedAt, { hours: 1 }),
            roleId,
          });
          const memberId = Member.Id.make("joined");
          const settledAt = DateTime.add(issuedAt, { minutes: 5 });
          const pending = (id: string, roleId = BuiltinRoles.ViewerId): Invitation.Record => ({
            details: details(id, roleId),
            state: { _tag: "Pending" },
          });
          yield* bound.store.transaction(
            Effect.gen(function* () {
              yield* bound.invitations.insert(pending("first"));
              yield* bound.invitations.insert(pending("second", BuiltinRoles.AdministratorId));
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
          expect(
            (yield* bound.invitations.list).map((record) => String(record.details.id)),
          ).toEqual(["first", "second"]);
          expect(
            (yield* bound.invitations.listPendingByRecipient(bob.id)).map((record) =>
              String(record.details.id),
            ),
          ).toEqual(["second"]);
        }),
      ),
    ),
  );
});
