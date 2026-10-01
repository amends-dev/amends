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
import { Store } from "../../journal/store.ts";

import { Member } from "../../workspace/member/member.ts";
import { MemberStore } from "../../workspace/member/store.ts";
import { Group } from "../group.ts";
import { GroupCommand } from "../command.ts";
import { GroupQuery } from "../query.ts";
import { GroupPermissions } from "../permissions.ts";
import { GroupStore } from "../store.ts";
import { GroupMembership } from "./membership.ts";
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
  | GroupCommand.RemoveError
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
  | GroupCommand.Service
  | GroupQuery.Service
  | Journal.Service
  | Crypto.Crypto
  | Store.Service
> {
  const authorization = yield* Authorization.Service;
  const groupStore = yield* GroupStore.Service;
  const memberStore = yield* MemberStore.Service;
  const groupMembershipStore = yield* GroupMembershipStore.Service;
  const groupCommand = yield* GroupCommand.Service;
  const groupQuery = yield* GroupQuery.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  /** Management needs the grant and membership of the group; to anyone outside it, it is missing. */
  const requireManagement = Effect.fnUntraced(function* (groupId: Group.Id) {
    yield* authorization.require([
      Requirement.make(
        GroupMembershipPermissions.Manage,
        Target.Reference.cases.Group.make({ workspaceId, groupId }),
      ),
    ]);
    yield* groupQuery
      .requireAudience(groupId)
      .pipe(
        Effect.catchTag("GroupQuery.NotMember", () => Effect.fail(new GroupNotFound({ groupId }))),
      );
  });
  /** The group, or GroupNotFound when it is not stored. */
  const requireGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const foundGroup = yield* groupStore.get(groupId);
    if (Option.isNone(foundGroup)) return yield* new GroupNotFound({ groupId });
    return foundGroup.value;
  });
  /** The group, when it is a team: a direct group keeps the members it started with. */
  const requireTeamGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const group = yield* requireGroup(groupId);
    if (group.kind === "Direct") return yield* new FixedMembership({ groupId });
    return group;
  });

  /** Admit the member to the group now, returning the new admission. */
  const admitMember = Effect.fnUntraced(function* (groupId: Group.Id, memberId: Member.Id) {
    const admitted = yield* groupCommand.admitMember(groupId, memberId, yield* DateTime.now);
    return admitted.membership;
  });
  const add = Effect.fn("GroupMembershipApplication.add")(
    function* (input: GroupMembership.AddInput) {
      const { groupId, memberId } = yield* decodeInput(input);
      yield* requireManagement(groupId);
      yield* requireTeamGroup(groupId);

      const member = yield* memberStore.get(memberId);
      if (Option.isNone(member)) return yield* new MemberNotFound({ memberId });
      if (member.value.status !== "active") return yield* new InactiveMember({ memberId });
      if (Option.isSome(yield* groupMembershipStore.findActive(groupId, memberId)))
        return yield* new AlreadyMember({ groupId, memberId });
      return yield* admitMember(groupId, memberId);
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
      const group = yield* requireGroup(groupId);
      if (group.kind !== "Team" || group.visibility !== "Public")
        return yield* new GroupNotFound({ groupId });
      const current = yield* groupMembershipStore.findActive(groupId, actor.memberId);
      if (Option.isSome(current)) return current.value;
      return yield* admitMember(groupId, actor.memberId);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  /** The admission the input names in its group, or NotFound. */
  const requireMembership = Effect.fnUntraced(function* (input: GroupMembership.RemoveInput) {
    const found = yield* groupMembershipStore.get(input.membershipId);
    if (Option.isNone(found) || found.value.groupId !== input.groupId)
      return yield* new NotFound(input);
    return found.value;
  });
  /** End an active admission for the given reason, returning it as removed. */
  const endMembership = Effect.fnUntraced(function* (
    membership: GroupMembership.Record,
    reason: "removed" | "left",
  ) {
    if (membership.status === "removed")
      return yield* new AlreadyRemoved({
        groupId: membership.groupId,
        membershipId: membership.id,
      });
    const occurredAt = yield* DateTime.now;
    yield* groupCommand.removeMembership(
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
      const group = yield* requireTeamGroup(checked.groupId);
      const membership = yield* requireMembership(checked);
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
      return yield* endMembership(membership, "removed");
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
      const membership = yield* requireMembership(checked);
      // Do not disclose another member's admission or departure state through self-service.
      if (membership.memberId !== actor.memberId) return yield* new NotFound(checked);
      const group = yield* requireTeamGroup(checked.groupId);
      if (Group.isGeneral(group)) return yield* new GeneralMembership({ groupId: group.id });
      return yield* endMembership(membership, "left");
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  /** Fill a page with admissions whose workspace member is still active, reading further as needed. */
  const pageCurrentMemberships = Effect.fnUntraced(function* (
    groupId: Group.Id,
    input: GroupMembership.ListOptions,
  ) {
    const options = yield* Schema.decodeEffect(GroupMembership.ListOptions)(input);
    yield* requireGroup(groupId);
    const active: Array<GroupMembership.Record> = [];
    let after = options.after;
    while (active.length < options.limit) {
      const page = yield* groupMembershipStore.pageActiveByGroup(
        groupId,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit },
      );
      if (page.length === 0) break;
      // One read for the page's members; only admissions of active members are current.
      const found = new Map(
        (yield* memberStore.getMany([
          ...new Set(page.map((membership) => membership.memberId)),
        ])).map((member) => [member.id, member] as const),
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
    yield* groupQuery
      .requireAudience(id)
      .pipe(
        Effect.catchTag("GroupQuery.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId: id })),
        ),
      );
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId: id }),
    ]);
    return yield* pageCurrentMemberships(id, options);
  });
  return Service.of({
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
