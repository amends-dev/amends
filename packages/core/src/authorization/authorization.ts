import { Context, Effect, Layer, Option, Schema } from "effect";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { MemberStore } from "../workspace/member/store.ts";

import { Workspace } from "../workspace/workspace.ts";
import type { Grant } from "./grant.ts";
import { GrantResolver } from "./grant-resolver.ts";
import { PermissionCatalog } from "./permission-catalog.ts";
import { Requirement } from "./requirement.ts";
import { Scope } from "./scope.ts";
import { Denied, InvalidActor } from "./errors.ts";
import { Store } from "../journal/store.ts";
export { Denied, InvalidActor } from "./errors.ts";

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

export interface Interface {
  /**
   * Check the current actor and require every declared permission on its target.
   * Reads check current state without opening a transaction. Write operations
   * must run this check and their mutation inside the same commit. An empty list
   * checks active membership only. Target existence and business rules belong to
   * the application operation.
   */
  readonly require: (
    requirements: ReadonlyArray<Requirement.Value>,
  ) => Effect.Effect<void, Error, Actor.Service>;
  /**
   * The same actor check, then whether a current grant covers each requirement, in order, from
   * one grant resolution. Lists use it to keep only permitted items instead of failing on the
   * first; an invalid actor still fails.
   */
  readonly permitted: (
    requirements: ReadonlyArray<Requirement.Value>,
  ) => Effect.Effect<ReadonlyArray<boolean>, Exclude<Error, Denied>, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/authorization/Service",
) {}

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
  Interface,
  never,
  MemberStore.Service | GrantResolver.Service | PermissionCatalog.Service | Store.Service
> {
  const memberStore = yield* MemberStore.Service;
  const grantResolver = yield* GrantResolver.Service;
  const permissionCatalog = yield* PermissionCatalog.Service;
  const { workspaceId } = yield* Store.Service;

  /** Validate the actor, and that each requirement names a declared permission in this workspace. */
  const check = Effect.fnUntraced(function* (requirements: ReadonlyArray<Requirement.Value>) {
    const actor = yield* Actor.Service;
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
      if (permission.targetKind !== requirement.target._tag)
        return yield* Effect.die(
          `Permission ${permission.name} requires a ${permission.targetKind} target`,
        );
    }
    return { actor, checked: requirements };
  });
  const covered = (grants: ReadonlyArray<Grant.Value>, requirement: Requirement.Value) =>
    grants.some(
      (grant) =>
        grant.permission === requirement.permission.name &&
        Scope.covers(grant.scope, requirement.target),
    );

  const requirePermissions = Effect.fn("Authorization.require")(function* (
    requirements: ReadonlyArray<Requirement.Value>,
  ) {
    const { actor, checked } = yield* check(requirements);
    if (checked.length === 0) return;
    const grants = yield* grantResolver.resolve(actor.memberId);
    for (const requirement of checked)
      if (!covered(grants, requirement))
        return yield* new Denied({ memberId: actor.memberId, requirement });
  });
  const permitted = Effect.fn("Authorization.permitted")(function* (
    requirements: ReadonlyArray<Requirement.Value>,
  ) {
    const { actor, checked } = yield* check(requirements);
    if (checked.length === 0) return [];
    const grants = yield* grantResolver.resolve(actor.memberId);
    return checked.map((requirement) => covered(grants, requirement));
  });

  return Service.of({ require: requirePermissions, permitted });
});

/**
 * Provide authorization over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as Authorization from "./authorization.ts";
