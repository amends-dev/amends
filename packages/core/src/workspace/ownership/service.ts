import * as Identity from "../../identity/identity.ts";
import * as Assignment from "../../authorization/assignment/assignment.ts";
import * as Scope from "../../authorization/scope.ts";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";

import * as AssignmentStore from "../../authorization/assignment/store.ts";
import * as Authorization from "../../authorization/authorization.ts";
import * as Delegation from "../../authorization/delegation.ts";
import * as AssignmentCommand from "../../authorization/assignment/command.ts";
import * as Requirement from "../../authorization/requirement.ts";
import * as BuiltinRoles from "../../authorization/role/builtin.ts";

import * as Actor from "../../identity/actor.ts";
import * as Journal from "../../journal/journal.ts";
import * as Publication from "../../journal/publication.ts";
import type * as Log from "../../journal/log.ts";
import type * as Projection from "../../journal/projection.ts";
import * as Store from "../../journal/store.ts";
import * as WorkspaceFacts from "../facts.ts";
import * as Member from "../member/member.ts";
import * as MemberStore from "../member/store.ts";
import * as WorkspaceStore from "../store.ts";
import * as Workspace from "../workspace.ts";
import * as Ownership from "./ownership.ts";
import * as OwnershipPermissions from "./permissions.ts";
import { Changed, InvalidRecipient, MemberNotFound, NotOwner } from "./errors.ts";
export { Changed, InvalidRecipient, MemberNotFound, NotOwner } from "./errors.ts";

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
export class OwnershipService extends Context.Service<
  OwnershipService,
  {
    readonly get: Effect.Effect<Ownership.View, Error, Actor.Actor>;
    readonly transfer: (
      input: Ownership.TransferInput,
    ) => Effect.Effect<Workspace.Record, Error, Actor.Actor>;
  }
>()("@amends-dev/core/workspace/ownership-application/Service") {}

/** Construct ownership operations over one workspace's journal and access policy. @category constructors */
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
            Scope.Value.isAnyOf(["Workspace"])(source.scope) &&
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

/** @category layers */
export const layer = Layer.effect(OwnershipService, make());
