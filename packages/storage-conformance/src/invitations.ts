import { BuiltinRoles } from "@amends/core/authorization";
import { Group } from "@amends/core/group";
import { Actor } from "@amends/core/identity";
import { Journal, Log } from "@amends/core/journal";
import { Invitation, InvitationApplication, Member } from "@amends/core/workspace";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import type { Harness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  boundTo,
  charlie,
  future,
  request,
  runHost,
  Support,
  workspaceId,
} from "./support.ts";

/** Invitation lifecycle: acceptance, revocation, competition, and stored settlement. */

export const invitations = (harness: Harness) => {
  const { core, initialized, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: invitations`, () => {
    it.effect(
      "members choose their names on creating, on joining, and later; replay keeps them",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(
              runGateway(
                storage,
                Effect.gen(function* () {
                  const workspace = yield* Operations.createWorkspace(
                    alice.id,
                    Member.Name.make("Alice Moreau"),
                  );
                  const bound = yield* boundTo(workspace.id);
                  expect(yield* bound.members.get(workspace.ownerMemberId)).toMatchObject({
                    _tag: "Some",
                    value: { name: "Alice Moreau" },
                  });
                  const invitation = yield* Operations.invite(
                    workspace.id,
                    alice,
                    request(yield* future),
                  );
                  const joined = yield* Operations.acceptInvitation(
                    workspace.id,
                    bob.id,
                    invitation.details.id,
                    Member.Name.make("Bob"),
                  );
                  expect(joined.name).toBe("Bob");
                  const renamed = yield* Operations.renameMember(
                    workspace.id,
                    bob,
                    Member.Name.make("Bob Chen"),
                  );
                  expect(renamed).toMatchObject({
                    id: joined.id,
                    identity: joined.identity,
                    name: "Bob Chen",
                    status: "active",
                  });
                  expect(yield* bound.members.get(joined.id)).toEqual(Option.some(renamed));
                  // The same name again records nothing; a name needs text without surrounding space.
                  const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 50 });
                  expect(
                    yield* Operations.renameMember(workspace.id, bob, Member.Name.make("Bob Chen")),
                  ).toEqual(renamed);
                  expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 50 })).toEqual(
                    before,
                  );
                  for (const name of ["", " Bob", "x".repeat(81)])
                    expect(
                      (yield* Effect.flip(
                        Operations.renameMember(workspace.id, bob, name as Member.Name),
                      ))._tag,
                    ).toMatch(/SchemaError|InvalidInput/);
                  return { workspaceId: workspace.id, members: yield* bound.members.list };
                }),
              ),
            );
            // Rebuilding from the journal keeps every name.
            yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const bound = yield* boundTo(saved.workspaceId);
                  yield* storage.discardProjections;
                  yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
                    Effect.provide(core(bound)),
                  );
                  expect(yield* bound.members.list).toEqual(saved.members);
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "owner invites a reader; concurrent repeat acceptance grants once and never reactivates removed membership",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            expectTypeOf<
              Effect.Services<ReturnType<InvitationApplication.Interface["accept"]>>
            >().toEqualTypeOf<never>();
            expectTypeOf<
              Effect.Services<ReturnType<InvitationApplication.Interface["issue"]>>
            >().toEqualTypeOf<Actor.Service>();
            yield* Effect.scoped(
              runGateway(
                storage,
                Effect.gen(function* () {
                  const workspace = yield* Operations.createWorkspace(alice.id);
                  const invitation = yield* Operations.invite(
                    workspace.id,
                    alice,
                    request(yield* future),
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
                  // A person joins the general group as they join the workspace, once.
                  expect(
                    (yield* bound.groupMemberships.listByGroup(Group.GeneralId)).filter(
                      (record) => record.memberId === first.id,
                    ),
                  ).toMatchObject([{ status: "active" }]);
                  expect(
                    (yield* Operations.getMember(workspace.id, bob, workspace.ownerMemberId))
                      .identity,
                  ).toEqual(alice);
                  expect(
                    yield* Effect.flip(
                      Operations.invite(workspace.id, bob, request(yield* future, charlie.id)),
                    ),
                  ).toMatchObject({ _tag: "Authorization.Denied" });
                  const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
                  expect(before).toHaveLength(3);
                  // The member, their role, the acceptance, and their admission to general.
                  expect(before[2]?.entries).toHaveLength(4);
                  yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
                  expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(
                    before,
                  );
                  yield* Operations.removeMember(workspace.id, alice, first.id);
                  expect(
                    (yield* Operations.acceptInvitation(
                      workspace.id,
                      bob.id,
                      invitation.details.id,
                    )).status,
                  ).toBe("removed");
                  expect(
                    yield* Effect.flip(
                      Operations.getMember(workspace.id, bob, workspace.ownerMemberId),
                    ),
                  ).toMatchObject({ _tag: "Gateway.NotMember" });
                  const freshInvite = yield* Operations.invite(workspace.id, alice, {
                    recipientId: bob.id,
                    expiresAt: yield* future,
                    roleId: BuiltinRoles.MemberId,
                  });
                  const rejoined = yield* Operations.acceptInvitation(
                    workspace.id,
                    bob.id,
                    freshInvite.details.id,
                  );
                  expect(rejoined.id).not.toBe(first.id);
                  expect(yield* bound.assignments.listActiveByMember(rejoined.id)).toHaveLength(1);
                  expect(
                    yield* Effect.flip(
                      Operations.removeMember(workspace.id, bob, workspace.ownerMemberId),
                    ),
                  ).toMatchObject({ _tag: "Authorization.Denied" });
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "revocation is persistent and idempotent; accepted invitations cannot be revoked",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(
              runGateway(
                storage,
                Effect.gen(function* () {
                  const workspace = yield* Operations.createWorkspace(alice.id);
                  const invitation = yield* Operations.invite(
                    workspace.id,
                    alice,
                    request(yield* future),
                  );
                  yield* Operations.revokeInvitation(workspace.id, alice, invitation.details.id);
                  const bound = yield* boundTo(workspace.id);
                  const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
                  yield* Operations.revokeInvitation(workspace.id, alice, invitation.details.id);
                  expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(
                    before,
                  );
                  return { workspace, invitation };
                }),
              ),
            );
            yield* Effect.scoped(
              runGateway(
                storage,
                Effect.gen(function* () {
                  expect(
                    yield* Effect.flip(
                      Operations.acceptInvitation(
                        saved.workspace.id,
                        bob.id,
                        saved.invitation.details.id,
                      ),
                    ),
                  ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "revoked" });
                  const replacement = yield* Operations.invite(
                    saved.workspace.id,
                    alice,
                    request(yield* future),
                  );
                  yield* Operations.acceptInvitation(
                    saved.workspace.id,
                    bob.id,
                    replacement.details.id,
                  );
                  expect(
                    yield* Effect.flip(
                      Operations.revokeInvitation(
                        saved.workspace.id,
                        alice,
                        replacement.details.id,
                      ),
                    ),
                  ).toMatchObject({
                    _tag: "InvitationApplication.Unavailable",
                    reason: "accepted",
                  });
                }),
              ),
            );
          }),
        ),
    );

    it.effect(
      "competing invitations cannot create two active memberships or combine their grants",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const workspace = yield* Operations.createWorkspace(alice.id);
              const a = yield* Operations.invite(workspace.id, alice, request(yield* future));
              const b = yield* Operations.invite(workspace.id, alice, request(yield* future));
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
          ),
        ),
    );

    it.effect("invitations keep their roles, instants, and terminal states across settlement", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const workspace = yield* initialized(bound);
            const issuedAt = yield* DateTime.now;
            const details = (id: string, roleId = BuiltinRoles.MemberId): Invitation.Issuance => ({
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
            const pending = (id: string, roleId = BuiltinRoles.MemberId): Invitation.Record => ({
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
            // A settled invitation stays settled, and an invitation ID is never reused.
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
              yield* Effect.flip(
                bound.store.transaction(bound.invitations.insert(pending("first"))),
              ),
            ).toMatchObject({ _tag: "InvitationStore.Conflict", operation: "insert" });
            expect(yield* bound.invitations.get(Invitation.Id.make("first"))).toEqual(
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
};
