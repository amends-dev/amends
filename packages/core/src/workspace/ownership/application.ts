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
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { WorkspaceFacts } from "../facts.ts";
import { Member } from "../member/member.ts";
import { MemberStore } from "../member/store.ts";
import { WorkspaceStore } from "../store.ts";
import { Workspace } from "../workspace.ts";
import { Ownership } from "./ownership.ts";
import { OwnershipPermissions } from "./permissions.ts";

export class NotOwner extends Schema.TaggedError<NotOwner>()("OwnershipApplication.NotOwner", {
  workspaceId: Workspace.Id,
}) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "OwnershipApplication.MemberNotFound",
  { memberId: Member.Id },
) {}
export class InvalidRecipient extends Schema.TaggedError<InvalidRecipient>()(
  "OwnershipApplication.InvalidRecipient",
  {
    memberId: Member.Id,
    reason: Schema.Literals(["same-owner", "removed", "agent"]),
  },
) {}
export class Changed extends Schema.TaggedError<Changed>()("OwnershipApplication.Changed", {
  workspaceId: Workspace.Id,
}) {}
export class InvalidState extends Schema.TaggedError<InvalidState>()(
  "OwnershipApplication.InvalidState",
  { message: Schema.String },
) {}
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
  | Changed
  | InvalidState;
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
  InvalidState,
  | WorkspaceStore.Service
  | MemberStore.Service
  | AssignmentStore.Service
  | Authorization.Service
  | Delegation.Service
  | Journal.Service
  | Crypto.Crypto
> {
  const workspace = yield* WorkspaceStore.Service;
  const members = yield* MemberStore.Service;
  const assignments = yield* AssignmentStore.Service;
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = workspace.workspaceId;
  if (
    [
      members.workspaceId,
      assignments.workspaceId,
      authorization.workspaceId,
      delegation.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidState({
      message: "Ownership services belong to different workspaces",
    });
  const requirement = Requirement.make(OwnershipPermissions.Transfer, {
    _tag: "Workspace",
    workspaceId,
  });
  const loadMember = Effect.fn("OwnershipApplication.loadMember")(function* (memberId: Member.Id) {
    const found = yield* members.get(memberId);
    if (Option.isNone(found)) return yield* new MemberNotFound({ memberId });
    const member = yield* Schema.decodeEffect(Member.Record)(found.value);
    if (member.id !== memberId || member.workspaceId !== workspaceId)
      return yield* new InvalidState({
        message: "Member store returned a different member or workspace",
      });
    return member;
  });
  const current = Effect.gen(function* () {
    const found = yield* workspace.get;
    if (Option.isNone(found))
      return yield* new InvalidState({ message: "Workspace metadata is missing" });
    const record = yield* Schema.decodeEffect(Workspace.Record)(found.value);
    if (record.id !== workspaceId)
      return yield* new InvalidState({ message: "Workspace metadata is mismatched" });
    const owner = yield* loadMember(record.ownerMemberId).pipe(
      Effect.catchTag("OwnershipApplication.MemberNotFound", () =>
        Effect.fail(new InvalidState({ message: "Owner membership is missing" })),
      ),
    );
    if (owner.status !== "active" || owner.identity._tag !== "Human")
      return yield* new InvalidState({ message: "The owner must be an active human member" });
    const records = yield* Schema.decodeEffect(Schema.Array(Assignment.Record))(
      yield* assignments.listActiveByRole(BuiltinRoles.OwnerId),
    );
    const assignment = records[0];
    if (
      records.length !== 1 ||
      assignment === undefined ||
      assignment.workspaceId !== workspaceId ||
      assignment.memberId !== owner.id ||
      assignment.status !== "active" ||
      assignment.source._tag !== "Role" ||
      assignment.source.roleId !== BuiltinRoles.OwnerId ||
      assignment.source.scope._tag !== "Workspace"
    )
      return yield* new InvalidState({
        message: "Ownership requires exactly one matching workspace Owner assignment",
      });
    return { workspace: record, owner, assignment };
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
    const candidates: Array<Member.Record> = [];
    if (canTransfer) {
      const seen = new Set<Member.Id>();
      for (const input of yield* members.list) {
        const member = yield* Schema.decodeEffect(Member.Record)(input);
        if (member.workspaceId !== workspaceId || seen.has(member.id))
          return yield* new InvalidState({ message: "Member listing is inconsistent" });
        seen.add(member.id);
        if (
          member.status === "active" &&
          member.identity._tag === "Human" &&
          member.id !== state.owner.id
        )
          candidates.push(member);
      }
    }
    return Ownership.View.make({
      workspace: state.workspace,
      owner: state.owner,
      ownerAssignmentId: state.assignment.id,
      canTransfer,
      candidates,
    });
  }).pipe(journal.commit, Effect.withSpan("OwnershipApplication.get"));
  const builtins = [BuiltinRoles.ViewerId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId];
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
  const transfer = Effect.fn("OwnershipApplication.transfer")(function* (
    input: Ownership.TransferInput,
  ) {
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
      return yield* new InvalidState({
        message: "The Owner role must retain ownership-transfer permission",
      });
    // Replace built-in workspace roles only. Direct grants and scoped assignments retain their identity.
    const previousAssignments = yield* delegation.assignmentsFor(state.owner.id);
    const recipientAssignments = yield* delegation.assignmentsFor(recipient.id);
    const sameAssignment = Schema.toEquivalence(Assignment.Record);
    if (
      !previousAssignments.some((record) => sameAssignment(record, state.assignment)) ||
      recipientAssignments.some(
        ({ source }) => source._tag === "Role" && source.roleId === BuiltinRoles.OwnerId,
      )
    )
      return yield* new InvalidState({ message: "Owner assignment listings disagree" });
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
    const updated = yield* current;
    if (
      updated.owner.id !== recipient.id ||
      updated.workspace.name !== state.workspace.name ||
      updated.workspace.createdBy !== state.workspace.createdBy
    )
      return yield* new InvalidState({
        message: "Ownership transfer changed unrelated metadata or the wrong owner",
      });
    return updated.workspace;
  }, journal.commit);
  return Service.of({ get, transfer });
});

/** @category layers */
export const layer = Layer.effect(Service, make());
export * as OwnershipApplication from "./application.ts";
