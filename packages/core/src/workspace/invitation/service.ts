import * as Request from "../../request/request.ts";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";

import * as Authorization from "../../authorization/authorization.ts";
import * as Delegation from "../../authorization/delegation.ts";
import * as Requirement from "../../authorization/requirement.ts";
import * as Target from "../../authorization/target.ts";
import * as Actor from "../../identity/actor.ts";
import * as Identity from "../../identity/identity.ts";
import * as Journal from "../../journal/journal.ts";
import * as Publication from "../../journal/publication.ts";
import type * as Log from "../../journal/log.ts";
import type * as Projection from "../../journal/projection.ts";
import * as Store from "../../journal/store.ts";
import * as Invitation from "./invitation.ts";
import * as InvitationFacts from "./facts.ts";
import * as InvitationPermissions from "./permissions.ts";
import * as InvitationStore from "./store.ts";
import * as Member from "../member/member.ts";
import * as MemberCommand from "../member/command.ts";
import * as MemberStore from "../member/store.ts";
import { AlreadyMember, InvalidExpiry, NotFound, NotRecipient, Unavailable } from "./errors.ts";
export { AlreadyMember, InvalidExpiry, NotFound, NotRecipient, Unavailable } from "./errors.ts";

export type Error =
  | Authorization.Error
  | Delegation.Error
  | Projection.Error
  | Log.WriteError
  | PlatformError.PlatformError
  | InvitationStore.Failure
  | MemberStore.Failure
  | MemberCommand.Error
  | NotFound
  | NotRecipient
  | AlreadyMember
  | Unavailable
  | InvalidExpiry;

/**
 * What a keyed issuance created, so that a retry returns it.
 */
export class InvitationService extends Context.Service<
  InvitationService,
  {
    readonly issue: (
      request: Invitation.IssueInput,
      options?: Request.Options,
    ) => Effect.Effect<Invitation.Record, Error, Actor.Actor>;
    /**
     * Trusted ingress supplies the authenticated recipient; no membership is required yet. The
     * recipient says what people in the workspace call them.
     */
    readonly accept: (
      id: Invitation.Id,
      recipient: Identity.HumanId,
      name: Member.Name,
    ) => Effect.Effect<Member.Record, Error>;
    readonly revoke: (id: Invitation.Id) => Effect.Effect<Invitation.Record, Error, Actor.Actor>;
    /** Every invitation in the workspace in issue order; requires invitation.manage. */
    readonly list: Effect.Effect<ReadonlyArray<Invitation.Record>, Error, Actor.Actor>;
  }
>()("@amends-dev/core/workspace/invitation-application/Service") {}

/**
 * Construct invitation operations from workspace services; read the actor during protected calls.
 *
 * @category constructors
 */
export const make = Effect.fn("InvitationService.make")(function* (): Effect.fn.Return<
  InvitationService["Service"],
  never,
  | InvitationStore.InvitationStore
  | MemberStore.MemberStore
  | Authorization.Authorization
  | Delegation.Delegation
  | MemberCommand.MemberCommand
  | Journal.Journal
  | Crypto.Crypto
  | Store.Store
> {
  const invitationStore = yield* InvitationStore.InvitationStore;
  const memberStore = yield* MemberStore.MemberStore;
  const authorization = yield* Authorization.Authorization;
  const delegation = yield* Delegation.Delegation;
  const memberCommand = yield* MemberCommand.MemberCommand;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;
  const manage = Requirement.make(
    InvitationPermissions.Manage,
    Target.Reference.cases.Workspace.make({ workspaceId }),
  );

  const authorizeInvitation = Effect.fn("InvitationService.authorizeInvitation")(function* (
    input: Invitation.IssueInput,
  ) {
    yield* authorization.require([manage]);
    yield* delegation.requireGrant(input.roleId);
    return yield* Actor.Actor;
  });
  const requireInvitation = Effect.fnUntraced(function* (id: Invitation.Id) {
    const validId = yield* Schema.decodeEffect(Invitation.Id)(id);
    const found = yield* invitationStore.get(validId);
    if (Option.isNone(found)) return yield* new NotFound({ invitationId: id });
    return found.value;
  });
  const requireUnjoined = Effect.fnUntraced(function* (recipientId: Identity.HumanId) {
    if (
      Option.isSome(
        yield* memberStore.findActive(Identity.Reference.cases.Human.make({ id: recipientId })),
      )
    )
      return yield* new AlreadyMember({ recipientId });
  });

  const issue = Effect.fn("InvitationService.issue")(
    function* (input: Invitation.IssueInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Invitation.IssueInput))(input);
      const actor = yield* authorizeInvitation(request);
      const invitationId = Invitation.Id.make(
        yield* Request.idFor(options.requestKey, ["invitation.issue", workspaceId, actor.memberId]),
      );
      // A retry returns the invitation its first attempt issued, as it stands now.
      if (
        options.requestKey !== undefined &&
        Option.isSome(yield* invitationStore.get(invitationId))
      )
        return yield* requireInvitation(invitationId);
      const issuedAt = yield* DateTime.now;
      if (!DateTime.isGreaterThan(request.expiresAt, issuedAt)) return yield* new InvalidExpiry({});
      yield* requireUnjoined(request.recipientId);
      const details: Invitation.Issuance = {
        id: invitationId,
        workspaceId,
        inviterMemberId: actor.memberId,
        issuedAt,
        expiresAt: request.expiresAt,
        recipientId: request.recipientId,
        roleId: request.roleId,
      };
      yield* journal
        .publish(InvitationFacts.Issued, details)
        .pipe(Publication.withOccurredAt(issuedAt));
      return { details, state: { _tag: "Pending" } } satisfies Invitation.Record;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const accept = Effect.fn("InvitationService.accept")(function* (
    id: Invitation.Id,
    authenticated: Identity.HumanId,
    chosenName: Member.Name,
  ) {
    const recipient = yield* Schema.decodeEffect(Identity.HumanId)(authenticated);
    const name = yield* Schema.decodeEffect(Member.NewName)(chosenName);
    const invitation = yield* requireInvitation(id);
    const { details, state } = invitation;
    if (details.recipientId !== recipient) return yield* new NotRecipient({ invitationId: id });
    // Repeated acceptance returns the original receipt, without restoring grants
    // or reactivating a membership that has since been removed.
    if (Invitation.State.isAnyOf(["Accepted"])(state)) {
      const member = yield* memberStore.get(state.memberId);
      if (Option.isNone(member))
        return yield* Effect.die("An accepted invitation's member is missing");
      return member.value;
    }
    if (Invitation.State.isAnyOf(["Revoked"])(state))
      return yield* new Unavailable({ invitationId: id, reason: "revoked" });
    const acceptedAt = yield* DateTime.now;
    if (!DateTime.isGreaterThan(details.expiresAt, acceptedAt))
      return yield* new Unavailable({ invitationId: id, reason: "expired" });
    yield* requireUnjoined(recipient);
    const inviter = yield* memberStore.get(details.inviterMemberId);
    if (Option.isNone(inviter))
      return yield* new Authorization.InvalidActor({
        memberId: details.inviterMemberId,
        reason: "membership-missing",
      });
    // Only this authority check uses the recorded inviter, never recipient input.
    yield* authorizeInvitation(details).pipe(
      Effect.provideService(Actor.Actor, {
        workspaceId,
        memberId: details.inviterMemberId,
        identity: inviter.value.identity,
      }),
    );
    const identity = Identity.MemberReference.cases.Human.make({ id: recipient });
    const provenance = yield* Publication.make(
      workspaceId,
      { _tag: "Identity", identity },
      acceptedAt,
    ).pipe(Effect.provideService(Crypto.Crypto, crypto));
    return yield* Effect.gen(function* () {
      const member = yield* memberCommand.add({
        identity,
        name,
        roleId: details.roleId,
        joinedAt: acceptedAt,
      });
      yield* journal.publish(InvitationFacts.Accepted, {
        _tag: "Accepted",
        workspaceId,
        invitationId: id,
        memberId: member.id,
        acceptedAt,
      });
      return member;
    }).pipe(Effect.provideService(Publication.Publication, provenance));
  }, journal.commit);

  const revoke = Effect.fn("InvitationService.revoke")(
    function* (id: Invitation.Id) {
      yield* authorization.require([manage]);
      const invitation = yield* requireInvitation(id);
      const actor = yield* authorizeInvitation(invitation.details);
      if (Invitation.State.isAnyOf(["Revoked"])(invitation.state)) return invitation;
      if (Invitation.State.isAnyOf(["Accepted"])(invitation.state))
        return yield* new Unavailable({ invitationId: id, reason: "accepted" });
      const state = Invitation.State.cases.Revoked.make({
        revokedBy: actor.memberId,
        revokedAt: yield* DateTime.now,
      });
      yield* journal
        .publish(InvitationFacts.Revoked, { workspaceId, invitationId: id, ...state })
        .pipe(Publication.withOccurredAt(state.revokedAt));
      return { details: invitation.details, state } satisfies Invitation.Record;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const list = Effect.gen(function* () {
    yield* authorization.require([manage]);
    return yield* invitationStore.list;
  }).pipe(Effect.withSpan("InvitationService.list"));

  return InvitationService.of({ issue, accept, revoke, list });
});

/**
 * Provide invitation operations over the caller's workspace services and cryptography.
 *
 * @category layers
 */
export const layer = Layer.effect(InvitationService, make());
