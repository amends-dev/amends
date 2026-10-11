import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import * as Assignment from "../../authorization/assignment/assignment.ts";
import * as AssignmentService from "../../authorization/assignment/service.ts";
import * as AssignmentPermissions from "../../authorization/assignment/permissions.ts";
import * as Authorization from "../../authorization/authorization.ts";
import * as Delegation from "../../authorization/delegation.ts";
import * as Requirement from "../../authorization/requirement.ts";
import * as Actor from "../../identity/actor.ts";
import * as Journal from "../../journal/journal.ts";
import * as Publication from "../../journal/publication.ts";
import type * as Log from "../../journal/log.ts";
import type * as Projection from "../../journal/projection.ts";
import * as Store from "../../journal/store.ts";
import * as MemberService from "../member/service.ts";
import * as MemberPermissions from "../member/permissions.ts";
import * as InvitationPermissions from "../invitation/permissions.ts";
import * as WorkspaceStore from "../store.ts";
import * as WorkspaceFacts from "../facts.ts";
import * as Workspace from "../workspace.ts";
import * as WorkspaceSettings from "./settings.ts";
import * as WorkspaceSettingsPermissions from "./permissions.ts";
import { Changed } from "./errors.ts";
export { Changed } from "./errors.ts";
export type Error =
  | AssignmentService.Error
  | MemberService.Error
  | WorkspaceStore.Failure
  | Schema.SchemaError
  | Changed
  | Projection.Error
  | Log.WriteError
  | PlatformError.PlatformError;
export class WorkspaceSettingsService extends Context.Service<
  WorkspaceSettingsService,
  {
    readonly get: Effect.Effect<WorkspaceSettings.View, Error, Actor.Actor>;
    readonly members: Effect.Effect<
      ReadonlyArray<WorkspaceSettings.MemberEntry>,
      Error,
      Actor.Actor
    >;
    readonly rename: (
      input: WorkspaceSettings.RenameInput,
    ) => Effect.Effect<Workspace.Record, Error, Actor.Actor>;
  }
>()("@amends-dev/core/workspace/settings/Service") {}
/** @category constructors */
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
/** @category layers */
export const layer = Layer.effect(WorkspaceSettingsService, make());
