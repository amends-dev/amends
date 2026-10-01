import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import { Target } from "../../authorization/target.ts";
import { Actor } from "../../identity/actor.ts";
import { Journal } from "../../journal/journal.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Publication } from "../../journal/publication.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { Member } from "../../workspace/member/member.ts";
import { MemberStore } from "../../workspace/member/store.ts";
import { Group } from "../group.ts";
import { GroupAudience } from "../audience.ts";
import { GroupPermissions } from "../permissions.ts";
import { GroupStore } from "../store.ts";
import { GroupMembership } from "./membership.ts";
import { GroupMembershipFacts } from "./facts.ts";
import { GroupMembershipDeparture } from "./departure.ts";
import { GroupMembershipPermissions } from "./permissions.ts";
import { GroupMembershipStore } from "./store.ts";
import {
  AlreadyMember,
  AlreadyRemoved,
  FixedMembership,
  GeneralMembership,
  GroupNotFound,
  InactiveMember,
  MemberNotFound,
  NotFound,
} from "./errors.ts";
export {
  AlreadyMember,
  AlreadyRemoved,
  FixedMembership,
  GeneralMembership,
  GroupNotFound,
  InactiveMember,
  MemberNotFound,
  NotFound,
} from "./errors.ts";

export type Error =
  | GroupMembershipDeparture.Error
  | Authorization.Error
  | GroupStore.Failure
  | MemberStore.Failure
  | GroupMembershipStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | GroupNotFound
  | MemberNotFound
  | InactiveMember
  | AlreadyMember
  | NotFound
  | AlreadyRemoved
  | FixedMembership
  | GeneralMembership;

export type ReadError =
  | Authorization.Error
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | GroupNotFound;

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Require group.membership.manage on this group and membership of it, validate its active
   * workspace member, and publish a fresh admission in one commit. An active admission is
   * rejected without another fact. No workspace role reaches a group from outside it: to a
   * non-member, a group is GroupNotFound, as a missing one is. Adding, removing, and leaving apply
   * to team groups; direct groups reject them as fixed.
   */
  readonly add: (
    input: GroupMembership.AddInput,
  ) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
  /**
   * End this team-group admission, requiring group.membership.manage on its group and membership
   * of it. Any member may remove others from a private group; removing someone else from a public
   * one also requires group.moderate. Nobody is removed from the general group.
   */
  readonly remove: (
    input: GroupMembership.RemoveInput,
  ) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
  /**
   * Join a public team group as the actor, under group.join on it. Private and direct groups are
   * GroupNotFound like missing ones, so joining discloses nothing about them. Joining again
   * returns the actor's current admission and records nothing.
   */
  readonly join: (groupId: Group.Id) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
  /**
   * End only the actor's own team-group admission; active workspace membership is sufficient.
   * Nobody leaves the general group.
   */
  readonly leave: (
    input: GroupMembership.LeaveInput,
  ) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
  /**
   * A page of current admissions of active workspace members, in admission-ID order; require
   * group.read and audience membership.
   */
  readonly listCurrent: (
    groupId: Group.Id,
    options: GroupMembership.ListOptions,
  ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, ReadError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/membership/application/Service",
) {}

const decodeInput = Schema.decodeEffect(GroupMembership.AddInput);
const decodeRemovalInput = Schema.decodeEffect(GroupMembership.RemoveInput);

/** Capture workspace dependencies; resolve authority and transaction state per operation. @category constructors */
export const make = Effect.fn("GroupMembershipApplication.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  | Authorization.Service
  | GroupStore.Service
  | MemberStore.Service
  | GroupMembershipStore.Service
  | GroupMembershipDeparture.Service
  | GroupAudience.Service
  | Journal.Service
  | Crypto.Crypto
> {
  const authorization = yield* Authorization.Service;
  const groups = yield* GroupStore.Service;
  const members = yield* MemberStore.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const departure = yield* GroupMembershipDeparture.Service;
  const audience = yield* GroupAudience.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;

  /** Management needs the grant and membership of the group; to anyone outside it, it is missing. */
  const requireManagement = Effect.fnUntraced(function* (groupId: Group.Id) {
    yield* authorization.require([
      Requirement.make(
        GroupMembershipPermissions.Manage,
        Target.Reference.cases.Group.make({ workspaceId, groupId }),
      ),
    ]);
    yield* audience
      .require(groupId)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId })),
        ),
      );
  });
  const loadGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const foundGroup = yield* groups.get(groupId);
    if (Option.isNone(foundGroup)) return yield* new GroupNotFound({ groupId });
    return foundGroup.value;
  });
  const loadManagedGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const group = yield* loadGroup(groupId);
    if (group.kind === "Direct") return yield* new FixedMembership({ groupId });
    return group;
  });

  /** Publish a fresh admission of the member to the group. */
  const admit = Effect.fnUntraced(function* (groupId: Group.Id, memberId: Member.Id) {
    const admittedAt = yield* DateTime.now;
    const membership = {
      id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      groupId,
      memberId,
      admittedAt,
      status: "active",
    } satisfies GroupMembership.Record;
    yield* journal
      .publish(GroupMembershipFacts.Added, membership)
      .pipe(Publication.withOccurredAt(admittedAt));
    return membership;
  });
  const add = Effect.fn("GroupMembershipApplication.add")(
    function* (input: GroupMembership.AddInput) {
      const { groupId, memberId } = yield* decodeInput(input);
      yield* requireManagement(groupId);
      yield* loadManagedGroup(groupId);

      const member = yield* members.get(memberId);
      if (Option.isNone(member)) return yield* new MemberNotFound({ memberId });
      if (member.value.status !== "active") return yield* new InactiveMember({ memberId });
      if (Option.isSome(yield* memberships.findActive(groupId, memberId)))
        return yield* new AlreadyMember({ groupId, memberId });
      return yield* admit(groupId, memberId);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const join = Effect.fn("GroupMembershipApplication.join")(
    function* (input: Group.Id) {
      const groupId = yield* Schema.decodeEffect(Group.Id)(input);
      yield* authorization.require([
        Requirement.make(
          GroupMembershipPermissions.Join,
          Target.Reference.cases.Group.make({ workspaceId, groupId }),
        ),
      ]);
      const actor = yield* Actor.Service;
      const group = yield* loadGroup(groupId);
      if (group.kind !== "Team" || group.visibility !== "Public")
        return yield* new GroupNotFound({ groupId });
      const current = yield* memberships.findActive(groupId, actor.memberId);
      if (Option.isSome(current)) return current.value;
      return yield* admit(groupId, actor.memberId);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const loadMembership = Effect.fnUntraced(function* (input: GroupMembership.RemoveInput) {
    const found = yield* memberships.get(input.membershipId);
    if (Option.isNone(found) || found.value.groupId !== input.groupId)
      return yield* new NotFound(input);
    return found.value;
  });
  const depart = Effect.fnUntraced(function* (
    membership: GroupMembership.Record,
    reason: "removed" | "left",
  ) {
    if (membership.status === "removed")
      return yield* new AlreadyRemoved({
        groupId: membership.groupId,
        membershipId: membership.id,
      });
    const occurredAt = yield* DateTime.now;
    yield* departure.remove(
      {
        workspaceId,
        groupId: membership.groupId,
        membershipId: membership.id,
        memberId: membership.memberId,
        reason,
      },
      occurredAt,
    );
    return {
      id: membership.id,
      workspaceId,
      groupId: membership.groupId,
      memberId: membership.memberId,
      admittedAt: membership.admittedAt,
      status: "removed",
    } satisfies GroupMembership.Record;
  });
  const remove = Effect.fn("GroupMembershipApplication.remove")(
    function* (input: GroupMembership.RemoveInput) {
      const checked = yield* decodeRemovalInput(input);
      yield* requireManagement(checked.groupId);
      const group = yield* loadManagedGroup(checked.groupId);
      const membership = yield* loadMembership(checked);
      // Removing someone from a public group is moderation; a private one is its members' to tidy.
      if (Group.isGeneral(group)) return yield* new GeneralMembership({ groupId: group.id });
      const actor = yield* Actor.Service;
      if (group.visibility === "Public" && membership.memberId !== actor.memberId)
        yield* authorization.require([
          Requirement.make(
            GroupPermissions.Moderate,
            Target.Reference.cases.Group.make({ workspaceId, groupId: checked.groupId }),
          ),
        ]);
      return yield* depart(membership, "removed");
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const leave = Effect.fn("GroupMembershipApplication.leave")(
    function* (input: GroupMembership.LeaveInput) {
      const checked = yield* decodeRemovalInput(input);
      yield* authorization.require([]);
      const actor = yield* Actor.Service;
      const membership = yield* loadMembership(checked);
      // Do not disclose another member's admission or departure state through self-service.
      if (membership.memberId !== actor.memberId) return yield* new NotFound(checked);
      const group = yield* loadManagedGroup(checked.groupId);
      if (Group.isGeneral(group)) return yield* new GeneralMembership({ groupId: group.id });
      return yield* depart(membership, "left");
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  /** Fill a page with admissions whose workspace member is still active, reading further as needed. */
  const current = Effect.fnUntraced(function* (
    groupId: Group.Id,
    input: GroupMembership.ListOptions,
  ) {
    const options = yield* Schema.decodeEffect(GroupMembership.ListOptions)(input);
    yield* loadGroup(groupId);
    const active: Array<GroupMembership.Record> = [];
    let after = options.after;
    while (active.length < options.limit) {
      const page = yield* memberships.pageActiveByGroup(
        groupId,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit },
      );
      if (page.length === 0) break;
      // One read for the page's members; only admissions of active members are current.
      const found = new Map(
        (yield* members.getMany([...new Set(page.map((membership) => membership.memberId))])).map(
          (member) => [member.id, member] as const,
        ),
      );
      for (const membership of page) {
        after = membership.id;
        if (found.get(membership.memberId)?.status === "active" && active.length < options.limit)
          active.push(membership);
      }
      if (page.length < options.limit) break;
    }
    return active;
  });
  const listCurrent = Effect.fn("GroupMembershipApplication.listCurrent")(function* (
    groupId: Group.Id,
    options: GroupMembership.ListOptions,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    yield* audience
      .require(id)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId: id })),
        ),
      );
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId: id }),
    ]);
    return yield* current(id, options);
  });
  return Service.of({
    workspaceId,
    add,
    join,
    remove,
    leave,
    listCurrent,
  });
});

/** Provide membership operations over the workspace's existing stores and journal. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupMembershipApplication from "./application.ts";
