import { Crypto, Effect, Option, Schema } from "effect";
import { Assignment } from "../authorization/assignment.ts";
import { AssignmentFacts } from "../authorization/assignment-facts.ts";
import { AssignmentStore } from "../authorization/assignment-store.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Actor } from "../identity/actor.ts";
import { Grant } from "../authorization/grant.ts";
import { Scope } from "../authorization/scope.ts";
import { Identity } from "../identity/identity.ts";
import { Fact } from "../journal/fact.ts";
import { Journal } from "../journal/journal.ts";
import { Projection } from "../journal/projection.ts";
import { MemberFacts } from "./member-facts.ts";
import { MemberPermissions } from "./member-permissions.ts";
import { InvitationPermissions } from "./invitation-permissions.ts";
import { Member } from "./member.ts";
import { WorkspaceStore } from "./workspace-store.ts";
import { Workspace } from "./workspace.ts";

export class AlreadyInitialized extends Schema.TaggedError<AlreadyInitialized>()(
  "WorkspaceInitialization.AlreadyInitialized",
  {
    workspaceId: Workspace.Id,
  },
) {}

export class NotOwner extends Schema.TaggedError<NotOwner>()("WorkspaceInitialization.NotOwner", {
  workspaceId: Workspace.Id,
}) {}

/** Stable identity makes the explicit bootstrap upgrade safe to repeat, even after revocation. */
export const invitationAssignmentId = (memberId: Member.Id) =>
  Assignment.Id.make(`${memberId}:initial-invitation.manage`);

export const Initialized = Fact.make("workspace.initialized", {
  version: 1,
  payload: Workspace.Record,
});
export const projection = Projection.make("workspace.metadata", { version: 1 }).on(
  Initialized,
  Effect.fn("WorkspaceInitialization.project")(function* ({ payload }) {
    yield* (yield* WorkspaceStore.Service).insert(payload);
  }),
);

/**
 * Trusted host entry point after creation entitlement is checked. The caller is
 * an authenticated human, before a membership/Actor exists. Initialization is
 * one atomic commit and never grants additional access on a repeated call.
 * These explicit initial grants cover the membership operations currently defined;
 * future permissions require an explicit bootstrap-policy change.
 */
export const initialize = Effect.fn("WorkspaceInitialization.initialize")(function* (
  creator: Identity.HumanId,
) {
  const createdBy = yield* Schema.decodeEffect(Identity.HumanId)(creator);
  const workspace = yield* WorkspaceStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  return yield* journal.commit(
    Effect.gen(function* () {
      if (Option.isSome(yield* workspace.get()))
        return yield* new AlreadyInitialized({ workspaceId: workspace.workspaceId });
      const ownerMemberId = Member.Id.make(yield* crypto.randomUUIDv4);
      const record = Workspace.Record.make({ id: workspace.workspaceId, createdBy, ownerMemberId });
      yield* journal.publish(Initialized, record);
      yield* journal.publish(MemberFacts.Added, {
        workspaceId: record.id,
        memberId: ownerMemberId,
        identity: Identity.Reference.cases.Human.make({ id: createdBy }),
      });
      for (const permission of [
        MemberPermissions.Read,
        MemberPermissions.Remove,
        InvitationPermissions.Manage,
      ]) {
        yield* journal.publish(AssignmentFacts.Created, {
          workspaceId: record.id,
          assignmentId:
            permission === InvitationPermissions.Manage
              ? invitationAssignmentId(ownerMemberId)
              : Assignment.Id.make(yield* crypto.randomUUIDv4),
          memberId: ownerMemberId,
          source: Assignment.Source.cases.Direct.make({
            grant: Grant.make(
              permission,
              Scope.Value.cases.Workspace.make({ workspaceId: record.id }),
            ),
          }),
        });
      }
      return record;
    }),
  );
});

/**
 * Explicit upgrade for workspaces initialized before invitations existed. This
 * grants the new capability once to the active current owner. It is never run on
 * startup or acceptance, and an existing revoked assignment is never restored.
 */
export const enableInvitations = Effect.fn("WorkspaceInitialization.enableInvitations")(
  function* () {
    const workspace = yield* WorkspaceStore.Service;
    const journal = yield* Journal.Service;
    const assignments = yield* AssignmentStore.Service;
    const authorization = yield* Authorization.Service;
    return yield* journal.commit(
      Effect.gen(function* () {
        yield* authorization.require([]);
        const actor = yield* Actor.Service;
        const found = yield* workspace.get();
        if (
          Option.isNone(found) ||
          found.value.id !== workspace.workspaceId ||
          actor.workspaceId !== workspace.workspaceId ||
          actor.memberId !== found.value.ownerMemberId
        )
          return yield* new NotOwner({ workspaceId: workspace.workspaceId });
        const assignmentId = invitationAssignmentId(actor.memberId);
        if (Option.isSome(yield* assignments.get(assignmentId))) return;
        yield* journal.publish(AssignmentFacts.Created, {
          assignmentId,
          workspaceId: workspace.workspaceId,
          memberId: actor.memberId,
          source: Assignment.Source.cases.Direct.make({
            grant: Grant.make(
              InvitationPermissions.Manage,
              Scope.Value.cases.Workspace.make({ workspaceId: workspace.workspaceId }),
            ),
          }),
        });
      }),
    );
  },
);

export * as WorkspaceInitialization from "./workspace-initialization.ts";
