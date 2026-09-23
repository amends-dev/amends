import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Target } from "../authorization/target.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Group } from "./group.ts";
import { GroupAudience } from "./audience.ts";
import { GroupStore } from "./store.ts";
import { GroupFacts } from "./facts.ts";
import { GroupPermissions } from "./permissions.ts";
import { GroupMembership } from "./membership/membership.ts";
import { GroupMembershipFacts } from "./membership/facts.ts";
import { GroupMembershipPermissions } from "./membership/permissions.ts";
import { GroupMembershipStore } from "./membership/store.ts";
import { GroupFollow } from "./follow/follow.ts";
import { GroupFollowStore } from "./follow/store.ts";
import { ReadStateStore } from "../attention/store.ts";

/** Missing groups and groups outside the caller's audience share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("GroupApplication.NotFound", {
  groupId: Group.Id,
}) {}

export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupApplication.MemberNotFound",
  {
    memberId: Member.Id,
  },
) {}
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupApplication.InactiveMember",
  {
    memberId: Member.Id,
  },
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "GroupApplication.InvalidResponse",
  {
    message: Schema.String,
  },
) {}

export type Error =
  | Authorization.Error
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | MemberNotFound
  | InactiveMember
  | InvalidResponse;

export type ReadError =
  | Authorization.Error
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | GroupFollowStore.Failure
  | ReadStateStore.Failure
  | Schema.SchemaError
  | GroupAudience.InvalidResponse
  | NotFound
  | InvalidResponse;

export interface Interface {
  readonly workspaceId: Group.Record["workspaceId"];
  /**
   * Require group.create in this workspace, then create a private team and its explicit
   * initial admissions in one commit. No extra membership-management grant is required
   * for the initial audience. New invocations create new groups; this is not a retry receipt.
   */
  readonly createPrivateTeam: (
    input: Group.CreatePrivateTeamInput,
  ) => Effect.Effect<Group.Record, Error, Actor.Service>;
  /** Require group.read and current audience membership; no transaction or publication. */
  readonly get: (groupId: Group.Id) => Effect.Effect<Group.Record, ReadError, Actor.Service>;
  /** Current readable groups only, ordered by group ID. Honors an existing transaction. */
  /**
   * The actor's current groups that `group.read` covers, in stable ID order, each with its latest
   * activity, the actor's caught-up time, whether it has new activity for them, and whether they
   * follow it. Reads a fixed number of times however many groups the actor belongs to.
   */
  readonly listMine: Effect.Effect<ReadonlyArray<Group.ListItem>, ReadError, Actor.Service>;
  /** Inspect a known group's metadata with management authority, without granting audience access. */
  readonly getForManagement: (
    groupId: Group.Id,
  ) => Effect.Effect<Group.Record, ReadError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/group/application/Service",
) {}

/** Capture workspace dependencies; resolve authority and member eligibility inside each commit. @category constructors */
export const make = Effect.fn("GroupApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const members = yield* MemberStore.Service;
  const groups = yield* GroupStore.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const audience = yield* GroupAudience.Service;
  const follows = yield* GroupFollowStore.Service;
  const readStates = yield* ReadStateStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      members.workspaceId,
      groups.workspaceId,
      memberships.workspaceId,
      audience.workspaceId,
      follows.workspaceId,
      readStates.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({ message: "Group services belong to different workspaces" });
  const create = Requirement.make(
    GroupPermissions.Create,
    Target.Reference.cases.Workspace.make({ workspaceId }),
  );

  const createPrivateTeam = Effect.fn("GroupApplication.createPrivateTeam")(
    function* (input: Group.CreatePrivateTeamInput) {
      yield* authorization.require([create]);
      const request = yield* Schema.decodeEffect(Schema.toType(Group.CreatePrivateTeamInput))(
        input,
      );
      const requested = new Set(request.memberIds);
      const found = new Map<Member.Id, Member.Record>();
      for (const row of yield* members.getMany(request.memberIds)) {
        const member = yield* Schema.decodeEffect(Member.Record)(row);
        if (member.workspaceId !== workspaceId || !requested.has(member.id) || found.has(member.id))
          return yield* new InvalidResponse({
            message: "Member store returned another member or workspace",
          });
        found.set(member.id, member);
      }
      for (const memberId of request.memberIds) {
        const member = found.get(memberId);
        if (member === undefined) return yield* new MemberNotFound({ memberId });
        if (member.status !== "active") return yield* new InactiveMember({ memberId });
      }
      const actor = yield* Actor.Service;
      const createdAt = yield* DateTime.now;
      const group: Group.Record = {
        id: Group.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        kind: "Team",
        visibility: "Private",
        name: request.name,
        createdBy: actor.memberId,
        createdAt,
      };
      const created = yield* journal
        .publish(GroupFacts.Created, group)
        .pipe(Publication.withOccurredAt(createdAt));
      for (const memberId of request.memberIds) {
        yield* journal
          .publish(GroupMembershipFacts.Added, {
            id: GroupMembership.Id.make(yield* crypto.randomUUIDv4),
            workspaceId,
            groupId: group.id,
            memberId,
            admittedAt: createdAt,
            status: "active",
          })
          .pipe(Publication.withCause(created, createdAt));
      }
      return group;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const load = Effect.fnUntraced(function* (groupId: Group.Id) {
    const found = yield* groups.get(groupId);
    if (Option.isNone(found)) return yield* new NotFound({ groupId });
    const group = yield* Schema.decodeEffect(Schema.toType(Group.Record))(found.value).pipe(
      Effect.mapError(
        (cause) =>
          new InvalidResponse({ message: `Group store returned invalid data: ${cause.message}` }),
      ),
    );
    if (group.workspaceId !== workspaceId || group.id !== groupId)
      return yield* new InvalidResponse({
        message: "Group store returned another group or workspace",
      });
    return group;
  });
  const get = Effect.fn("GroupApplication.get")(function* (groupId: Group.Id) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    yield* audience
      .require(id)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new NotFound({ groupId: id })),
        ),
      );
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId: id }),
    ]);
    return yield* load(id);
  });
  const getForManagement = Effect.fn("GroupApplication.getForManagement")(function* (
    groupId: Group.Id,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    yield* authorization.require([
      Requirement.make(GroupMembershipPermissions.Manage, {
        _tag: "Group",
        workspaceId,
        groupId: id,
      }),
    ]);
    return yield* load(id);
  });
  const listMine = Effect.gen(function* () {
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    const invalid = (message: string) => new InvalidResponse({ message });
    const decodeFailure = (cause: Schema.SchemaError) =>
      invalid(`Group storage returned invalid data: ${cause.message}`);
    const admissions = new Map<Group.Id, GroupMembership.Record>();
    const seenAdmissions = new Set<GroupMembership.Id>();
    for (const found of yield* memberships.listActiveByMember(actor.memberId)) {
      const membership = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(
        found,
      ).pipe(Effect.mapError(decodeFailure));
      if (
        membership.workspaceId !== workspaceId ||
        membership.memberId !== actor.memberId ||
        membership.status !== "active" ||
        admissions.has(membership.groupId) ||
        seenAdmissions.has(membership.id)
      )
        return yield* invalid("Membership store returned an inconsistent active admission listing");
      admissions.set(membership.groupId, membership);
      seenAdmissions.add(membership.id);
    }
    // One grant resolution and one read per kind of record, however many groups there are.
    const candidates = [...admissions.keys()];
    const allowed = yield* authorization.permitted(
      candidates.map((groupId) =>
        Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId }),
      ),
    );
    const ids = candidates.filter((_, index) => allowed[index] === true);
    const records = new Map<Group.Id, Group.Record>();
    for (const found of yield* groups.getMany(ids)) {
      const group = yield* Schema.decodeEffect(Schema.toType(Group.Record))(found).pipe(
        Effect.mapError(decodeFailure),
      );
      if (group.workspaceId !== workspaceId || !admissions.has(group.id) || records.has(group.id))
        return yield* invalid("Group store returned another group or workspace");
      records.set(group.id, group);
    }
    const latest = new Map<Group.Id, DateTime.Utc>();
    for (const found of yield* groups.getLatest(ids)) {
      const value = yield* Schema.decodeEffect(Schema.toType(Group.Latest))(found).pipe(
        Effect.mapError(decodeFailure),
      );
      if (!records.has(value.groupId) || latest.has(value.groupId))
        return yield* invalid("Group store returned activity for another group");
      latest.set(value.groupId, value.occurredAt);
    }
    const caughtUp = new Map<Group.Id, DateTime.Utc>();
    for (const value of yield* readStates.getGroupsCaughtUp(actor.memberId, ids)) {
      if (
        value.workspaceId !== workspaceId ||
        value.memberId !== actor.memberId ||
        !records.has(value.groupId)
      )
        return yield* invalid("Read-state store returned another member's or group's time");
      caughtUp.set(value.groupId, value.caughtUpAt);
    }
    const following = new Set<GroupMembership.Id>();
    for (const found of yield* follows.findActiveMany(
      ids.flatMap((groupId) => admissions.get(groupId)?.id ?? []),
    )) {
      const follow = yield* Schema.decodeEffect(Schema.toType(GroupFollow.Record))(found).pipe(
        Effect.mapError(decodeFailure),
      );
      if (
        follow.workspaceId !== workspaceId ||
        follow.memberId !== actor.memberId ||
        follow.status !== "active" ||
        admissions.get(follow.groupId)?.id !== follow.groupMembershipId
      )
        return yield* invalid("Follow store returned another member's or admission's follow");
      following.add(follow.groupMembershipId);
    }
    const items: Array<Group.ListItem> = [];
    for (const groupId of ids.toSorted((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      // A membership whose group is no longer stored is skipped, as a missing group reads.
      const group = records.get(groupId);
      const admission = admissions.get(groupId);
      if (group === undefined || admission === undefined) continue;
      const latestActivityAt = latest.get(groupId) ?? null;
      const caughtUpAt = caughtUp.get(groupId) ?? null;
      items.push({
        group,
        latestActivityAt,
        caughtUpAt,
        newActivity:
          latestActivityAt !== null &&
          DateTime.isGreaterThan(latestActivityAt, caughtUpAt ?? admission.admittedAt),
        following: following.has(admission.id),
      });
    }
    return items;
  }).pipe(Effect.withSpan("GroupApplication.listMine"));

  return Service.of({ workspaceId, createPrivateTeam, get, listMine, getForManagement });
});

/** Provide group creation and authorized reads over the workspace's services. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupApplication from "./application.ts";
