import { Context, Effect, Layer, Option, Schema } from "effect";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Store } from "../journal/store.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Member } from "../workspace/member/member.ts";
import { Workspace } from "../workspace/workspace.ts";
import { GrantResolver } from "./grant-resolver.ts";
import { PermissionCatalog } from "./permission-catalog.ts";
import { Requirement } from "./requirement.ts";
import { Scope } from "./scope.ts";

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "Authorization.WorkspaceMismatch",
  { expectedWorkspaceId: Workspace.Id, actualWorkspaceId: Workspace.Id },
) {}

export class InvalidActor extends Schema.TaggedError<InvalidActor>()("Authorization.InvalidActor", {
  memberId: Member.Id,
  reason: Schema.Literals(["membership-missing", "membership-removed", "identity-mismatch"]),
}) {}

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "Authorization.InvalidResponse",
  { message: Schema.String },
) {}

export class Denied extends Schema.TaggedError<Denied>()("Authorization.Denied", {
  memberId: Member.Id,
  requirement: Requirement.Value,
}) {}

export type Error =
  | MemberStore.Failure
  | GrantResolver.Error
  | WorkspaceMismatch
  | InvalidActor
  | InvalidResponse
  | Denied;

export interface Interface {
  readonly workspaceId: Workspace.Id;
  /**
   * Check the current actor and require every declared permission on its target.
   * Run this and the protected operation in the same transaction. An empty list
   * checks active membership only. Target existence and business rules belong to
   * the application operation.
   */
  readonly require: (
    requirements: ReadonlyArray<Requirement.Value>,
  ) => Effect.Effect<void, Error, Actor.Service | Store.Transaction>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/authorization/Service",
) {}

const decodeActor = Schema.decodeEffect(Actor.Value);
const decodeMember = Schema.decodeEffect(Member.Record);
const decodeRequirements = Schema.decodeEffect(Schema.Array(Requirement.Value));
const decodeRequirement = Schema.decodeEffect(Requirement.Value);
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
  WorkspaceMismatch,
  MemberStore.Service | GrantResolver.Service | PermissionCatalog.Service
> {
  const members = yield* MemberStore.Service;
  const resolver = yield* GrantResolver.Service;
  const catalog = yield* PermissionCatalog.Service;
  const workspaceId = resolver.workspaceId;
  yield* requireWorkspace(workspaceId, members.workspaceId);

  const requirePermissions = Effect.fn("Authorization.require")(function* (
    requirements: ReadonlyArray<Requirement.Value>,
  ) {
    yield* Store.Transaction;
    const actor = yield* decodeActor(yield* Actor.Service);
    yield* requireWorkspace(workspaceId, actor.workspaceId);
    const found = yield* members.get(actor.memberId);
    if (Option.isNone(found)) {
      return yield* new InvalidActor({ memberId: actor.memberId, reason: "membership-missing" });
    }
    const member = yield* decodeMember(found.value);
    yield* requireWorkspace(workspaceId, member.workspaceId);
    if (member.id !== actor.memberId) {
      return yield* new InvalidResponse({ message: "Member store returned a different member ID" });
    }
    if (member.status !== "active") {
      return yield* new InvalidActor({ memberId: actor.memberId, reason: "membership-removed" });
    }
    if (!sameIdentity(member.identity, actor.identity)) {
      return yield* new InvalidActor({ memberId: actor.memberId, reason: "identity-mismatch" });
    }

    const checked: Array<Requirement.Value> = [];
    for (const requirement of yield* decodeRequirements(requirements)) {
      yield* requireWorkspace(workspaceId, requirement.target.workspaceId);
      const permission = yield* catalog.get(requirement.permission.name);
      if (permission.name !== requirement.permission.name) {
        return yield* new InvalidResponse({
          message: "Permission catalog returned a different name",
        });
      }
      checked.push(yield* decodeRequirement({ permission, target: requirement.target }));
    }
    if (checked.length === 0) return;

    const grants = yield* resolver.resolve(actor.memberId);
    for (const requirement of checked) {
      if (
        !grants.some(
          (grant) =>
            grant.permission === requirement.permission.name &&
            Scope.covers(grant.scope, requirement.target),
        )
      ) {
        return yield* new Denied({ memberId: actor.memberId, requirement });
      }
    }
  });

  return Service.of({ workspaceId, require: requirePermissions });
});

/**
 * Provide authorization over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as Authorization from "./authorization.ts";
