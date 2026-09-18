import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Assignment } from "../authorization/assignment.ts";
import { AssignmentFacts } from "../authorization/assignment-facts.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Grant } from "../authorization/grant.ts";
import { PermissionCatalog } from "../authorization/permission-catalog.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Target } from "../authorization/target.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Invitation } from "./invitation.ts";
import { InvitationJournal } from "./invitation-journal.ts";
import { InvitationPermissions } from "./invitation-permissions.ts";
import { InvitationStore } from "./invitation-store.ts";
import { Member } from "./member.ts";
import { MemberFacts } from "./member-facts.ts";
import { MemberStore } from "./member-store.ts";
import { Workspace } from "./workspace.ts";
import { WorkspaceStore } from "./workspace-store.ts";

export class NotFound extends Schema.TaggedError<NotFound>()("InvitationApplication.NotFound", {
  invitationId: Invitation.Id,
}) {}
export class NotRecipient extends Schema.TaggedError<NotRecipient>()(
  "InvitationApplication.NotRecipient",
  { invitationId: Invitation.Id },
) {}
export class NotOwner extends Schema.TaggedError<NotOwner>()("InvitationApplication.NotOwner", {
  workspaceId: Workspace.Id,
}) {}
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()(
  "InvitationApplication.AlreadyMember",
  { recipientId: Identity.HumanId },
) {}
export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "InvitationApplication.Unavailable",
  {
    invitationId: Invitation.Id,
    reason: Schema.Literals(["expired", "revoked", "accepted"]),
  },
) {}
export class InvalidExpiry extends Schema.TaggedError<InvalidExpiry>()(
  "InvitationApplication.InvalidExpiry",
  {},
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "InvitationApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | Authorization.Error
  | Projection.Error
  | Log.WriteError
  | PlatformError.PlatformError
  | InvitationStore.Failure
  | MemberStore.Failure
  | WorkspaceStore.Failure
  | PermissionCatalog.Unknown
  | NotFound
  | NotRecipient
  | NotOwner
  | AlreadyMember
  | Unavailable
  | InvalidExpiry
  | InvalidResponse;

export interface Interface {
  readonly issue: (
    request: Invitation.Request,
  ) => Effect.Effect<Invitation.Record, Error, Actor.Service>;
  /** Trusted ingress supplies the authenticated recipient; no membership is required yet. */
  readonly accept: (
    id: Invitation.Id,
    recipient: Identity.HumanId,
  ) => Effect.Effect<Member.Record, Error>;
  readonly revoke: (id: Invitation.Id) => Effect.Effect<Invitation.Record, Error, Actor.Service>;
  /** Every invitation in the workspace in issue order; requires invitation.manage. */
  readonly list: Effect.Effect<ReadonlyArray<Invitation.Record>, Error, Actor.Service>;
}
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
  InvalidResponse,
  | InvitationStore.Service
  | MemberStore.Service
  | WorkspaceStore.Service
  | Authorization.Service
  | PermissionCatalog.Service
  | Journal.Service
  | Crypto.Crypto
> {
  const invitations = yield* InvitationStore.Service;
  const members = yield* MemberStore.Service;
  const workspace = yield* WorkspaceStore.Service;
  const authorization = yield* Authorization.Service;
  const catalog = yield* PermissionCatalog.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = workspace.workspaceId;
  if (
    [invitations.workspaceId, members.workspaceId, authorization.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidResponse({
      message: "Invitation services belong to different workspaces",
    });
  const manage = Requirement.make(
    InvitationPermissions.Manage,
    Target.Reference.cases.Workspace.make({ workspaceId }),
  );

  // This is the first invitation grant policy: current ownership confers delegation
  // authority. Possessing a permission alone never confers the right to grant it.
  const authorizeOwner = Effect.fnUntraced(function* () {
    yield* authorization.require([manage]);
    const actor = yield* Actor.Service;
    const found = yield* workspace.get;
    if (Option.isNone(found) || found.value.id !== workspaceId)
      return yield* new InvalidResponse({ message: "Workspace metadata is missing or mismatched" });
    if (found.value.ownerMemberId !== actor.memberId) return yield* new NotOwner({ workspaceId });
    return actor;
  });
  const validateGrants = Effect.fnUntraced(function* (grants: ReadonlyArray<Grant.Value>) {
    const result: Array<Grant.Value> = [];
    for (const grant of grants) {
      const definition = yield* catalog.get(grant.permission);
      const checked = yield* Schema.decodeEffect(Grant.makeSchema(definition))(grant);
      const targetWorkspace =
        checked.scope._tag === "Workspace"
          ? checked.scope.workspaceId
          : checked.scope.target.workspaceId;
      if (targetWorkspace !== workspaceId)
        return yield* new Authorization.WorkspaceMismatch({
          expectedWorkspaceId: workspaceId,
          actualWorkspaceId: targetWorkspace,
        });
      result.push(checked);
    }
    return result;
  });
  const load = Effect.fnUntraced(function* (id: Invitation.Id) {
    const validId = yield* Schema.decodeEffect(Invitation.Id)(id);
    const found = yield* invitations.get(validId);
    if (Option.isNone(found)) return yield* new NotFound({ invitationId: id });
    const record = yield* Schema.decodeEffect(Schema.toType(Invitation.Record))(found.value);
    if (record.details.id !== id || record.details.workspaceId !== workspaceId)
      return yield* new InvalidResponse({
        message: "Invitation store returned a different invitation or workspace",
      });
    return record;
  });
  const requireUnjoined = Effect.fnUntraced(function* (recipientId: Identity.HumanId) {
    if (
      Option.isSome(
        yield* members.findActive(Identity.Reference.cases.Human.make({ id: recipientId })),
      )
    )
      return yield* new AlreadyMember({ recipientId });
  });

  const issue = Effect.fn("InvitationApplication.issue")(function* (input: Invitation.Request) {
    const actor = yield* authorizeOwner();
    const request = yield* Schema.decodeEffect(Schema.toType(Invitation.Request))(input);
    const issuedAt = yield* DateTime.now;
    if (!DateTime.isGreaterThan(request.expiresAt, issuedAt)) return yield* new InvalidExpiry({});
    yield* requireUnjoined(request.recipientId);
    const grants = yield* validateGrants(request.grants);
    const details: Invitation.Details = {
      id: Invitation.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      inviterMemberId: actor.memberId,
      issuedAt,
      expiresAt: request.expiresAt,
      recipientId: request.recipientId,
      grants,
    };
    yield* journal.publish(InvitationJournal.Issued, details);
    return { details, state: { _tag: "Pending" } } satisfies Invitation.Record;
  }, journal.commit);

  const accept = Effect.fn("InvitationApplication.accept")(function* (
    id: Invitation.Id,
    authenticated: Identity.HumanId,
  ) {
    const recipient = yield* Schema.decodeEffect(Identity.HumanId)(authenticated);
    const invitation = yield* load(id);
    const { details, state } = invitation;
    if (details.recipientId !== recipient) return yield* new NotRecipient({ invitationId: id });
    // Repeated acceptance returns the original receipt, without restoring grants
    // or reactivating a membership that has since been removed.
    if (state._tag === "Accepted") {
      const member = yield* members.get(state.memberId);
      if (
        Option.isNone(member) ||
        member.value.id !== state.memberId ||
        member.value.workspaceId !== workspaceId ||
        member.value.identity._tag !== "Human" ||
        member.value.identity.id !== recipient
      )
        return yield* new InvalidResponse({
          message: "Accepted invitation has no matching membership",
        });
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
    yield* authorizeOwner().pipe(
      Effect.provideService(Actor.Service, {
        workspaceId,
        memberId: details.inviterMemberId,
        identity: inviter.value.identity,
      }),
    );
    const grants = yield* validateGrants(details.grants);
    const member: Member.Record = {
      id: Member.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      identity: Identity.Reference.cases.Human.make({ id: recipient }),
      status: "active",
    };
    yield* journal.publish(MemberFacts.Added, {
      memberId: member.id,
      workspaceId,
      identity: member.identity,
    });
    for (const grant of grants)
      yield* journal.publish(AssignmentFacts.Created, {
        assignmentId: Assignment.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        memberId: member.id,
        source: Assignment.Source.cases.Direct.make({ grant }),
      });
    yield* journal.publish(InvitationJournal.Accepted, {
      _tag: "Accepted",
      workspaceId,
      invitationId: id,
      memberId: member.id,
      acceptedAt,
    });
    return member;
  }, journal.commit);

  const revoke = Effect.fn("InvitationApplication.revoke")(function* (id: Invitation.Id) {
    const actor = yield* authorizeOwner();
    const invitation = yield* load(id);
    if (invitation.state._tag === "Revoked") return invitation;
    if (invitation.state._tag === "Accepted")
      return yield* new Unavailable({ invitationId: id, reason: "accepted" });
    const state = Invitation.State.cases.Revoked.make({
      revokedBy: actor.memberId,
      revokedAt: yield* DateTime.now,
    });
    yield* journal.publish(InvitationJournal.Revoked, { workspaceId, invitationId: id, ...state });
    return { details: invitation.details, state } satisfies Invitation.Record;
  }, journal.commit);

  const list = Effect.gen(function* () {
    yield* authorization.require([manage]);
    const records: Array<Invitation.Record> = [];
    for (const found of yield* invitations.list) {
      const record = yield* Schema.decodeEffect(Schema.toType(Invitation.Record))(found);
      if (record.details.workspaceId !== workspaceId)
        return yield* new InvalidResponse({
          message: "Invitation store returned another workspace's invitation",
        });
      records.push(record);
    }
    return records;
  }).pipe(journal.commit, Effect.withSpan("InvitationApplication.list"));

  return Service.of({ issue, accept, revoke, list });
});

/**
 * Provide invitation operations over the caller's workspace services and cryptography.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as InvitationApplication from "./invitation-application.ts";
