import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Assignment } from "../../authorization/assignment/assignment.ts";
import { AssignmentService } from "../../authorization/assignment/service.ts";
import { AssignmentPermissions } from "../../authorization/assignment/permissions.ts";
import { Authorization } from "../../authorization/authorization.ts";
import { Delegation } from "../../authorization/delegation.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Store } from "../../journal/store.ts";
import { MemberService } from "../member/service.ts";
import { MemberPermissions } from "../member/permissions.ts";
import { InvitationPermissions } from "../invitation/permissions.ts";
import { WorkspaceStore } from "../store.ts";
import { WorkspaceFacts } from "../facts.ts";
import { Workspace } from "../workspace.ts";
import { WorkspaceSettings } from "./settings.ts";
import { WorkspaceSettingsPermissions } from "./permissions.ts";
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
export interface Interface {
  readonly get: Effect.Effect<WorkspaceSettings.View, Error, Actor.Service>;
  readonly members: Effect.Effect<
    ReadonlyArray<WorkspaceSettings.MemberEntry>,
    Error,
    Actor.Service
  >;
  readonly rename: (
    input: WorkspaceSettings.RenameInput,
  ) => Effect.Effect<Workspace.Record, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/workspace/settings/Service",
) {}
/** @category constructors */
export const make = Effect.fn("WorkspaceSettings.make")(function* () {
  const workspaceStore = yield* WorkspaceStore.Service,
    authorization = yield* Authorization.Service,
    delegation = yield* Delegation.Service,
    assignmentService = yield* AssignmentService.Service,
    memberService = yield* MemberService.Service,
    journal = yield* Journal.Service,
    crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
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
    const actorId = (yield* Actor.Service).memberId;
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
  return Service.of({ get, members: listing, rename });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as WorkspaceSettingsService from "./service.ts";
