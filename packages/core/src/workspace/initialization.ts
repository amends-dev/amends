import { Crypto, Effect, Option, Schema } from "effect";
import { Assignment } from "../authorization/assignment/assignment.ts";
import { AssignmentFacts } from "../authorization/assignment/facts.ts";
import { Grant } from "../authorization/grant.ts";
import { Scope } from "../authorization/scope.ts";
import { Identity } from "../identity/identity.ts";
import { Journal } from "../journal/journal.ts";
import { WorkspaceFacts } from "./facts.ts";
import { MemberFacts } from "./member/facts.ts";
import { MemberPermissions } from "./member/permissions.ts";
import { InvitationPermissions } from "./invitation/permissions.ts";
import { Member } from "./member/member.ts";
import { WorkspaceStore } from "./store.ts";
import { Workspace } from "./workspace.ts";

export class AlreadyInitialized extends Schema.TaggedError<AlreadyInitialized>()(
  "WorkspaceInitialization.AlreadyInitialized",
  {
    workspaceId: Workspace.Id,
  },
) {}

/**
 * Trusted host entry point after creation entitlement is checked. The caller is
 * an authenticated human, before a membership/Actor exists. Initialization is
 * one atomic commit and never grants additional access on a repeated call.
 * These explicit initial grants cover the membership operations currently defined;
 * future permissions require an explicit bootstrap-policy change.
 */
export const initialize = Effect.fn("WorkspaceInitialization.initialize")(function* (
  creator: Identity.HumanId,
  input: Workspace.CreateInput,
) {
  const createdBy = yield* Schema.decodeEffect(Identity.HumanId)(creator);
  const { name } = yield* Schema.decodeEffect(Workspace.CreateInput)(input);
  const workspace = yield* WorkspaceStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  return yield* journal.commit(
    Effect.gen(function* () {
      if (Option.isSome(yield* workspace.get))
        return yield* new AlreadyInitialized({ workspaceId: workspace.workspaceId });
      const ownerMemberId = Member.Id.make(yield* crypto.randomUUIDv4);
      const record = Workspace.Record.make({
        id: workspace.workspaceId,
        name,
        createdBy,
        ownerMemberId,
      });
      yield* journal.publish(WorkspaceFacts.Initialized, record);
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
          assignmentId: Assignment.Id.make(yield* crypto.randomUUIDv4),
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

export * as WorkspaceInitialization from "./initialization.ts";
