import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Store } from "../../journal/store.ts";
import { Member } from "../../workspace/member/member.ts";
import { MemberStore } from "../../workspace/member/store.ts";
import { Authorization } from "../authorization.ts";
import { Delegation } from "../delegation.ts";
import type { Permission } from "../permission.ts";
import { PermissionCatalog } from "../permission-catalog.ts";
import { Requirement } from "../requirement.ts";
import { BuiltinRoles } from "../role/builtin.ts";
import { Assignment } from "./assignment.ts";
import { AssignmentFacts } from "./facts.ts";
import { AssignmentPermissions } from "./permissions.ts";
import { AssignmentStore } from "./store.ts";
import { Changed, InactiveMember, MemberNotFound, NotFound } from "./errors.ts";
export { Changed, InactiveMember, MemberNotFound, NotFound } from "./errors.ts";

export type Error =
  | Delegation.Error
  | MemberStore.Failure
  | Projection.Error
  | Log.WriteError
  | PlatformError.PlatformError
  | MemberNotFound
  | InactiveMember
  | NotFound
  | Changed;
/** Reading one's own permissions needs only active membership. */
export type PermissionsError = Exclude<Authorization.Error, Authorization.Denied>;
export interface Interface {
  /**
   * What the acting member may do across the whole workspace: each declared workspace permission
   * a current grant covers, in declaration order. Clients offer only the actions it names; the
   * operations still check their own requirements.
   */
  readonly permissions: Effect.Effect<
    ReadonlyArray<Permission.Name>,
    PermissionsError,
    Actor.Service
  >;
  readonly roles: Effect.Effect<ReadonlyArray<Assignment.RoleChoice>, Error, Actor.Service>;
  readonly list: (memberId: Member.Id) => Effect.Effect<Assignment.Access, Error, Actor.Service>;
  readonly assign: (
    input: Assignment.AssignInput,
  ) => Effect.Effect<Assignment.Record, Error, Actor.Service>;
  readonly revoke: (
    memberId: Member.Id,
    assignmentId: Assignment.Id,
  ) => Effect.Effect<Assignment.Record, Error, Actor.Service>;
  readonly change: (
    input: Assignment.ChangeInput,
  ) => Effect.Effect<Assignment.Record, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/authorization/assignment-application/Service",
) {}

/** @category constructors */
export const make = Effect.fn("AssignmentApplication.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  | AssignmentStore.Service
  | MemberStore.Service
  | Authorization.Service
  | Delegation.Service
  | Journal.Service
  | Crypto.Crypto
  | PermissionCatalog.Service
  | Store.Service
> {
  const assignmentStore = yield* AssignmentStore.Service;
  const memberStore = yield* MemberStore.Service;
  const authorization = yield* Authorization.Service;
  const delegation = yield* Delegation.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const permissionCatalog = yield* PermissionCatalog.Service;
  const { workspaceId } = yield* Store.Service;
  const manage = Requirement.make(AssignmentPermissions.Manage, { _tag: "Workspace", workspaceId });
  const workspaceWide = permissionCatalog.definitions.filter(
    (permission) => permission.targetKind === "Workspace",
  );
  const permissions = Effect.gen(function* () {
    const covered = yield* authorization.permitted(
      workspaceWide.map((permission) =>
        Requirement.Value.make({
          permission: { name: permission.name, targetKind: permission.targetKind },
          target: { _tag: "Workspace", workspaceId },
        }),
      ),
    );
    return workspaceWide
      .filter((_, index) => covered[index] === true)
      .map((permission) => permission.name);
  }).pipe(Effect.withSpan("AssignmentApplication.permissions"));
  const member = Effect.fn("AssignmentApplication.member")(function* (memberId: Member.Id) {
    const id = yield* Schema.decodeEffect(Member.Id)(memberId);
    const found = yield* memberStore.get(id);
    if (Option.isNone(found)) return yield* new MemberNotFound({ memberId: id });
    return found.value;
  });
  const recipient = Effect.fn("AssignmentApplication.recipient")(function* (memberId: Member.Id) {
    yield* authorization.require([manage]);
    const record = yield* member(memberId);
    if (record.status !== "active") return yield* new InactiveMember({ memberId });
    yield* delegation.requireRecipient(memberId);
  });
  const allowed = <A, R>(effect: Effect.Effect<A, Error, R>) =>
    effect.pipe(
      Effect.as(true),
      Effect.catchTag(
        ["Authorization.Denied", "Delegation.Denied", "Delegation.OwnerProtected"],
        () => Effect.succeed(false),
      ),
    );
  const choices = Effect.gen(function* () {
    yield* authorization.require([]);
    return yield* Effect.forEach(
      [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId],
      (id) =>
        Effect.gen(function* () {
          const role = yield* delegation.loadRole(id);
          return { role, assignable: yield* allowed(delegation.requireGrant(id)) };
        }),
    );
  });
  const list = Effect.fn("AssignmentApplication.list")(function* (memberId: Member.Id) {
    yield* authorization.require([
      Requirement.make(AssignmentPermissions.Read, { _tag: "Member", workspaceId, memberId }),
    ]);
    const record = yield* member(memberId);
    return Assignment.Access.make({
      assignments: yield* delegation.assignmentsFor(memberId),
      roles: yield* choices,
      canManage: record.status === "active" && (yield* allowed(recipient(memberId))),
    });
  });
  const create = Effect.fn("AssignmentApplication.create")(function* (
    input: Assignment.AssignInput,
  ) {
    const record = Assignment.Record.make({
      id: Assignment.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      memberId: input.memberId,
      status: "active",
      source: Assignment.Source.cases.Role.make({
        roleId: input.roleId,
        scope: { _tag: "Workspace", workspaceId },
      }),
    });
    yield* journal.publish(AssignmentFacts.Created, {
      workspaceId,
      assignmentId: record.id,
      memberId: record.memberId,
      source: record.source,
    });
    return record;
  });
  const workspaceRole = (record: Assignment.Record) =>
    record.source._tag === "Role" && record.source.scope._tag === "Workspace";
  const assign = Effect.fn("AssignmentApplication.assign")(
    function* (input: Assignment.AssignInput) {
      const request = yield* Schema.decodeEffect(Assignment.AssignInput)(input);
      yield* recipient(request.memberId);
      yield* delegation.requireGrant(request.roleId);
      const existing = (yield* delegation.assignmentsFor(request.memberId)).find(
        (record) =>
          workspaceRole(record) &&
          record.source._tag === "Role" &&
          record.source.roleId === request.roleId,
      );
      if (existing !== undefined) return existing;
      return yield* create(request);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const revoke = Effect.fn("AssignmentApplication.revoke")(
    function* (memberId: Member.Id, assignmentId: Assignment.Id) {
      yield* recipient(memberId);
      const id = yield* Schema.decodeEffect(Assignment.Id)(assignmentId);
      const found = yield* assignmentStore.get(id);
      if (Option.isNone(found)) return yield* new NotFound({ assignmentId: id });
      const record = found.value;
      if (record.memberId !== memberId) return yield* new NotFound({ assignmentId: id });
      if (record.source._tag === "Role") yield* delegation.requireGrant(record.source.roleId);
      if (record.status === "revoked") return record;
      yield* journal.publish(AssignmentFacts.Revoked, {
        workspaceId,
        assignmentId: id,
        memberId: record.memberId,
      });
      return Object.assign({}, record, { status: "revoked" as const }) satisfies Assignment.Record;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const change = Effect.fn("AssignmentApplication.change")(
    function* (input: Assignment.ChangeInput) {
      const request = yield* Schema.decodeEffect(Assignment.ChangeInput)(input);
      yield* recipient(request.memberId);
      yield* delegation.requireGrant(request.roleId);
      const current = (yield* delegation.assignmentsFor(request.memberId)).filter(workspaceRole);
      if (
        current.length !== request.expectedAssignmentIds.length ||
        current.some(({ id }) => !request.expectedAssignmentIds.includes(id))
      )
        return yield* new Changed({ memberId: request.memberId });
      for (const record of current) {
        if (record.source._tag === "Role") yield* delegation.requireGrant(record.source.roleId);
      }
      const same = current.find(
        ({ source }) => source._tag === "Role" && source.roleId === request.roleId,
      );
      if (current.length === 1 && same !== undefined) return same;
      for (const record of current)
        yield* journal.publish(AssignmentFacts.Revoked, {
          workspaceId,
          assignmentId: record.id,
          memberId: record.memberId,
        });
      return yield* create(request);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ permissions, roles: choices, list, assign, revoke, change });
});

/** @category layers */
export const layer = Layer.effect(Service, make());
export * as AssignmentApplication from "./application.ts";
