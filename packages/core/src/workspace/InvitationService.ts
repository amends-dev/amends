/**
 * The operations on invitations: issuing, revoking, and listing them, which an actor calls, and
 * accepting one, which a person who is not yet a member calls through the gateway with their
 * authenticated human ID. Acceptance adds the member through `MemberCommand`, under the authority
 * of the member who issued the invitation, rechecked when it is accepted. Each write runs inside
 * one journal commit.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Authorization from "../authorization/Authorization.ts"
import * as Delegation from "../authorization/Delegation.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Identity from "../identity/Identity.ts"
import * as Performer from "../identity/Performer.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import * as Invitation from "./Invitation.ts"
import * as InvitationFacts from "./InvitationFacts.ts"
import * as InvitationPermissions from "./InvitationPermissions.ts"
import * as InvitationStore from "./InvitationStore.ts"
import * as Member from "./Member.ts"
import * as MemberCommand from "./MemberCommand.ts"
import * as MemberStore from "./MemberStore.ts"
import * as WorkspaceId from "./WorkspaceId.ts"

/**
 * What the invitation operations can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * The invitation operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class InvitationService extends Context.Service<
  InvitationService,
  {
    /**
     * Invite a person who is not an active member, under `invitation.manage` and the authority to
     * delegate the role (`Delegation.requireGrant`); the expiry must be after now. Within a request,
     * a retry returns the invitation its first attempt issued, as it stands now.
     */
    readonly issue: (request: Invitation.IssueInput) => Effect.Effect<Invitation.Invitation, Error, Actor.Actor>
    /**
     * Accept an invitation as the person it names, with the name the workspace will call them.
     * Trusted ingress supplies the authenticated recipient; no membership is required yet. A
     * pending, unexpired invitation to someone not already a member is accepted when its inviter is
     * still a member with the authority to issue it; then one commit adds the member with the
     * invitation's role and general-group admission, and records the acceptance. Accepting again
     * returns the member it made, even one removed since, and grants nothing.
     */
    readonly accept: (
      id: Invitation.InvitationId,
      recipient: Identity.HumanId,
      name: Member.Name
    ) => Effect.Effect<Member.Member, Error>
    /**
     * Revoke a pending invitation, expired or not, under the same authority issuing it needs.
     * Revoking again returns it unchanged; an accepted invitation is `Unavailable`, since removal
     * is what ends that membership.
     */
    readonly revoke: (id: Invitation.InvitationId) => Effect.Effect<Invitation.Invitation, Error, Actor.Actor>
    /**
     * Every invitation in the workspace in issue order, whatever its state; requires
     * `invitation.manage`.
     */
    readonly list: Effect.Effect<ReadonlyArray<Invitation.Invitation>, Error, Actor.Actor>
  }
>()("@amends-dev/core/workspace/InvitationService") {}

/**
 * Construct invitation operations from workspace services; read the actor during protected calls.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make: Effect.Effect<
  InvitationService["Service"],
  never,
  | InvitationStore.InvitationStore
  | MemberStore.MemberStore
  | Authorization.Authorization
  | Delegation.Delegation
  | MemberCommand.MemberCommand
  | Journal.Journal
  | Crypto.Crypto
  | WorkspaceId.CurrentWorkspaceId
> = Effect.gen(function* () {
  const invitationStore = yield* InvitationStore.InvitationStore
  const memberStore = yield* MemberStore.MemberStore
  const authorization = yield* Authorization.Authorization
  const delegation = yield* Delegation.Delegation
  const memberCommand = yield* MemberCommand.MemberCommand
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId
  const manage = Requirement.make(InvitationPermissions.Manage, Target.Reference.cases.Workspace.make({ workspaceId }))

  const authorizeInvitation = Effect.fn("InvitationService.authorizeInvitation")(function* (
    input: Invitation.IssueInput
  ) {
    yield* authorization.require([manage])
    yield* delegation.requireGrant(input.roleId)
    return yield* Actor.Actor
  })
  const requireInvitation = Effect.fnUntraced(function* (id: Invitation.InvitationId) {
    const validId = yield* Schema.decodeEffect(Invitation.InvitationId)(id)
    const found = yield* invitationStore.get(validId)
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "Invitation", id })
    return found.value
  })
  const requireUnjoined = Effect.fnUntraced(function* (recipientId: Identity.HumanId) {
    if (Option.isSome(yield* memberStore.findActive(Identity.Reference.cases.Human.make({ id: recipientId }))))
      return yield* new CoreError.Conflict({
        reason: new CoreError.AlreadyJoined({ recipientId })
      })
  })

  const issue = Effect.fn("InvitationService.issue")(
    function* (input: Invitation.IssueInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Invitation.IssueInput))(input)
      const actor = yield* authorizeInvitation(request)
      const invitationId = yield* Invitation.newId
      // A retry returns the invitation its first attempt issued, as it stands now.
      if (Option.isSome(yield* invitationStore.get(invitationId))) return yield* requireInvitation(invitationId)
      const issuedAt = yield* DateTime.now
      if (!DateTime.isGreaterThan(request.expiresAt, issuedAt))
        return yield* new CoreError.Invalid({ reason: new CoreError.PastExpiry() })
      yield* requireUnjoined(request.recipientId)
      const details: Invitation.Issuance = {
        id: invitationId,
        workspaceId,
        inviterMemberId: actor.memberId,
        issuedAt,
        expiresAt: request.expiresAt,
        recipientId: request.recipientId,
        roleId: request.roleId
      }
      yield* journal.publish(InvitationFacts.Issued, details).pipe(Publication.withOccurredAt(issuedAt))
      return { details, state: Invitation.State.cases.Pending.make({}) } satisfies Invitation.Invitation
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const accept = Effect.fn("InvitationService.accept")(
    function* (id: Invitation.InvitationId, authenticated: Identity.HumanId, chosenName: Member.Name) {
      const recipient = yield* Schema.decodeEffect(Identity.HumanId)(authenticated)
      const name = yield* Schema.decodeEffect(Member.NewName)(chosenName)
      const invitation = yield* requireInvitation(id)
      const { details, state } = invitation
      if (details.recipientId !== recipient)
        return yield* new CoreError.Denied({
          reason: new CoreError.NotRecipient({ invitationId: id })
        })
      // Repeated acceptance returns the original receipt, without restoring grants
      // or reactivating a membership that has since been removed.
      if (Invitation.State.isAnyOf(["Accepted"])(state)) {
        const member = yield* memberStore.get(state.memberId)
        if (Option.isNone(member)) return yield* Effect.die("An accepted invitation's member is missing")
        return member.value
      }
      if (Invitation.State.isAnyOf(["Revoked"])(state))
        return yield* new CoreError.Conflict({
          reason: new CoreError.InvitationClosed({ invitationId: id, reason: "revoked" })
        })
      const acceptedAt = yield* DateTime.now
      if (!DateTime.isGreaterThan(details.expiresAt, acceptedAt))
        return yield* new CoreError.Conflict({
          reason: new CoreError.InvitationClosed({ invitationId: id, reason: "expired" })
        })
      yield* requireUnjoined(recipient)
      const inviter = yield* memberStore.get(details.inviterMemberId)
      if (Option.isNone(inviter))
        return yield* new CoreError.Denied({
          reason: new CoreError.InvalidActor({
            memberId: details.inviterMemberId,
            reason: "membership-missing"
          })
        })
      // Only this authority check uses the recorded inviter, never recipient input.
      yield* authorizeInvitation(details).pipe(
        Effect.provideService(Actor.Actor, {
          workspaceId,
          memberId: details.inviterMemberId,
          identity: inviter.value.identity
        })
      )
      const identity = Identity.MemberReference.cases.Human.make({ id: recipient })
      const provenance = yield* Publication.make(
        workspaceId,
        Performer.Reference.cases.Identity.make({ identity }),
        acceptedAt
      ).pipe(Effect.provideService(Crypto.Crypto, crypto))
      return yield* Effect.gen(function* () {
        const member = yield* memberCommand.add({
          identity,
          name,
          roleId: details.roleId,
          joinedAt: acceptedAt
        })
        yield* journal.publish(InvitationFacts.Accepted, {
          workspaceId,
          invitationId: id,
          ...Invitation.State.cases.Accepted.make({ memberId: member.id, acceptedAt })
        })
        return member
      }).pipe(Effect.provideService(Publication.Publication, provenance))
    },
    journal.commit,
    Operation.report
  )

  const revoke = Effect.fn("InvitationService.revoke")(
    function* (id: Invitation.InvitationId) {
      // Managing invitations is checked first, so a caller who may not learns nothing of this one.
      yield* authorization.require([manage])
      const invitation = yield* requireInvitation(id)
      yield* delegation.requireGrant(invitation.details.roleId)
      const actor = yield* Actor.Actor
      if (Invitation.State.isAnyOf(["Revoked"])(invitation.state)) return invitation
      if (Invitation.State.isAnyOf(["Accepted"])(invitation.state))
        return yield* new CoreError.Conflict({
          reason: new CoreError.InvitationClosed({ invitationId: id, reason: "accepted" })
        })
      const state = Invitation.State.cases.Revoked.make({
        revokedBy: actor.memberId,
        revokedAt: yield* DateTime.now
      })
      yield* journal
        .publish(InvitationFacts.Revoked, { workspaceId, invitationId: id, ...state })
        .pipe(Publication.withOccurredAt(state.revokedAt))
      return { details: invitation.details, state } satisfies Invitation.Invitation
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const list = Effect.gen(function* () {
    yield* authorization.require([manage])
    return yield* invitationStore.list
  }).pipe(Effect.withSpan("InvitationService.list"), Operation.report)

  return InvitationService.of({ issue, accept, revoke, list })
})

/**
 * Provide invitation operations over the caller's workspace services and cryptography.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(InvitationService, make)
