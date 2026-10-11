/**
 * The operations behind a workspace's settings an actor calls: reading the workspace with what the
 * actor may do there, listing members for management with their access and whether each can be
 * removed, and renaming the workspace. The flags it computes come from the same permissions and
 * delegation rules the operations they describe enforce, read through `MemberService` and
 * `AssignmentService`.
 *
 * @since 0.1.0
 */
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import * as Assignment from "../authorization/Assignment.ts";
import * as AssignmentService from "../authorization/AssignmentService.ts";
import * as AssignmentPermissions from "../authorization/AssignmentPermissions.ts";
import * as Authorization from "../authorization/Authorization.ts";
import * as Delegation from "../authorization/Delegation.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Actor from "../identity/Actor.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import * as Store from "../journal/Store.ts";
import * as MemberService from "./MemberService.ts";
import * as MemberPermissions from "./MemberPermissions.ts";
import * as InvitationPermissions from "./InvitationPermissions.ts";
import * as WorkspaceStore from "./WorkspaceStore.ts";
import * as WorkspaceFacts from "./WorkspaceFacts.ts";
import * as Workspace from "./Workspace.ts";
import * as WorkspaceSettings from "./WorkspaceSettings.ts";
import * as WorkspaceSettingsPermissions from "./WorkspaceSettingsPermissions.ts";
import { Changed } from "./WorkspaceSettingsErrors.ts";
export {
  /**
   * The workspace's name is no longer the one the renamer expected: someone renamed it meanwhile,
   * and nothing was recorded.
   *
   * @category errors
   * @since 0.1.0
   */
  Changed,
} from "./WorkspaceSettingsErrors.ts";

/**
 * What the settings operations can fail with: the outcome in `WorkspaceSettingsErrors`, and the
 * failures of what they depend on.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | AssignmentService.Error
  | MemberService.Error
  | WorkspaceStore.Failure
  | Schema.SchemaError
  | Changed
  | Projection.Error
  | Log.WriteError
  | PlatformError.PlatformError;

/**
 * The settings operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceSettingsService extends Context.Service<
  WorkspaceSettingsService,
  {
    /**
     * The workspace, whether the actor may rename it, read invitations, and invite, and the
     * built-in roles with whether the actor may assign each. Requires active membership alone.
     */
    readonly get: Effect.Effect<WorkspaceSettings.View, Error, Actor.Actor>;
    /**
     * The members the actor may read, each with their access when the actor may read it and whether
     * the actor may remove them. One resolution of the actor's grants decides every member, by the
     * delegation rule (`Delegation.recipientDenial`) role changes and removals enforce.
     */
    readonly members: Effect.Effect<
      ReadonlyArray<WorkspaceSettings.MemberEntry>,
      Error,
      Actor.Actor
    >;
    /**
     * Rename the workspace, under `workspace.rename`. The same name again records nothing;
     * otherwise a current name other than `expectedName` is `Changed`, and nothing is recorded.
     * Names are compared, not versions, so a rename away and back goes unnoticed. Publishes
     * `WorkspaceFacts.Renamed` in one commit and returns the renamed workspace.
     */
    readonly rename: (
      input: WorkspaceSettings.RenameInput,
    ) => Effect.Effect<Workspace.Workspace, Error, Actor.Actor>;
  }
>()("@amends-dev/core/workspace/settings/Service") {}
/**
 * Capture bound services; each operation authorizes the actor when it runs.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("WorkspaceSettings.make")(function* () {
  const workspaceStore = yield* WorkspaceStore.WorkspaceStore,
    authorization = yield* Authorization.Authorization,
    delegation = yield* Delegation.Delegation,
    assignmentService = yield* AssignmentService.AssignmentService,
    memberService = yield* MemberService.MemberService,
    journal = yield* Journal.Journal,
    crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;
  const isAllowedBy = <A, R>(effect: Effect.Effect<A, Error, R>) =>
    effect.pipe(
      Effect.as(true),
      Effect.catchTag(
        ["Authorization.Denied", "Delegation.Denied", "Delegation.OwnerProtected"],
        () => Effect.succeed(false),
      ),
    );
  const readWorkspace = Effect.gen(function* () {
    const value = yield* workspaceStore.get;
    if (Option.isNone(value)) return yield* Effect.die("A workspace's record is missing");
    return value.value;
  });
  const renamePermission = Requirement.make(WorkspaceSettingsPermissions.Rename, {
    _tag: "Workspace",
    workspaceId,
  });
  const get = Effect.gen(function* () {
    yield* authorization.require([]);
    const roles = yield* assignmentService.roles;
    const canReadInvitations = yield* isAllowedBy(
      authorization.require([
        Requirement.make(InvitationPermissions.Manage, { _tag: "Workspace", workspaceId }),
      ]),
    );
    return {
      workspace: yield* readWorkspace,
      canRename: yield* isAllowedBy(authorization.require([renamePermission])),
      canReadInvitations,
      canInvite: canReadInvitations && roles.some((role) => role.assignable),
      roles,
    };
  });
  const listing = Effect.gen(function* () {
    const visible = yield* memberService.list;
    const workspace = yield* readWorkspace;
    const actorId = (yield* Actor.Actor).memberId;
    // One grant resolution answers every permission, and role choices load once, so the reads
    // grow with the member count only by each member's assignments.
    const [canManageAny = false, ...permissions] = yield* authorization.permitted([
      Requirement.make(AssignmentPermissions.Manage, { _tag: "Workspace", workspaceId }),
      ...visible.flatMap(({ id: memberId }) => [
        Requirement.make(AssignmentPermissions.Read, { _tag: "Member", workspaceId, memberId }),
        Requirement.make(MemberPermissions.Remove, { _tag: "Member", workspaceId, memberId }),
      ]),
    ]);
    const roles = yield* assignmentService.roles;
    return yield* Effect.forEach(visible, (member, index) =>
      Effect.gen(function* () {
        const readable = permissions[index * 2] ?? false,
          removable = permissions[index * 2 + 1] ?? false;
        const active = member.status === "active";
        const change: Delegation.Recipient = {
          workspaceId,
          memberId: member.id,
          ownerId: workspace.ownerMemberId,
          actorId,
          selfRemoval: false,
        };
        const removal: Delegation.Recipient = { ...change, selfRemoval: true };
        const records =
          readable ||
          (active &&
            ((canManageAny && Delegation.recipientNeedsAssignments(change)) ||
              (removable && Delegation.recipientNeedsAssignments(removal))))
            ? yield* delegation.assignmentsFor(member.id)
            : [];
        const canManage =
          active && canManageAny && Delegation.recipientDenial(change, records) === undefined;
        const canRemove =
          active &&
          member.id !== workspace.ownerMemberId &&
          removable &&
          Delegation.recipientDenial(removal, records) === undefined;
        return {
          member,
          access: readable
            ? Assignment.Access.make({ assignments: records, roles, canManage })
            : null,
          canRemove,
        };
      }),
    );
  });
  const rename = Effect.fn("WorkspaceSettings.rename")(
    function* (input: WorkspaceSettings.RenameInput) {
      const request = yield* Schema.decodeEffect(WorkspaceSettings.RenameInput)(input);
      yield* authorization.require([renamePermission]);
      const workspace = yield* readWorkspace;
      if (workspace.name === request.name) return workspace;
      if (workspace.name !== request.expectedName) return yield* new Changed({ workspaceId });
      yield* journal.publish(WorkspaceFacts.Renamed, {
        workspaceId,
        previousName: workspace.name,
        name: request.name,
      });
      return Object.assign({}, workspace, { name: request.name });
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return WorkspaceSettingsService.of({ get, members: listing, rename });
});
/**
 * Provide the settings operations over the workspace store, the member and assignment operations,
 * authorization, and delegation.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(WorkspaceSettingsService, make());
