import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Target } from "../../authorization/target.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import type { Transaction } from "../../journal/transaction.ts";
import { Invitation } from "../invitation/invitation.ts";
import { InvitationFacts } from "../invitation/facts.ts";
import { InvitationStore } from "../invitation/store.ts";
import { MemberFacts } from "./facts.ts";
import { MemberPermissions } from "./permissions.ts";
import { MemberStore } from "./store.ts";
import { Member } from "./member.ts";
import { WorkspaceStore } from "../store.ts";
import { Workspace } from "../workspace.ts";

export class NotFound extends Schema.TaggedError<NotFound>()("MemberApplication.NotFound", {
  workspaceId: Workspace.Id,
  memberId: Member.Id,
}) {}

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "MemberApplication.WorkspaceMismatch",
  { expectedWorkspaceId: Workspace.Id, actualWorkspaceId: Workspace.Id },
) {}

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "MemberApplication.InvalidResponse",
  { message: Schema.String },
) {}

export class OwnerProtected extends Schema.TaggedError<OwnerProtected>()(
  "MemberApplication.OwnerProtected",
  { workspaceId: Workspace.Id, memberId: Member.Id },
) {}

export class AlreadyRemoved extends Schema.TaggedError<AlreadyRemoved>()(
  "MemberApplication.AlreadyRemoved",
  { workspaceId: Workspace.Id, memberId: Member.Id },
) {}

export type Error =
  | Authorization.Error
  | MemberStore.Failure
  | Transaction.Error
  | Schema.SchemaError
  | NotFound
  | WorkspaceMismatch
  | InvalidResponse;

export type RemoveError =
  | Error
  | WorkspaceStore.Failure
  | InvitationStore.Failure
  | Projection.Error
  | Log.WriteError
  | OwnerProtected
  | AlreadyRemoved;

export interface Interface {
  readonly workspaceId: Workspace.Id;
  /**
   * Read an active or removed membership after requiring member.read on it.
   * Authorization and lookup share one journal transaction, joining an existing
   * commit when present. Only authorized callers can receive NotFound.
   */
  readonly get: (memberId: Member.Id) => Effect.Effect<Member.Record, Error, Actor.Service>;
  /**
   * List the memberships the actor may read, active and removed. Active
   * membership is required; each record is then included only when member.read
   * covers it, so a workspace-scoped grant sees everyone and an exact grant sees
   * that member. Authorization and the listing share one journal transaction.
   */
  readonly list: Effect.Effect<ReadonlyArray<Member.Record>, Error, Actor.Service>;
  /**
   * Require member.remove on an active target, protect current ownership, and
   * publish its removal and revoke its human recipient's pending invitations in
   * one commit. Historical membership and grants remain;
   * authorization rejects removed members. Rejoining requires a new member ID.
   */
  readonly remove: (
    memberId: Member.Id,
  ) => Effect.Effect<Member.Record, RemoveError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/workspace/member-application/Service",
) {}

const decodeId = Schema.decodeEffect(Member.Id);
const decodeMember = Schema.decodeEffect(Member.Record);
const requireWorkspace = Effect.fnUntraced(function* (
  expectedWorkspaceId: Workspace.Id,
  actualWorkspaceId: Workspace.Id,
) {
  if (expectedWorkspaceId !== actualWorkspaceId) {
    return yield* new WorkspaceMismatch({ expectedWorkspaceId, actualWorkspaceId });
  }
});

/**
 * Construct member operations from workspace services; the caller supplies Actor.Service per call.
 *
 * @category constructors
 */
export const make = Effect.fn("MemberApplication.make")(function* (): Effect.fn.Return<
  Interface,
  WorkspaceMismatch,
  | MemberStore.Service
  | WorkspaceStore.Service
  | InvitationStore.Service
  | Authorization.Service
  | Journal.Service
> {
  const members = yield* MemberStore.Service;
  const workspace = yield* WorkspaceStore.Service;
  const invitations = yield* InvitationStore.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const workspaceId = authorization.workspaceId;
  yield* requireWorkspace(workspaceId, members.workspaceId);
  yield* requireWorkspace(workspaceId, workspace.workspaceId);
  yield* requireWorkspace(workspaceId, invitations.workspaceId);

  const load = Effect.fnUntraced(function* (id: Member.Id) {
    const found = yield* members.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ workspaceId, memberId: id });
    const member = yield* decodeMember(found.value);
    yield* requireWorkspace(workspaceId, member.workspaceId);
    if (member.id !== id) {
      return yield* new InvalidResponse({ message: "Member store returned a different member ID" });
    }
    return member;
  });

  const get = Effect.fn("MemberApplication.get")(function* (memberId: Member.Id) {
    const id = yield* decodeId(memberId);
    yield* authorization.require([
      Requirement.make(
        MemberPermissions.Read,
        Target.Reference.cases.Member.make({ workspaceId, memberId: id }),
      ),
    ]);
    return yield* load(id);
  }, journal.commit);

  const list = Effect.gen(function* () {
    yield* authorization.require([]);
    const readable: Array<Member.Record> = [];
    for (const found of yield* members.list) {
      const member = yield* decodeMember(found);
      yield* requireWorkspace(workspaceId, member.workspaceId);
      const allowed = yield* authorization
        .require([
          Requirement.make(
            MemberPermissions.Read,
            Target.Reference.cases.Member.make({ workspaceId, memberId: member.id }),
          ),
        ])
        .pipe(
          Effect.as(true),
          Effect.catchTag("Authorization.Denied", () => Effect.succeed(false)),
        );
      if (allowed) readable.push(member);
    }
    return readable;
  }).pipe(journal.commit, Effect.withSpan("MemberApplication.list"));

  const remove = Effect.fn("MemberApplication.remove")(function* (memberId: Member.Id) {
    const id = yield* decodeId(memberId);
    yield* authorization.require([
      Requirement.make(
        MemberPermissions.Remove,
        Target.Reference.cases.Member.make({ workspaceId, memberId: id }),
      ),
    ]);
    const member = yield* load(id);
    const found = yield* workspace.get;
    if (Option.isNone(found))
      return yield* new InvalidResponse({ message: "Workspace metadata is missing" });
    const record = yield* Schema.decodeEffect(Workspace.Record)(found.value);
    yield* requireWorkspace(workspaceId, record.id);
    if (record.ownerMemberId === id)
      return yield* new OwnerProtected({ workspaceId, memberId: id });
    if (member.status === "removed")
      return yield* new AlreadyRemoved({ workspaceId, memberId: id });
    yield* journal.publish(MemberFacts.Removed, { workspaceId, memberId: id });
    if (member.identity._tag === "Human") {
      const actor = yield* Actor.Service;
      const revokedAt = yield* DateTime.now;
      for (const pending of yield* invitations.listPendingByRecipient(member.identity.id)) {
        const invitation = yield* Schema.decodeEffect(Schema.toType(Invitation.Record))(pending);
        if (
          invitation.details.workspaceId !== workspaceId ||
          invitation.details.recipientId !== member.identity.id ||
          invitation.state._tag !== "Pending"
        )
          return yield* new InvalidResponse({
            message: "Invitation store returned a different recipient, workspace, or state",
          });
        yield* journal.publish(InvitationFacts.Revoked, {
          workspaceId,
          invitationId: invitation.details.id,
          _tag: "Revoked",
          revokedBy: actor.memberId,
          revokedAt,
        });
      }
    }
    return {
      id,
      workspaceId,
      identity: member.identity,
      status: "removed",
    } satisfies Member.Record;
  }, journal.commit);

  return Service.of({ workspaceId, get, list, remove });
});

/**
 * Provide member operations over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as MemberApplication from "./application.ts";
