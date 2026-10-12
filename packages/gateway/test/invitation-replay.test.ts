import { AssignmentFacts, BuiltinRoles, Assignment } from "@amends-dev/core/authorization";

import { Actor, Identity } from "@amends-dev/core/identity";

import { Journal, Publication, Store } from "@amends-dev/core/journal";

import { InvitationService, Member, MemberService } from "@amends-dev/core/workspace";

import { describe, expect, it } from "@effect/vitest";

import { DateTime, Effect, Option, Result } from "effect";

import { withStorage } from "./fixture.ts";
import * as Operations from "./operations.ts";

import * as Support from "./support.ts";
import {
  alice,
  at,
  bob,
  boundTo,
  charlie,
  failingLate,
  future,
  journalLog,
  request,
  testProvenance,
} from "./support.ts";

/** Acceptance and removal roll back together, and replay restores invitation records. */

const { core, runGateway } = Support;
describe("invitation replay", () => {
  it.effect(
    "a late acceptance failure rolls back membership, assignments, consumption, and journal together",
    () =>
      withStorage((storage) =>
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
            const before = yield* bound.store.read(journalLog, { limit: 20 });
            const footprint = yield* storage.footprint;
            const error = new Store.Failure({
              operation: "commit",
              cause: "injected late failure",
            });
            const broken = failingLate(bound, error);
            const failure = yield* Effect.flatMap(
              InvitationService.InvitationService,
              (invitationService) =>
                invitationService.accept(invitation.details.id, bob.id, Member.Name.make("bob")),
            ).pipe(Effect.provide(core(broken)), Effect.flip);
            expect(failure).toBe(error);
            expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
            expect(yield* bound.invitations.get(invitation.details.id)).toMatchObject({
              _tag: "Some",
              value: { state: { _tag: "Pending" } },
            });
            expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
            expect(yield* storage.footprint).toBe(footprint);
            yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
          }),
        ),
      ),
  );

  it.effect(
    "removal and pending invitation revocation roll back together, commit once, and replay within their workspace",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const other = yield* Operations.createWorkspace(alice.id);
            const otherInvite = yield* Operations.invite(other.id, alice, request(yield* future));
            const otherPending = yield* Operations.invite(other.id, alice, request(yield* future));
            yield* Operations.acceptInvitation(other.id, bob.id, otherInvite.details.id);
            const invitation = yield* Operations.invite(
              workspace.id,
              alice,
              request(yield* future),
            );
            const expiresAt = yield* future;
            const pending = yield* Effect.forEach([1, 2], () =>
              Operations.invite(workspace.id, alice, request(expiresAt)),
            );
            const unrelated = yield* Operations.invite(
              workspace.id,
              alice,
              request(yield* future, charlie.id),
            );
            const member = yield* Operations.acceptInvitation(
              workspace.id,
              bob.id,
              invitation.details.id,
            );
            const bound = yield* boundTo(workspace.id);
            const before = yield* bound.store.read(journalLog, { limit: 20 });
            const live = yield* bound.checkpoints.listLive(journalLog);
            const grants = yield* bound.assignments.listActiveByMember(member.id);
            const error = new Store.Failure({
              operation: "commit",
              cause: "injected late failure",
            });
            const broken = failingLate(bound, error);
            const failure = yield* Effect.flatMap(MemberService.MemberService, (memberService) =>
              memberService.remove(member.id),
            ).pipe(
              Effect.provide(core(broken)),
              Effect.provideService(Actor.Actor, {
                workspaceId: workspace.id,
                memberId: workspace.ownerMemberId,
                identity: alice,
              }),
              Effect.flip,
            );
            expect(failure).toBe(error);
            expect(yield* Operations.getMember(workspace.id, bob, member.id)).toEqual(member);
            expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
            for (const record of pending)
              expect(yield* bound.invitations.get(record.details.id)).toEqual(Option.some(record));
            expect(yield* bound.checkpoints.listLive(journalLog)).toEqual(live);
            // A member ID from another workspace cannot be addressed through this context.
            expect(
              yield* Effect.flip(Operations.removeMember(workspace.id, alice, other.ownerMemberId)),
            ).toMatchObject({ _tag: "CoreError.NotFound" });
            const results = yield* Effect.forEach(
              [1, 2],
              () => Operations.removeMember(workspace.id, alice, member.id).pipe(Effect.result),
              { concurrency: "unbounded" },
            );
            expect(results.filter((result) => Result.isSuccess(result))).toHaveLength(1);
            expect(results.find((result) => Result.isFailure(result))).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "MemberService.AlreadyRemoved" },
            });
            const after = yield* bound.store.read(journalLog, { limit: 20 });
            expect(after).toHaveLength(before.length + 1);
            // The removal, the member's departure from the general group, and two revocations.
            expect(after.at(-1)?.entries).toHaveLength(4);
            for (const record of pending) {
              expect(yield* bound.invitations.get(record.details.id)).toMatchObject({
                _tag: "Some",
                value: { state: { _tag: "Revoked", revokedBy: workspace.ownerMemberId } },
              });
              expect(
                yield* Effect.flip(
                  Operations.acceptInvitation(workspace.id, bob.id, record.details.id),
                ),
              ).toMatchObject({
                _tag: "InvitationService.Unavailable",
                reason: "revoked",
              });
            }
            expect(yield* bound.invitations.get(unrelated.details.id)).toEqual(
              Option.some(unrelated),
            );
            expect(
              yield* (yield* boundTo(other.id)).invitations.get(otherPending.details.id),
            ).toEqual(Option.some(otherPending));
            expect(yield* bound.assignments.listActiveByMember(member.id)).toEqual(grants);
            expect(
              yield* Effect.flip(Operations.getMember(workspace.id, bob, member.id)),
            ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotMember" } });
            expect((yield* Operations.getMember(other.id, bob, other.ownerMemberId)).status).toBe(
              "active",
            );
            // Rebuild the read models from the recorded outcomes.
            yield* storage.discardProjections;
            yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
              Effect.provide(core(bound)),
            );
            expect(yield* Operations.getMember(workspace.id, alice, member.id)).toMatchObject({
              id: member.id,
              status: "removed",
            });
            expect(
              yield* Effect.flip(Operations.getMember(workspace.id, bob, member.id)),
            ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotMember" } });
            expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(after);
            for (const record of pending)
              expect(
                yield* Effect.flip(
                  Operations.acceptInvitation(workspace.id, bob.id, record.details.id),
                ),
              ).toMatchObject({
                _tag: "InvitationService.Unavailable",
                reason: "revoked",
              });
          }),
        ),
      ),
  );

  it.effect(
    "invitation replay restores pending, accepted, and revoked records without rechecking time or authority",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* Operations.createWorkspace(alice.id);
            const expiresAt = yield* future;
            const accepted = yield* Operations.invite(workspace.id, alice, request(expiresAt));
            const member = yield* Operations.acceptInvitation(
              workspace.id,
              bob.id,
              accepted.details.id,
            );
            const revoked = yield* Operations.invite(
              workspace.id,
              alice,
              request(expiresAt, charlie.id),
            );
            yield* Operations.revokeInvitation(workspace.id, alice, revoked.details.id);
            const pending = yield* Operations.invite(
              workspace.id,
              alice,
              request(expiresAt, Identity.HumanId.make("pending")),
            );
            const bound = yield* boundTo(workspace.id);
            const records = yield* Effect.forEach([accepted, revoked, pending], (invitation) =>
              bound.invitations.get(invitation.details.id),
            );
            const assignment = (yield* bound.assignments.listActiveByMember(
              workspace.ownerMemberId,
            )).find(
              ({ source }) =>
                Assignment.Source.isAnyOf(["Role"])(source) &&
                source.roleId === BuiltinRoles.OwnerId,
            );
            if (assignment === undefined) throw new Error("Missing Owner assignment");
            yield* Effect.flatMap(Journal.Journal, (journal) =>
              journal
                .publish(AssignmentFacts.Revoked, {
                  workspaceId: workspace.id,
                  assignmentId: assignment.id,
                  memberId: assignment.memberId,
                })
                .pipe(Effect.provideService(Publication.Publication, testProvenance(workspace.id))),
            ).pipe(Effect.provide(core(bound)));
            const before = yield* bound.store.read(journalLog, { limit: 20 });
            yield* storage.discardProjections;
            yield* at(
              DateTime.add(expiresAt, { days: 1 }),
              Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
                Effect.provide(core(bound)),
              ),
            );
            expect(
              yield* Effect.forEach([accepted, revoked, pending], (invitation) =>
                bound.invitations.get(invitation.details.id),
              ),
            ).toEqual(records);
            expect(yield* bound.members.get(member.id)).toEqual(Option.some(member));
            expect(yield* bound.assignments.listActiveByMember(member.id)).toHaveLength(1);
            expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
            expect(
              yield* at(
                DateTime.add(expiresAt, { days: 1 }),
                Operations.acceptInvitation(workspace.id, bob.id, accepted.details.id),
              ),
            ).toEqual(member);
          }),
        ),
      ),
  );
});
