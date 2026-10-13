/**
 * How a workspace comes to be: the one trusted entry point the gateway calls once it has checked
 * the creator's entitlement and bound storage to a new workspace ID. It runs before any member or
 * actor exists, so it carries the creator's identity as the commit's provenance itself, and it
 * records in one commit everything a workspace starts with. Repeating it is `AlreadyInitialized`
 * and grants nothing.
 *
 * @since 0.1.0
 */
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as PermissionCatalog from "../authorization/PermissionCatalog.ts";
import * as BuiltinRoles from "../authorization/BuiltinRoles.ts";
import * as AssignmentCommand from "../authorization/AssignmentCommand.ts";
import * as RoleFacts from "../authorization/RoleFacts.ts";

import * as GroupFacts from "../group/GroupFacts.ts";
import * as Group from "../group/Group.ts";
import * as GroupCommand from "../group/GroupCommand.ts";
import * as Identity from "../identity/Identity.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as WorkspaceFacts from "./WorkspaceFacts.ts";
import * as MemberFacts from "./MemberFacts.ts";
import * as Member from "./Member.ts";
import * as WorkspaceStore from "./WorkspaceStore.ts";
import * as Workspace from "./Workspace.ts";

/**
 * The workspace has a record already: initialization ran before, and nothing is repeated or
 * granted again.
 *
 * @category errors
 * @since 0.1.0
 */
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
 *
 * @category constructors
 * @since 0.1.0
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
  // Creation runs before the workspace's operations exist, so it builds the commands it shares.
  const assignmentCommand = yield* AssignmentCommand.make();
  const groupCommand = yield* GroupCommand.make();
  const provenance = yield* Publication.make(workspaceId, {
    _tag: "Identity",
    identity: Identity.Reference.cases.Human.make({ id: createdBy }),
  });
  return yield* journal.commit(
    Effect.gen(function* () {
      if (Option.isSome(yield* workspaceStore.get))
        return yield* new AlreadyInitialized({ workspaceId });
      const ownerMemberId = Member.Id.make(yield* crypto.randomUUIDv4);
      const record = Workspace.Workspace.make({
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
      yield* groupCommand.admitMember(Group.GeneralId, ownerMemberId, createdAt);
      return record;
    }).pipe(Effect.provideService(Publication.Publication, provenance)),
  );
});
