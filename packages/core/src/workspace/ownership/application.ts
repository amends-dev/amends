import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Assignment } from "../../authorization/assignment/assignment.ts";
import { AssignmentFacts } from "../../authorization/assignment/facts.ts";
import { AssignmentStore } from "../../authorization/assignment/store.ts";
import { Authorization } from "../../authorization/authorization.ts";
import { Delegation } from "../../authorization/delegation.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { BuiltinRoles } from "../../authorization/role/builtin.ts";
import type { Role } from "../../authorization/role/role.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Store } from "../../journal/store.ts";
import { WorkspaceFacts } from "../facts.ts";
import { Member } from "../member/member.ts";
import { MemberStore } from "../member/store.ts";
import { WorkspaceStore } from "../store.ts";
import { Workspace } from "../workspace.ts";
import { Ownership } from "./ownership.ts";
import { OwnershipPermissions } from "./permissions.ts";
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
export interface Interface {
  readonly get: Effect.Effect<Ownership.View, Error, Actor.Service>;
  readonly transfer: (
    input: Ownership.TransferInput,
  ) => Effect.Effect<Workspace.Record, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/workspace/ownership-application/Service",
) {}

/** Construct ownership operations over one workspace's journal and access policy. @category constructors */
export const make = Effect.fn("OwnershipApplication.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  | WorkspaceStore.Service
  | MemberStore.Service
  | AssignmentStore.Service
  | Authorization.Service
  | Delegation.Service
  | Journal.Service
  | Crypto.Crypto
  | Store.Service
> {
  const workspaceStore = yield* WorkspaceStore.Service;
  const memberStore = yield* MemberStore.Service;
  const assignmentStore = yield* AssignmentStore.Service;
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
  const requirement = Requirement.make(OwnershipPermissions.Transfer, {
    _tag: "Workspace",
    workspaceId,
  });
  const loadMember = Effect.fn("OwnershipApplication.loadMember")(function* (memberId: Member.Id) {
    const found = yield* memberStore.get(memberId);
    if (Option.isNone(found)) return yield* new MemberNotFound({ memberId });
    return found.value;
  });
  const current = Effect.gen(function* () {
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
    const state = yield* current;
    const actor = yield* Actor.Service;
    const canTransfer =
      actor.memberId === state.owner.id &&
      actor.identity._tag === "Human" &&
      (yield* authorization.require([requirement]).pipe(
        Effect.as(true),
        Effect.catchTag("Authorization.Denied", () => Effect.succeed(false)),
      ));
    const candidates = canTransfer
      ? (yield* memberStore.list).filter(
          (member) =>
            member.status === "active" &&
            member.identity._tag === "Human" &&
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
  }).pipe(Effect.withSpan("OwnershipApplication.get"));
  const builtins = [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId];
  const createAssignment = Effect.fn("OwnershipApplication.createAssignment")(function* (
    memberId: Member.Id,
    roleId: Role.Id,
  ) {
    yield* journal.publish(AssignmentFacts.Created, {
      assignmentId: Assignment.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      memberId,
      source: Assignment.Source.cases.Role.make({
        roleId,
        scope: { _tag: "Workspace", workspaceId },
      }),
    });
  });
  const transfer = Effect.fn("OwnershipApplication.transfer")(
    function* (input: Ownership.TransferInput) {
      yield* authorization.require([requirement]);
      const request = yield* Schema.decodeEffect(Ownership.TransferInput)(input);
      const state = yield* current;
      const actor = yield* Actor.Service;
      if (actor.memberId !== state.owner.id || actor.identity._tag !== "Human")
        return yield* new NotOwner({ workspaceId });
      if (request.expectedOwnerAssignmentId !== state.assignment.id)
        return yield* new Changed({ workspaceId });
      if (request.memberId === state.owner.id)
        return yield* new InvalidRecipient({ memberId: request.memberId, reason: "same-owner" });
      const recipient = yield* loadMember(request.memberId);
      if (recipient.status !== "active")
        return yield* new InvalidRecipient({ memberId: recipient.id, reason: "removed" });
      if (recipient.identity._tag !== "Human")
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
            source._tag === "Role" &&
            source.scope._tag === "Workspace" &&
            builtins.includes(source.roleId)
          )
            yield* journal.publish(AssignmentFacts.Revoked, {
              workspaceId,
              assignmentId: assignment.id,
              memberId: assignment.memberId,
            });
        }
      }
      yield* createAssignment(state.owner.id, BuiltinRoles.AdministratorId);
      yield* createAssignment(recipient.id, BuiltinRoles.OwnerId);
      yield* journal.publish(WorkspaceFacts.OwnershipTransferred, {
        workspaceId,
        previousOwnerMemberId: state.owner.id,
        ownerMemberId: recipient.id,
      });
      return (yield* current).workspace;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ get, transfer });
});

/** @category layers */
export const layer = Layer.effect(Service, make());
export * as OwnershipApplication from "./application.ts";
