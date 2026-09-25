import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AssignmentApplication } from "../../authorization/assignment/application.ts";
import { Authorization } from "../../authorization/authorization.ts";
import { Delegation } from "../../authorization/delegation.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { MemberApplication } from "../member/application.ts";
import { MemberPermissions } from "../member/permissions.ts";
import { InvitationPermissions } from "../invitation/permissions.ts";
import { WorkspaceStore } from "../store.ts";
import { WorkspaceFacts } from "../facts.ts";
import { Workspace } from "../workspace.ts";
import { WorkspaceSettings } from "./settings.ts";
import { WorkspaceSettingsPermissions } from "./permissions.ts";
import { Changed, InvalidState } from "./errors.ts";
export { Changed, InvalidState } from "./errors.ts";
export type Error =
  | AssignmentApplication.Error
  | MemberApplication.Error
  | WorkspaceStore.Failure
  | Schema.SchemaError
  | Changed
  | InvalidState
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
  "@amends/core/workspace/settings/Service",
) {}
/** @category constructors */
export const make = Effect.fn("WorkspaceSettings.make")(function* () {
  const store = yield* WorkspaceStore.Service,
    authorization = yield* Authorization.Service,
    delegation = yield* Delegation.Service,
    assignments = yield* AssignmentApplication.Service,
    members = yield* MemberApplication.Service,
    journal = yield* Journal.Service,
    crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [store.workspaceId, members.workspaceId, delegation.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidState({ message: "Services belong to different workspaces" });
  const allowed = <A, R>(effect: Effect.Effect<A, Error, R>) =>
    effect.pipe(
      Effect.as(true),
      Effect.catchTag(
        ["Authorization.Denied", "Delegation.Denied", "Delegation.OwnerProtected"],
        () => Effect.succeed(false),
      ),
    );
  const load = Effect.gen(function* () {
    const value = yield* store.get;
    if (Option.isNone(value))
      return yield* new InvalidState({ message: "Workspace metadata is missing" });
    const workspace = yield* Schema.decodeEffect(Workspace.Record)(value.value);
    if (workspace.id !== workspaceId)
      return yield* new InvalidState({
        message: "Workspace metadata belongs to another workspace",
      });
    return workspace;
  });
  const renamePermission = Requirement.make(WorkspaceSettingsPermissions.Rename, {
    _tag: "Workspace",
    workspaceId,
  });
  const get = Effect.gen(function* () {
    yield* authorization.require([]);
    const roles = yield* assignments.roles;
    const canReadInvitations = yield* allowed(
      authorization.require([
        Requirement.make(InvitationPermissions.Manage, { _tag: "Workspace", workspaceId }),
      ]),
    );
    return {
      workspace: yield* load,
      canRename: yield* allowed(authorization.require([renamePermission])),
      canReadInvitations,
      canInvite: canReadInvitations && roles.some((role) => role.assignable),
      roles,
    };
  });
  const listing = Effect.gen(function* () {
    const visible = yield* members.list;
    const workspace = yield* load;
    return yield* Effect.forEach(visible, (member) =>
      Effect.gen(function* () {
        const access = yield* assignments
          .list(member.id)
          .pipe(Effect.catchTag("Authorization.Denied", () => Effect.succeed(null)));
        const canRemove =
          member.status === "active" &&
          member.id !== workspace.ownerMemberId &&
          (yield* allowed(
            authorization
              .require([
                Requirement.make(MemberPermissions.Remove, {
                  _tag: "Member",
                  workspaceId,
                  memberId: member.id,
                }),
              ])
              .pipe(Effect.andThen(delegation.requireRemoval(member.id))),
          ));
        return { member, access, canRemove };
      }),
    );
  });
  const rename = Effect.fn("WorkspaceSettings.rename")(
    function* (input: WorkspaceSettings.RenameInput) {
      const request = yield* Schema.decodeEffect(WorkspaceSettings.RenameInput)(input);
      yield* authorization.require([renamePermission]);
      const workspace = yield* load;
      if (workspace.name === request.name) return workspace;
      if (workspace.name !== request.expectedName) return yield* new Changed({ workspaceId });
      yield* journal.publish(WorkspaceFacts.Renamed, {
        workspaceId,
        previousName: workspace.name,
        name: request.name,
      });
      return { ...workspace, name: request.name };
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ get, members: listing, rename });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as WorkspaceSettingsApplication from "./application.ts";
