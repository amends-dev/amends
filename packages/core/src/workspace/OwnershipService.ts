/**
 * The operations on ownership an actor calls: reading who owns the workspace, and transferring
 * ownership to another active human member. A transfer replaces both members' built-in workspace
 * roles through `AssignmentCommand` and records `WorkspaceFacts.OwnershipTransferred` in one
 * commit; only initialization and this transfer establish Owner access.
 *
 * @since 0.1.0
 */
import * as Identity from "../identity/Identity.ts";
import * as Assignment from "../authorization/Assignment.ts";
import * as Scope from "../authorization/Scope.ts";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";

import * as AssignmentStore from "../authorization/AssignmentStore.ts";
import * as Authorization from "../authorization/Authorization.ts";
import * as Delegation from "../authorization/Delegation.ts";
import * as AssignmentCommand from "../authorization/AssignmentCommand.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as BuiltinRoles from "../authorization/BuiltinRoles.ts";

import * as Actor from "../identity/Actor.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import type * as Log from "../journal/Log.ts";
import type * as Projection from "../journal/Projection.ts";
import * as Store from "../journal/Store.ts";
import * as WorkspaceFacts from "./WorkspaceFacts.ts";
import * as Member from "./Member.ts";
import * as MemberStore from "./MemberStore.ts";
import * as WorkspaceStore from "./WorkspaceStore.ts";
import * as Workspace from "./Workspace.ts";
import * as Ownership from "./Ownership.ts";
import * as OwnershipPermissions from "./OwnershipPermissions.ts";

/**
 * The Owner assignment is no longer the one the caller reviewed: ownership moved meanwhile, and
 * nothing was recorded.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("OwnershipService.Changed", {
  workspaceId: Workspace.Id,
}) {}

/**
 * The member cannot become owner: they are the owner already, removed, or an agent, as `reason`
 * says.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidRecipient extends Schema.TaggedError<InvalidRecipient>()(
  "OwnershipService.InvalidRecipient",
  {
    memberId: Member.Id,
    reason: Schema.Literals(["same-owner", "removed", "agent"]),
  },
) {}

/**
 * No membership has the ID given as the recipient.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "OwnershipService.MemberNotFound",
  { memberId: Member.Id },
) {}

/**
 * The actor is not the current owner, or is not a person; only the owner transfers, whatever
 * their grants.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotOwner extends Schema.TaggedError<NotOwner>()("OwnershipService.NotOwner", {
  workspaceId: Workspace.Id,
}) {}

/**
 * What the ownership operations can fail with: the outcomes above, and the failures
 * of what they depend on.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | Delegation.Error
  | WorkspaceStore.Failure
  | MemberStore.Failure
  | Projection.Error
  | Log.WriteError
  | PlatformError.PlatformError
  | NotOwner
  | MemberNotFound
  | InvalidRecipient
  | Changed;

/**
 * The ownership operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class OwnershipService extends Context.Service<
  OwnershipService,
  {
    /**
     * The workspace, its owner, and its current Owner assignment, for any active member. Only the
     * owner, a person holding `workspace.transfer-ownership`, can transfer, and only they receive
     * the candidates: the other active human members.
     */
    readonly get: Effect.Effect<Ownership.View, Error, Actor.Actor>;
    /**
     * Make another active human member the owner, under `workspace.transfer-ownership`, as the
     * current owner (otherwise `NotOwner`), and against the Owner assignment the caller reviewed
     * (otherwise `Changed`). One commit revokes both members' built-in workspace roles, makes the
     * recipient Owner and the former owner Administrator, and moves `ownerMemberId`; direct grants,
     * scoped assignments, the name, and `createdBy` stay. Returns the workspace as it now stands.
     */
    readonly transfer: (
      input: Ownership.TransferInput,
    ) => Effect.Effect<Workspace.Workspace, Error, Actor.Actor>;
  }
>()("@amends-dev/core/workspace/OwnershipService") {}

/**
 * Construct ownership operations over one workspace's journal and access policy.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("OwnershipService.make")(function* (): Effect.fn.Return<
  OwnershipService["Service"],
  never,
  | WorkspaceStore.WorkspaceStore
  | MemberStore.MemberStore
  | AssignmentStore.AssignmentStore
  | Authorization.Authorization
  | Delegation.Delegation
  | AssignmentCommand.AssignmentCommand
  | Journal.Journal
  | Crypto.Crypto
  | Store.Store
> {
  const workspaceStore = yield* WorkspaceStore.WorkspaceStore;
  const memberStore = yield* MemberStore.MemberStore;
  const assignmentStore = yield* AssignmentStore.AssignmentStore;
  const authorization = yield* Authorization.Authorization;
  const delegation = yield* Delegation.Delegation;
  const assignmentCommand = yield* AssignmentCommand.AssignmentCommand;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;
  const requirement = Requirement.make(OwnershipPermissions.Transfer, {
    _tag: "Workspace",
    workspaceId,
  });
  const requireMember = Effect.fn("OwnershipService.requireMember")(function* (
    memberId: Member.Id,
  ) {
    const found = yield* memberStore.get(memberId);
    if (Option.isNone(found)) return yield* new MemberNotFound({ memberId });
    return found.value;
  });
  const readCurrentOwnership = Effect.gen(function* () {
    const found = yield* workspaceStore.get;
    if (Option.isNone(found)) return yield* Effect.die("A workspace's record is missing");
    const owner = yield* memberStore.get(found.value.ownerMemberId);
    const [assignment] = yield* assignmentStore.listActiveByRole(BuiltinRoles.OwnerId);
    if (Option.isNone(owner) || assignment === undefined)
      return yield* Effect.die("A workspace's owner or its Owner assignment is missing");
    return { workspace: found.value, owner: owner.value, assignment };
  });
  const get = Effect.gen(function* () {
    yield* authorization.require([]);
    const state = yield* readCurrentOwnership;
    const actor = yield* Actor.Actor;
    const canTransfer =
      actor.memberId === state.owner.id &&
      Identity.MemberReference.isAnyOf(["Human"])(actor.identity) &&
      (yield* authorization.require([requirement]).pipe(
        Effect.as(true),
        Effect.catchTag("Authorization.Denied", () => Effect.succeed(false)),
      ));
    const candidates = canTransfer
      ? (yield* memberStore.list).filter(
          (member) =>
            member.status === "active" &&
            Identity.MemberReference.isAnyOf(["Human"])(member.identity) &&
            member.id !== state.owner.id,
        )
      : [];
    return Ownership.View.make({
      workspace: state.workspace,
      owner: state.owner,
      ownerAssignmentId: state.assignment.id,
      canTransfer,
      candidates,
    });
  }).pipe(Effect.withSpan("OwnershipService.get"));
  const builtins = [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId];
  const transfer = Effect.fn("OwnershipService.transfer")(
    function* (input: Ownership.TransferInput) {
      yield* authorization.require([requirement]);
      const request = yield* Schema.decodeEffect(Ownership.TransferInput)(input);
      const state = yield* readCurrentOwnership;
      const actor = yield* Actor.Actor;
      if (
        actor.memberId !== state.owner.id ||
        !Identity.MemberReference.isAnyOf(["Human"])(actor.identity)
      )
        return yield* new NotOwner({ workspaceId });
      if (request.expectedOwnerAssignmentId !== state.assignment.id)
        return yield* new Changed({ workspaceId });
      if (request.memberId === state.owner.id)
        return yield* new InvalidRecipient({ memberId: request.memberId, reason: "same-owner" });
      const recipient = yield* requireMember(request.memberId);
      if (recipient.status !== "active")
        return yield* new InvalidRecipient({ memberId: recipient.id, reason: "removed" });
      if (!Identity.MemberReference.isAnyOf(["Human"])(recipient.identity))
        return yield* new InvalidRecipient({ memberId: recipient.id, reason: "agent" });
      const ownerRole = yield* delegation.loadRole(BuiltinRoles.OwnerId);
      yield* delegation.loadRole(BuiltinRoles.AdministratorId);
      if (!ownerRole.permissions.includes(OwnershipPermissions.Transfer.name))
        return yield* Effect.die("The Owner role must keep the ownership-transfer permission");
      // Replace built-in workspace roles only. Direct grants and scoped assignments retain their identity.
      const previousAssignments = yield* delegation.assignmentsFor(state.owner.id);
      const recipientAssignments = yield* delegation.assignmentsFor(recipient.id);
      for (const records of [previousAssignments, recipientAssignments]) {
        for (const assignment of records) {
          const source = assignment.source;
          if (
            Assignment.Source.isAnyOf(["Role"])(source) &&
            Scope.Scope.isAnyOf(["Workspace"])(source.scope) &&
            builtins.includes(source.roleId)
          )
            yield* assignmentCommand.revokeAssignment(assignment);
        }
      }
      yield* assignmentCommand.assignRole(state.owner.id, BuiltinRoles.AdministratorId);
      yield* assignmentCommand.assignRole(recipient.id, BuiltinRoles.OwnerId);
      yield* journal.publish(WorkspaceFacts.OwnershipTransferred, {
        workspaceId,
        previousOwnerMemberId: state.owner.id,
        ownerMemberId: recipient.id,
      });
      return (yield* readCurrentOwnership).workspace;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return OwnershipService.of({ get, transfer });
});

/**
 * Provide the ownership operations over the workspace, member, and assignment stores, the
 * assignment writes, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(OwnershipService, make());
