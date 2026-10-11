import { Crypto, DateTime, Effect, Option, Schema } from "effect";

import * as PermissionCatalog from "../authorization/PermissionCatalog.ts";
import * as BuiltinRoles from "../authorization/BuiltinRoles.ts";
import * as AssignmentCommand from "../authorization/AssignmentCommand.ts";
import * as RoleFacts from "../authorization/RoleFacts.ts";

import * as GroupFacts from "../group/GroupFacts.ts";
import * as Group from "../group/Group.ts";
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts";
import * as GroupMembership from "../group/GroupMembership.ts";
import * as Identity from "../identity/Identity.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as WorkspaceFacts from "./WorkspaceFacts.ts";
import * as MemberFacts from "./MemberFacts.ts";
import * as Member from "./Member.ts";
import * as WorkspaceStore from "./WorkspaceStore.ts";
import * as Workspace from "./Workspace.ts";

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
 * Built-in roles are recorded from the permission catalog's tiers at the current revision, and
 * the creator receives one workspace-scoped Owner assignment. Existing roles are never refreshed
 * here; `BuiltinRoleUpgrade` brings an older workspace's roles to a later revision. The workspace
 * starts with its general group, public and holding the creator; see `Group.GeneralId`.
 */
export const initialize = Effect.fn("WorkspaceInitialization.initialize")(function* (
  creator: Identity.HumanId,
  input: Workspace.CreateInput,
) {
  const createdBy = yield* Schema.decodeEffect(Identity.HumanId)(creator);
  const { name, memberName } = yield* Schema.decodeEffect(Workspace.CreateInput)(input);
  const workspaceStore = yield* WorkspaceStore.WorkspaceStore;
  const { workspaceId } = yield* Store.Store;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const permissionCatalog = yield* PermissionCatalog.PermissionCatalog;
  // Creation runs before the workspace's operations exist, so it builds the command it shares.
  const assignmentCommand = yield* AssignmentCommand.make();
  const provenance = yield* Publication.make(workspaceId, {
    _tag: "Identity",
    identity: Identity.Reference.cases.Human.make({ id: createdBy }),
  });
  return yield* journal.commit(
    Effect.gen(function* () {
      if (Option.isSome(yield* workspaceStore.get))
        return yield* new AlreadyInitialized({ workspaceId });
      const ownerMemberId = Member.Id.make(yield* crypto.randomUUIDv4);
      const record = Workspace.Record.make({
        id: workspaceId,
        name,
        createdBy,
        ownerMemberId,
      });
      yield* journal.publish(WorkspaceFacts.Initialized, record);
      yield* journal.publish(MemberFacts.Added, {
        workspaceId: record.id,
        memberId: ownerMemberId,
        identity: Identity.Reference.cases.Human.make({ id: createdBy }),
        name: memberName,
      });
      for (const role of BuiltinRoles.make(record.id, permissionCatalog.definitions)) {
        yield* journal.publish(RoleFacts.Created, {
          roleId: role.id,
          workspaceId: role.workspaceId,
          name: role.name,
          permissions: role.permissions,
        });
      }
      yield* journal.publish(RoleFacts.BuiltinsRevised, {
        workspaceId: record.id,
        revision: BuiltinRoles.revision,
      });
      yield* assignmentCommand.assignRole(ownerMemberId, BuiltinRoles.OwnerId);
      const createdAt = yield* DateTime.now;
      yield* journal
        .publish(GroupFacts.Created, {
          id: Group.GeneralId,
          workspaceId: record.id,
          kind: "Team",
          visibility: "Public",
          name: Group.generalName,
          createdBy: ownerMemberId,
          createdAt,
        })
        .pipe(Publication.withOccurredAt(createdAt));
      yield* journal
        .publish(GroupMembershipFacts.Added, {
          id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
          workspaceId: record.id,
          groupId: Group.GeneralId,
          memberId: ownerMemberId,
          admittedAt: createdAt,
          status: "active",
        })
        .pipe(Publication.withOccurredAt(createdAt));
      return record;
    }).pipe(Effect.provideService(Publication.Publication, provenance)),
  );
});
