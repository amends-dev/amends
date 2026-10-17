import { AssignmentFacts, BuiltinRoles, Role, Assignment } from "@amends-dev/core/authorization"
import { Journal, Publication } from "@amends-dev/core/journal"
import { MemberFacts, MemberId } from "@amends-dev/core/workspace"
import { Entry } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option } from "effect"
import { withStorage } from "./fixture.ts"
import * as Operations from "./operations.ts"
import * as Support from "./support.ts"
import { alice, at, bob, boundTo, charlie, future, request, testProvenance } from "./support.ts"

/** Who may invite whom, with which role, until when, and rechecks at acceptance. */

const { core, runGateway } = Support
describe("invitation policy", () => {
  it.effect("recipient identity and workspace binding protect pending and accepted invitations", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const a = yield* Operations.createWorkspace(alice.id)
          const b = yield* Operations.createWorkspace(charlie.id)
          const invitation = yield* Operations.invite(a.id, alice, request(yield* future))
          const bound = yield* boundTo(a.id)
          const before = yield* bound.store.read(Entry.LogId.make("journal"), { limit: 20 })
          expect(
            yield* Effect.flip(Operations.acceptInvitation(a.id, charlie.id, invitation.details.id))
          ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotRecipient" } })
          expect(yield* Effect.flip(Operations.acceptInvitation(b.id, bob.id, invitation.details.id))).toMatchObject({
            _tag: "CoreError.NotFound"
          })
          expect(yield* bound.store.read(Entry.LogId.make("journal"), { limit: 20 })).toEqual(before)
          yield* Operations.acceptInvitation(a.id, bob.id, invitation.details.id)
          expect(
            yield* Effect.flip(Operations.acceptInvitation(a.id, charlie.id, invitation.details.id))
          ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotRecipient" } })
          expect(yield* (yield* boundTo(b.id)).members.findActive(bob)).toEqual(Option.none())
        })
      )
    )
  )

  it.effect("expiry is checked against the operation clock, including the exact deadline", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id)
          const now = yield* DateTime.now
          const expiresAt = DateTime.add(now, { seconds: 30 })
          expect(yield* at(now, Effect.flip(Operations.invite(workspace.id, alice, request(now))))).toMatchObject({
            _tag: "CoreError.Invalid",
            reason: { _tag: "PastExpiry" }
          })
          const invitation = yield* at(now, Operations.invite(workspace.id, alice, request(expiresAt)))
          expect(
            yield* at(expiresAt, Effect.flip(Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id)))
          ).toMatchObject({
            _tag: "CoreError.Conflict",
            reason: { _tag: "InvitationClosed", reason: "expired" }
          })
          expect(yield* (yield* boundTo(workspace.id)).members.findActive(bob)).toEqual(Option.none())
          const revoked = yield* at(expiresAt, Operations.revokeInvitation(workspace.id, alice, invitation.details.id))
          expect(revoked.state._tag).toBe("Revoked")
        })
      )
    )
  )

  it.effect("administrators can invite viewers but cannot invite administrators or owners", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id)
          const invitation = yield* Operations.invite(workspace.id, alice, {
            recipientId: bob.id,
            expiresAt: yield* future,
            roleId: BuiltinRoles.AdministratorId
          })
          yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id)
          expect(
            yield* Effect.flip(
              Operations.invite(workspace.id, bob, request(yield* future, charlie.id, BuiltinRoles.AdministratorId))
            )
          ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "OwnerRequired" } })
          yield* Operations.invite(workspace.id, bob, request(yield* future, charlie.id))
          expect(
            yield* Effect.flip(
              Operations.invite(workspace.id, bob, request(yield* future, charlie.id, BuiltinRoles.OwnerId))
            )
          ).toMatchObject({ _tag: "CoreError.Conflict", reason: { _tag: "OwnerProtected" } })
        })
      )
    )
  )

  it.effect("acceptance rechecks original inviter's permission, membership, and ownership", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          for (const change of ["permission", "membership", "ownership"] as const) {
            const workspace = yield* Operations.createWorkspace(alice.id)
            const invitation = yield* Operations.invite(
              workspace.id,
              alice,
              request(yield* future, bob.id, BuiltinRoles.AdministratorId)
            )
            const bound = yield* boundTo(workspace.id)
            if (change === "permission") {
              const assignment = (yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).find(
                ({ source }) => Assignment.Source.isAnyOf(["Role"])(source) && source.roleId === BuiltinRoles.OwnerId
              )
              if (assignment === undefined) throw new Error("Missing Owner assignment")
              yield* Effect.flatMap(Journal.Journal, (journal) =>
                journal
                  .publish(AssignmentFacts.Revoked, {
                    workspaceId: workspace.id,
                    assignmentId: assignment.id,
                    memberId: assignment.memberId
                  })
                  .pipe(Effect.provideService(Publication.Publication, testProvenance(workspace.id)))
              ).pipe(Effect.provide(core(bound)))
            } else if (change === "membership") {
              yield* Effect.flatMap(Journal.Journal, (journal) =>
                journal
                  .publish(MemberFacts.Removed, {
                    workspaceId: workspace.id,
                    memberId: workspace.ownerMemberId
                  })
                  .pipe(Effect.provideService(Publication.Publication, testProvenance(workspace.id)))
              ).pipe(Effect.provide(core(bound)))
            } else {
              // Only the stored owner changes; the inviter keeps their membership and grants.
              yield* bound.store.transaction(
                bound.workspace.transferOwnership({
                  workspaceId: workspace.id,
                  previousOwnerMemberId: workspace.ownerMemberId,
                  ownerMemberId: MemberId.MemberId.make("successor")
                })
              )
            }
            const failure = yield* Effect.flip(Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id))
            expect(failure._tag).toBe(
              change === "permission"
                ? "CoreError.Denied"
                : change === "membership"
                  ? "CoreError.Denied"
                  : "CoreError.Denied"
            )
            expect(yield* bound.members.findActive(bob)).toEqual(Option.none())
            expect(yield* bound.invitations.get(invitation.details.id)).toMatchObject({
              _tag: "Some",
              value: { state: { _tag: "Pending" } }
            })
          }
        })
      )
    )
  )

  it.effect("unsupported and Owner roles never publish an invitation", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const workspace = yield* Operations.createWorkspace(alice.id)
          const bound = yield* boundTo(workspace.id)
          const before = yield* bound.store.read(Entry.LogId.make("journal"), { limit: 20 })
          for (const roleId of [Role.RoleId.make("unknown"), BuiltinRoles.OwnerId]) {
            yield* Effect.flip(Operations.invite(workspace.id, alice, request(yield* future, bob.id, roleId)))
            expect(yield* bound.store.read(Entry.LogId.make("journal"), { limit: 20 })).toEqual(before)
          }
          expect(
            yield* Effect.flip(Operations.invite(workspace.id, alice, request(yield* future, alice.id)))
          ).toMatchObject({ _tag: "CoreError.Conflict", reason: { _tag: "AlreadyJoined" } })
        })
      )
    )
  )
})
