import * as Target from "./Target.ts";
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Actor from "../identity/Actor.ts";
import * as Identity from "../identity/Identity.ts";
import * as MemberStore from "../workspace/MemberStore.ts";

import * as Workspace from "../workspace/Workspace.ts";
import * as Grant from "./Grant.ts";
import * as GrantResolver from "./GrantResolver.ts";
import * as PermissionCatalog from "./PermissionCatalog.ts";
import * as Requirement from "./Requirement.ts";

import { Denied, InvalidActor } from "./AuthorizationErrors.ts";
import * as Store from "../journal/Store.ts";
export { Denied, InvalidActor } from "./AuthorizationErrors.ts";

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "Authorization.WorkspaceMismatch",
  { expectedWorkspaceId: Workspace.Id, actualWorkspaceId: Workspace.Id },
) {}

export type Error =
  | MemberStore.Failure
  | GrantResolver.Error
  | PermissionCatalog.Unknown
  | WorkspaceMismatch
  | InvalidActor
  | Denied;

export class Authorization extends Context.Service<
  Authorization,
  {
    /**
     * Check the current actor and require every declared permission on its target.
     * Reads check current state without opening a transaction. Write operations
     * must run this check and their mutation inside the same commit. An empty list
     * checks active membership only. Target existence and business rules belong to
     * the application operation.
     */
    readonly require: (
      requirements: ReadonlyArray<Requirement.Value>,
    ) => Effect.Effect<void, Error, Actor.Actor>;
    /**
     * The same actor check, then whether a current grant covers each requirement, in order, from
     * one grant resolution. Lists use it to keep only permitted items instead of failing on the
     * first; an invalid actor still fails.
     */
    readonly permitted: (
      requirements: ReadonlyArray<Requirement.Value>,
    ) => Effect.Effect<ReadonlyArray<boolean>, Exclude<Error, Denied>, Actor.Actor>;
  }
>()("@amends-dev/core/authorization/authorization/Service") {}

const sameIdentity = Schema.toEquivalence(Identity.Reference);
const requireWorkspace = Effect.fnUntraced(function* (
  expectedWorkspaceId: Workspace.Id,
  actualWorkspaceId: Workspace.Id,
) {
  if (expectedWorkspaceId !== actualWorkspaceId) {
    return yield* new WorkspaceMismatch({ expectedWorkspaceId, actualWorkspaceId });
  }
});

/**
 * Construct authorization from workspace dependencies; read actor and transaction context per call.
 *
 * @category constructors
 */
export const make = Effect.fn("Authorization.make")(function* (): Effect.fn.Return<
  Authorization["Service"],
  never,
  | MemberStore.MemberStore
  | GrantResolver.GrantResolver
  | PermissionCatalog.PermissionCatalog
  | Store.Store
> {
  const memberStore = yield* MemberStore.MemberStore;
  const grantResolver = yield* GrantResolver.GrantResolver;
  const permissionCatalog = yield* PermissionCatalog.PermissionCatalog;
  const { workspaceId } = yield* Store.Store;

  /** Validate the actor, and that each requirement names a declared permission in this workspace. */
  const validateRequirements = Effect.fnUntraced(function* (
    requirements: ReadonlyArray<Requirement.Value>,
  ) {
    const actor = yield* Actor.Actor;
    yield* requireWorkspace(workspaceId, actor.workspaceId);
    const found = yield* memberStore.get(actor.memberId);
    if (Option.isNone(found)) {
      return yield* new InvalidActor({ memberId: actor.memberId, reason: "membership-missing" });
    }
    const member = found.value;
    if (member.status !== "active") {
      return yield* new InvalidActor({ memberId: actor.memberId, reason: "membership-removed" });
    }
    if (!sameIdentity(member.identity, actor.identity)) {
      return yield* new InvalidActor({ memberId: actor.memberId, reason: "identity-mismatch" });
    }

    for (const requirement of requirements) {
      yield* requireWorkspace(workspaceId, requirement.target.workspaceId);
      const permission = yield* permissionCatalog.get(requirement.permission.name);
      // Requirements name permissions as the catalog declares them; another target kind is a bug.
      if (!Target.Reference.isAnyOf([permission.targetKind])(requirement.target))
        return yield* Effect.die(
          `Permission ${permission.name} requires a ${permission.targetKind} target`,
        );
    }
    return { actor, checked: requirements };
  });

  const requirePermissions = Effect.fn("Authorization.require")(function* (
    requirements: ReadonlyArray<Requirement.Value>,
  ) {
    const { actor, checked } = yield* validateRequirements(requirements);
    if (checked.length === 0) return;
    const grants = yield* grantResolver.resolve(actor.memberId);
    for (const requirement of checked)
      if (!Grant.anyCovers(grants, requirement))
        return yield* new Denied({ memberId: actor.memberId, requirement });
  });
  const permitted = Effect.fn("Authorization.permitted")(function* (
    requirements: ReadonlyArray<Requirement.Value>,
  ) {
    const { actor, checked } = yield* validateRequirements(requirements);
    if (checked.length === 0) return [];
    const grants = yield* grantResolver.resolve(actor.memberId);
    return checked.map((requirement) => Grant.anyCovers(grants, requirement));
  });

  return Authorization.of({ require: requirePermissions, permitted });
});

/**
 * Provide authorization over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Authorization, make());

/**
 * Require an action on a target the actor may read, in one grant resolution. A target they can't
 * read fails with `hidden`, so they learn nothing of it; one they can read but not act on is
 * denied.
 */
export const requireVisible = Effect.fnUntraced(function* <E>(
  authorization: Authorization["Service"],
  read: Requirement.Value,
  action: Requirement.Value,
  hidden: () => E,
) {
  const [readable = false, permitted = false] = yield* authorization.permitted([read, action]);
  if (!readable) return yield* Effect.fail(hidden());
  if (!permitted) yield* authorization.require([action]);
});
