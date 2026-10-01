import { Request } from "../../request/request.ts";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Assignment } from "../../authorization/assignment/assignment.ts";
import { AssignmentFacts } from "../../authorization/assignment/facts.ts";
import { Authorization } from "../../authorization/authorization.ts";
import { Delegation } from "../../authorization/delegation.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Target } from "../../authorization/target.ts";
import { Group } from "../../group/group.ts";
import { GroupMembershipFacts } from "../../group/membership/facts.ts";
import { GroupMembership } from "../../group/membership/membership.ts";
import { GroupStore } from "../../group/store.ts";
import { Actor } from "../../identity/actor.ts";
import { Identity } from "../../identity/identity.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Store } from "../../journal/store.ts";
import { Invitation } from "./invitation.ts";
import { InvitationFacts } from "./facts.ts";
import { InvitationPermissions } from "./permissions.ts";
import { InvitationStore } from "./store.ts";
import { Member } from "../member/member.ts";
import { MemberFacts } from "../member/facts.ts";
import { MemberStore } from "../member/store.ts";
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
  | GroupStore.Failure
  | NotFound
  | NotRecipient
  | AlreadyMember
  | Unavailable
  | InvalidExpiry;

export interface Interface {
  readonly issue: (
    request: Invitation.IssueInput,
    options?: Request.Options,
  ) => Effect.Effect<Invitation.Record, Error, Actor.Service>;
  /**
   * Trusted ingress supplies the authenticated recipient; no membership is required yet. The
   * recipient may say what people in the workspace call them.
   */
  readonly accept: (
    id: Invitation.Id,
    recipient: Identity.HumanId,
    options?: { readonly name?: Member.Name },
  ) => Effect.Effect<Member.Record, Error>;
  readonly revoke: (id: Invitation.Id) => Effect.Effect<Invitation.Record, Error, Actor.Service>;
  /** Every invitation in the workspace in issue order; requires invitation.manage. */
  readonly list: Effect.Effect<ReadonlyArray<Invitation.Record>, Error, Actor.Service>;
}
/** What a keyed issuance created, so that a retry returns it. */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/workspace/invitation-application/Service",
) {}

/**
 * Construct invitation operations from workspace services; read the actor during protected calls.
 *
 * @category constructors
 */
export const make = Effect.fn("InvitationApplication.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  | InvitationStore.Service
  | MemberStore.Service
  | GroupStore.Service
  | Authorization.Service
  | Delegation.Service
  | Journal.Service
  | Crypto.Crypto
  | Store.Service
> {
  const invitations = yield* InvitationStore.Service;
  const members = yield* MemberStore.Service;
  const groups = yield* GroupStore.Service;
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
  const manage = Requirement.make(
    InvitationPermissions.Manage,
    Target.Reference.cases.Workspace.make({ workspaceId }),
  );

  const authorizeAccess = Effect.fn("InvitationApplication.authorizeAccess")(function* (
    input: Invitation.IssueInput,
  ) {
    yield* authorization.require([manage]);
    yield* delegation.requireGrant(input.roleId);
    return yield* Actor.Service;
  });
  const load = Effect.fnUntraced(function* (id: Invitation.Id) {
    const validId = yield* Schema.decodeEffect(Invitation.Id)(id);
    const found = yield* invitations.get(validId);
    if (Option.isNone(found)) return yield* new NotFound({ invitationId: id });
    return found.value;
  });
  const requireUnjoined = Effect.fnUntraced(function* (recipientId: Identity.HumanId) {
    if (
      Option.isSome(
        yield* members.findActive(Identity.Reference.cases.Human.make({ id: recipientId })),
      )
    )
      return yield* new AlreadyMember({ recipientId });
  });

  const issue = Effect.fn("InvitationApplication.issue")(
    function* (input: Invitation.IssueInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Invitation.IssueInput))(input);
      const actor = yield* authorizeAccess(request);
      const invitationId = Invitation.Id.make(
        yield* Request.idFor(options.requestKey, ["invitation.issue", workspaceId, actor.memberId]),
      );
      // A retry returns the invitation its first attempt issued, as it stands now.
      if (options.requestKey !== undefined && Option.isSome(yield* invitations.get(invitationId)))
        return yield* load(invitationId);
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

  const accept = Effect.fn("InvitationApplication.accept")(function* (
    id: Invitation.Id,
    authenticated: Identity.HumanId,
    options: { readonly name?: Member.Name } = {},
  ) {
    const recipient = yield* Schema.decodeEffect(Identity.HumanId)(authenticated);
    const name =
      options.name === undefined
        ? undefined
        : yield* Schema.decodeEffect(Member.NewName)(options.name);
    const invitation = yield* load(id);
    const { details, state } = invitation;
    if (details.recipientId !== recipient) return yield* new NotRecipient({ invitationId: id });
    // Repeated acceptance returns the original receipt, without restoring grants
    // or reactivating a membership that has since been removed.
    if (state._tag === "Accepted") {
      const member = yield* members.get(state.memberId);
      if (Option.isNone(member))
        return yield* Effect.die("An accepted invitation's member is missing");
      return member.value;
    }
    if (state._tag === "Revoked")
      return yield* new Unavailable({ invitationId: id, reason: "revoked" });
    const acceptedAt = yield* DateTime.now;
    if (!DateTime.isGreaterThan(details.expiresAt, acceptedAt))
      return yield* new Unavailable({ invitationId: id, reason: "expired" });
    yield* requireUnjoined(recipient);
    const inviter = yield* members.get(details.inviterMemberId);
    if (Option.isNone(inviter))
      return yield* new Authorization.InvalidActor({
        memberId: details.inviterMemberId,
        reason: "membership-missing",
      });
    // Only this authority check uses the recorded inviter, never recipient input.
    yield* authorizeAccess(details).pipe(
      Effect.provideService(Actor.Service, {
        workspaceId,
        memberId: details.inviterMemberId,
        identity: inviter.value.identity,
      }),
    );
    const member: Member.Record = {
      id: Member.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      identity: Identity.Reference.cases.Human.make({ id: recipient }),
      ...(name === undefined ? {} : { name }),
      status: "active",
    };
    const provenance = yield* Publication.make(
      workspaceId,
      {
        _tag: "Identity",
        identity: member.identity,
      },
      acceptedAt,
    ).pipe(Effect.provideService(Crypto.Crypto, crypto));
    return yield* Effect.gen(function* () {
      yield* journal.publish(MemberFacts.Added, {
        memberId: member.id,
        workspaceId,
        identity: member.identity,
        ...(name === undefined ? {} : { name }),
      });
      yield* journal.publish(AssignmentFacts.Created, {
        assignmentId: Assignment.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        memberId: member.id,
        source: Assignment.Source.cases.Role.make({
          roleId: details.roleId,
          scope: { _tag: "Workspace", workspaceId },
        }),
      });
      yield* journal.publish(InvitationFacts.Accepted, {
        _tag: "Accepted",
        workspaceId,
        invitationId: id,
        memberId: member.id,
        acceptedAt,
      });
      // Every member joins the workspace's general group as they join it; a workspace created
      // before general groups existed has none.
      if (Option.isSome(yield* groups.get(Group.GeneralId)))
        yield* journal.publish(GroupMembershipFacts.Added, {
          id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
          workspaceId,
          groupId: Group.GeneralId,
          memberId: member.id,
          admittedAt: acceptedAt,
          status: "active",
        });
      return member;
    }).pipe(Effect.provideService(Publication.Service, provenance));
  }, journal.commit);

  const revoke = Effect.fn("InvitationApplication.revoke")(
    function* (id: Invitation.Id) {
      yield* authorization.require([manage]);
      const invitation = yield* load(id);
      const actor = yield* authorizeAccess(invitation.details);
      if (invitation.state._tag === "Revoked") return invitation;
      if (invitation.state._tag === "Accepted")
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
    return yield* invitations.list;
  }).pipe(Effect.withSpan("InvitationApplication.list"));

  return Service.of({ issue, accept, revoke, list });
});

/**
 * Provide invitation operations over the caller's workspace services and cryptography.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as InvitationApplication from "./application.ts";
