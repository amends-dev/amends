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
  GroupNotFound,
  InactiveMember,
  MemberNotFound,
  NotFound,
} from "./errors.ts";
export {
  AlreadyMember,
  AlreadyRemoved,
  FixedMembership,
  GroupNotFound,
  InactiveMember,
  MemberNotFound,
  NotFound,
} from "./errors.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "GroupMembershipApplication.InvalidResponse",
  { message: Schema.String },
) {}

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
  | InvalidResponse;

export type ReadError =
  | Authorization.Error
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | GroupAudience.InvalidResponse
  | GroupNotFound
  | InvalidResponse;

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Require group.membership.manage on this group, validate its active workspace member,
   * and publish a fresh admission in one commit. An active admission is rejected without
   * another fact. Management authority does not require the caller to belong to the group.
   * Adding, removing, and leaving apply to team groups; direct groups reject them as fixed.
   */
  readonly add: (
    input: GroupMembership.AddInput,
  ) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
  /** End this team-group admission after requiring group.membership.manage on its group. */
  readonly remove: (
    input: GroupMembership.RemoveInput,
  ) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
  /**
   * Join a public team group as the actor, under group.join on it. Private and direct groups are
   * GroupNotFound like missing ones, so joining discloses nothing about them. Joining again
   * returns the actor's current admission and records nothing.
   */
  readonly join: (groupId: Group.Id) => Effect.Effect<GroupMembership.Record, Error, Actor.Service>;
  /** End only the actor's own team-group admission; active workspace membership is sufficient. */
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
  /** Page a known group's current roster under group.membership.manage, without joining it. */
  readonly listCurrentForManagement: (
    groupId: Group.Id,
    options: GroupMembership.ListOptions,
  ) => Effect.Effect<ReadonlyArray<GroupMembership.Record>, ReadError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/membership/application/Service",
) {}

const invalidRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Membership storage returned invalid data: ${cause.message}` });
const decodeInput = Schema.decodeEffect(GroupMembership.AddInput);
const decodeRemovalInput = Schema.decodeEffect(GroupMembership.RemoveInput);
const decodeGroup = Schema.decodeEffect(Schema.toType(Group.Record));
const decodeMember = Schema.decodeEffect(Member.Record);
const decodeMembership = Schema.decodeEffect(Schema.toType(GroupMembership.Record));

/** Capture workspace dependencies; resolve authority and transaction state per operation. @category constructors */
export const make = Effect.fn("GroupMembershipApplication.make")(function* (): Effect.fn.Return<
  Interface,
  InvalidResponse,
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
  if (
    [
      groups.workspaceId,
      members.workspaceId,
      memberships.workspaceId,
      audience.workspaceId,
      departure.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Group membership services belong to different workspaces",
    });

  const requireManagement = (groupId: Group.Id) =>
    authorization.require([
      Requirement.make(
        GroupMembershipPermissions.Manage,
        Target.Reference.cases.Group.make({ workspaceId, groupId }),
      ),
    ]);
  const loadGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const foundGroup = yield* groups.get(groupId);
    if (Option.isNone(foundGroup)) return yield* new GroupNotFound({ groupId });
    const group = yield* decodeGroup(foundGroup.value).pipe(Effect.mapError(invalidRecord));
    if (group.workspaceId !== workspaceId || group.id !== groupId)
      return yield* new InvalidResponse({
        message: "Group store returned another group or workspace",
      });
    return group;
  });
  const loadManagedGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const group = yield* loadGroup(groupId);
    if (group.kind === "Direct") return yield* new FixedMembership({ groupId });
    return group;
  });

  /** The member's current admission to the group, checked against what was asked for. */
  const activeAdmission = Effect.fnUntraced(function* (groupId: Group.Id, memberId: Member.Id) {
    const found = yield* memberships.findActive(groupId, memberId);
    if (Option.isNone(found)) return Option.none<GroupMembership.Record>();
    const membership = yield* decodeMembership(found.value).pipe(Effect.mapError(invalidRecord));
    if (
      membership.workspaceId !== workspaceId ||
      membership.groupId !== groupId ||
      membership.memberId !== memberId ||
      membership.status !== "active"
    )
      return yield* new InvalidResponse({
        message: "Membership store returned another group, member, workspace, or state",
      });
    return Option.some(membership);
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

      const foundMember = yield* members.get(memberId);
      if (Option.isNone(foundMember)) return yield* new MemberNotFound({ memberId });
      const member = yield* decodeMember(foundMember.value).pipe(Effect.mapError(invalidRecord));
      if (member.workspaceId !== workspaceId || member.id !== memberId)
        return yield* new InvalidResponse({
          message: "Member store returned another member or workspace",
        });
      if (member.status !== "active") return yield* new InactiveMember({ memberId });
      if (Option.isSome(yield* activeAdmission(groupId, memberId)))
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
      const current = yield* activeAdmission(groupId, actor.memberId);
      if (Option.isSome(current)) return current.value;
      return yield* admit(groupId, actor.memberId);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const loadMembership = Effect.fnUntraced(function* (input: GroupMembership.RemoveInput) {
    const found = yield* memberships.get(input.membershipId);
    if (Option.isNone(found)) return yield* new NotFound(input);
    const membership = yield* decodeMembership(found.value).pipe(Effect.mapError(invalidRecord));
    if (membership.workspaceId !== workspaceId || membership.id !== input.membershipId)
      return yield* new InvalidResponse({
        message: "Membership store returned another admission or workspace",
      });
    if (membership.groupId !== input.groupId) return yield* new NotFound(input);
    return membership;
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
      yield* loadManagedGroup(checked.groupId);
      return yield* depart(yield* loadMembership(checked), "removed");
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
      yield* loadManagedGroup(checked.groupId);
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
    const seenIds = new Set<GroupMembership.Id>();
    const seenMembers = new Set<Member.Id>();
    const active: Array<GroupMembership.Record> = [];
    let after = options.after;
    while (active.length < options.limit) {
      const page: Array<GroupMembership.Record> = [];
      for (const found of yield* memberships.pageActiveByGroup(
        groupId,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit },
      )) {
        const membership = yield* decodeMembership(found).pipe(Effect.mapError(invalidRecord));
        if (
          membership.workspaceId !== workspaceId ||
          membership.groupId !== groupId ||
          membership.status !== "active" ||
          seenIds.has(membership.id) ||
          (after !== undefined && membership.id <= after)
        )
          return yield* new InvalidResponse({
            message: "Membership store returned an inconsistent group listing",
          });
        if (seenMembers.has(membership.memberId))
          return yield* new InvalidResponse({
            message: "Membership store returned duplicate active admissions",
          });
        seenIds.add(membership.id);
        seenMembers.add(membership.memberId);
        page.push(membership);
      }
      if (page.length === 0) break;
      // One read for the page's members; only admissions of active members are current.
      const requested = new Set(page.map((membership) => membership.memberId));
      const found = new Map<Member.Id, Member.Record>();
      for (const row of yield* members.getMany([...requested])) {
        const member = yield* decodeMember(row).pipe(Effect.mapError(invalidRecord));
        if (member.workspaceId !== workspaceId || !requested.has(member.id) || found.has(member.id))
          return yield* new InvalidResponse({
            message: "Member store returned another member or workspace",
          });
        found.set(member.id, member);
      }
      for (const membership of page) {
        const member = found.get(membership.memberId);
        if (member === undefined)
          return yield* new InvalidResponse({
            message: "Group admission references a missing workspace member",
          });
        after = membership.id;
        if (member.status === "active" && active.length < options.limit) active.push(membership);
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
  const listCurrentForManagement = Effect.fn("GroupMembershipApplication.listCurrentForManagement")(
    function* (groupId: Group.Id, options: GroupMembership.ListOptions) {
      const id = yield* Schema.decodeEffect(Group.Id)(groupId);
      yield* requireManagement(id);
      return yield* current(id, options);
    },
  );

  return Service.of({
    workspaceId,
    add,
    join,
    remove,
    leave,
    listCurrent,
    listCurrentForManagement,
  });
});

/** Provide membership operations over the workspace's existing stores and journal. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupMembershipApplication from "./application.ts";
