import { AssignmentFacts, BuiltinRoles, Role, Assignment } from "@amends-dev/core/authorization";
import { Journal, Log, Publication } from "@amends-dev/core/journal";
import { Member, MemberFacts } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import type { Harness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  at,
  bob,
  boundTo,
  charlie,
  future,
  request,
  Support,
  testProvenance,
} from "./support.ts";

/** Who may invite whom, with which role, until when, and rechecks at acceptance. */

export const invitationPolicy = (harness: Harness) => {
  const { core, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: invitation policy`, () => {
    it.effect(
      "recipient identity and workspace binding protect pending and accepted invitations",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const a = yield* Operations.createWorkspace(alice.id);
              const b = yield* Operations.createWorkspace(charlie.id);
              const invitation = yield* Operations.invite(a.id, alice, request(yield* future));
              const bound = yield* boundTo(a.id);
              const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
              expect(
                yield* Effect.flip(
                  Operations.acceptInvitation(a.id, charlie.id, invitation.details.id),
                ),
              ).toMatchObject({ _tag: "InvitationService.NotRecipient" });
              expect(
                yield* Effect.flip(
                  Operations.acceptInvitation(b.id, bob.id, invitation.details.id),
                ),
              ).toMatchObject({ _tag: "InvitationService.NotFound" });
              expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(
                before,
              );
              yield* Operations.acceptInvitation(a.id, bob.id, invitation.details.id);
              expect(
                yield* Effect.flip(
                  Operations.acceptInvitation(a.id, charlie.id, invitation.details.id),
                ),
              ).toMatchObject({ _tag: "InvitationService.NotRecipient" });
              expect(yield* (yield* boundTo(b.id)).members.findActive(bob)).toEqual(Option.none());
            }),
          ),
        ),
    );

    it.effect("expiry is checked against the operation clock, including the exact deadline", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const now = yield* DateTime.now;
            const expiresAt = DateTime.add(now, { seconds: 30 });
            expect(
              yield* at(now, Effect.flip(Operations.invite(workspace.id, alice, request(now)))),
            ).toMatchObject({ _tag: "InvitationService.InvalidExpiry" });
            const invitation = yield* at(
              now,
              Operations.invite(workspace.id, alice, request(expiresAt)),
            );
            expect(
              yield* at(
                expiresAt,
                Effect.flip(
                  Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id),
                ),
              ),
            ).toMatchObject({ _tag: "InvitationService.Unavailable", reason: "expired" });
            expect(yield* (yield* boundTo(workspace.id)).members.findActive(bob)).toEqual(
              Option.none(),
            );
            const revoked = yield* at(
              expiresAt,
              Operations.revokeInvitation(workspace.id, alice, invitation.details.id),
            );
            expect(revoked.state._tag).toBe("Revoked");
          }),
        ),
      ),
    );

    it.effect("administrators can invite viewers but cannot invite administrators or owners", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const invitation = yield* Operations.invite(workspace.id, alice, {
              recipientId: bob.id,
              expiresAt: yield* future,
              roleId: BuiltinRoles.AdministratorId,
            });
            yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
            expect(
              yield* Effect.flip(
                Operations.invite(
                  workspace.id,
                  bob,
                  request(yield* future, charlie.id, BuiltinRoles.AdministratorId),
                ),
              ),
            ).toMatchObject({ _tag: "Delegation.Denied" });
            yield* Operations.invite(workspace.id, bob, request(yield* future, charlie.id));
            expect(
              yield* Effect.flip(
                Operations.invite(
                  workspace.id,
                  bob,
                  request(yield* future, charlie.id, BuiltinRoles.OwnerId),
                ),
              ),
            ).toMatchObject({ _tag: "Delegation.OwnerProtected" });
          }),
        ),
      ),
    );

    it.effect("acceptance rechecks original inviter's permission, membership, and ownership", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            for (const change of ["permission", "membership", "ownership"] as const) {
              const workspace = yield* Operations.createWorkspace(alice.id);
              const invitation = yield* Operations.invite(
                workspace.id,
                alice,
                request(yield* future, bob.id, BuiltinRoles.AdministratorId),
              );
              const bound = yield* boundTo(workspace.id);
              if (change === "permission") {
                const assignment = (yield* bound.assignments.listActiveByMember(
                  workspace.ownerMemberId,
                )).find(
                  ({ source }) =>
                    Assignment.Source.isAnyOf(["Role"])(source) &&
                    source.roleId === BuiltinRoles.OwnerId,
                );
                if (assignment === undefined) throw new Error("Missing Owner assignment");
                yield* Effect.flatMap(Journal.Service, (journal) =>
                  journal
                    .publish(AssignmentFacts.Revoked, {
                      workspaceId: workspace.id,
                      assignmentId: assignment.id,
                      memberId: assignment.memberId,
                    })
                    .pipe(Effect.provideService(Publication.Service, testProvenance(workspace.id))),
                ).pipe(Effect.provide(core(bound)));
              } else if (change === "membership") {
                yield* Effect.flatMap(Journal.Service, (journal) =>
                  journal
                    .publish(MemberFacts.Removed, {
                      workspaceId: workspace.id,
                      memberId: workspace.ownerMemberId,
                    })
                    .pipe(Effect.provideService(Publication.Service, testProvenance(workspace.id))),
                ).pipe(Effect.provide(core(bound)));
              } else {
                // Only the stored owner changes; the inviter keeps their membership and grants.
                yield* bound.store.transaction(
                  bound.workspace.transferOwnership({
                    workspaceId: workspace.id,
                    previousOwnerMemberId: workspace.ownerMemberId,
                    ownerMemberId: Member.Id.make("successor"),
                  }),
                );
              }
              const failure = yield* Effect.flip(
                Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id),
              );
              expect(failure._tag).toBe(
                change === "permission"
                  ? "Authorization.Denied"
                  : change === "membership"
                    ? "Authorization.InvalidActor"
                    : "Delegation.Denied",
              );
              expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
              expect(yield* bound.invitations.get(invitation.details.id)).toMatchObject({
                _tag: "Some",
                value: { state: { _tag: "Pending" } },
              });
            }
          }),
        ),
      ),
    );

    it.effect("unsupported and Owner roles never publish an invitation", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const bound = yield* boundTo(workspace.id);
            const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
            for (const roleId of [Role.Id.make("unknown"), BuiltinRoles.OwnerId]) {
              yield* Effect.flip(
                Operations.invite(workspace.id, alice, request(yield* future, bob.id, roleId)),
              );
              expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(
                before,
              );
            }
            expect(
              yield* Effect.flip(
                Operations.invite(workspace.id, alice, request(yield* future, alice.id)),
              ),
            ).toMatchObject({ _tag: "InvitationService.AlreadyMember" });
          }),
        ),
      ),
    );
  });
};
