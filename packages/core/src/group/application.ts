import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Request } from "../request/request.ts";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Target } from "../authorization/target.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
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
import { GroupFollowStore } from "./follow/store.ts";
import { ReadStateStore } from "../attention/store.ts";
import { NotificationStore } from "../notification/store.ts";
import { Changed, InactiveMember, MemberNotFound, NotFound, NotRenamable } from "./errors.ts";
import { Notification } from "../notification/notification.ts";
export { Changed, InactiveMember, MemberNotFound, NotFound, NotRenamable } from "./errors.ts";

export type Error =
  | Authorization.Error
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | MemberNotFound
  | InactiveMember;
/** A retried creation reads back the group its first attempt created. */
export type CreateError = Error | GroupStore.Failure | NotFound;
export type RenameError =
  | Error
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | NotFound
  | NotRenamable
  | Changed;

export type ReadError =
  | Authorization.Error
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | GroupFollowStore.Failure
  | ReadStateStore.Failure
  | NotificationStore.Failure
  | Schema.SchemaError
  | NotFound;

export interface Interface {
  readonly workspaceId: Group.Record["workspaceId"];
  /**
   * Require group.create in this workspace, then create a private team and its explicit
   * initial admissions in one commit. No extra membership-management grant is required
   * for the initial audience. New invocations create new groups; this is not a retry receipt.
   */
  readonly createTeam: (
    input: Group.CreateTeamInput,
    options?: Request.Options,
  ) => Effect.Effect<Group.Record, CreateError, Actor.Service>;
  /**
   * Require group.rename on the group and membership of it, then give a team group a new name.
   * No workspace role reaches a group from outside it: to a non-member, a group is NotFound, as a
   * missing or foreign one is. A direct group, named by its members, is NotRenamable. The same name
   * again records nothing; otherwise a name other than `expectedName` is Changed, and nothing is
   * recorded.
   */
  readonly rename: (
    input: Group.RenameInput,
  ) => Effect.Effect<Group.Record, RenameError, Actor.Service>;
  /** Require group.read and current audience membership; no transaction or publication. */
  readonly get: (groupId: Group.Id) => Effect.Effect<Group.Record, ReadError, Actor.Service>;
  /** Current readable groups only, ordered by group ID. Honors an existing transaction. */
  /**
   * A page of the actor's current groups that `group.read` covers, in group-ID order, each with
   * its latest activity, the actor's caught-up time, whether it has new activity for them, and
   * whether they follow it. Each page reads a fixed number of times, however large.
   */
  readonly listMine: (
    options: Group.ListOptions,
  ) => Effect.Effect<ReadonlyArray<Group.ListItem>, ReadError, Actor.Service>;
  /**
   * A page of the workspace's public team groups that `group.join` covers for the actor, in
   * group-ID order, each with its member count and whether the actor belongs to it. Their threads
   * stay with their members. Each page reads a fixed number of times, however large.
   */
  readonly listPublic: (
    options: Group.ListOptions,
  ) => Effect.Effect<ReadonlyArray<Group.PublicItem>, ReadError, Actor.Service>;
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
  const notifications = yield* NotificationStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  const create = Requirement.make(
    GroupPermissions.Create,
    Target.Reference.cases.Workspace.make({ workspaceId }),
  );

  const createTeam = Effect.fn("GroupApplication.createTeam")(
    function* (input: Group.CreateTeamInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Group.CreateTeamInput))(input);
      yield* authorization.require([create]);
      const actor = yield* Actor.Service;
      const groupId = Group.Id.make(
        yield* Request.idFor(options.requestKey, ["group.create", workspaceId, actor.memberId]),
      );
      // A retry returns the group its first attempt created.
      if (options.requestKey !== undefined && Option.isSome(yield* groups.get(groupId)))
        return yield* load(groupId);
      const found = new Map(
        (yield* members.getMany(request.memberIds)).map((member) => [member.id, member] as const),
      );
      for (const memberId of request.memberIds) {
        const member = found.get(memberId);
        if (member === undefined) return yield* new MemberNotFound({ memberId });
        if (member.status !== "active") return yield* new InactiveMember({ memberId });
      }
      const createdAt = yield* DateTime.now;
      const group: Group.Record = {
        id: groupId,
        workspaceId,
        kind: "Team",
        visibility: request.visibility ?? "Private",
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
    return found.value;
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
  const rename = Effect.fn("GroupApplication.rename")(
    function* (input: Group.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Group.RenameInput))(input);
      yield* authorization.require([
        Requirement.make(GroupPermissions.Rename, {
          _tag: "Group",
          workspaceId,
          groupId: request.groupId,
        }),
      ]);
      // Only its members may rename a group; to anyone else it is missing.
      yield* audience
        .require(request.groupId)
        .pipe(
          Effect.catchTag("GroupAudience.NotMember", () =>
            Effect.fail(new NotFound({ groupId: request.groupId })),
          ),
        );
      const group = yield* load(request.groupId);
      if (group.kind !== "Team") return yield* new NotRenamable({ groupId: group.id });
      if (group.name === request.name) return group;
      if (group.name !== request.expectedName) return yield* new Changed({ groupId: group.id });
      yield* journal.publish(GroupFacts.Renamed, {
        workspaceId,
        groupId: group.id,
        name: request.name,
      });
      return { ...group, name: request.name };
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  /** Describe one page of the actor's admissions, keyed by group, in a fixed number of reads. */
  const describe = Effect.fnUntraced(function* (
    actor: Actor.Value,
    admissions: ReadonlyMap<Group.Id, GroupMembership.Record>,
  ) {
    const memberId = actor.memberId;
    // One grant resolution and one read per kind of record for the page.
    const candidates = [...admissions.keys()];
    const allowed = yield* authorization.permitted(
      candidates.flatMap((groupId) => [
        Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId }),
        Requirement.make(GroupMembershipPermissions.Manage, {
          _tag: "Group",
          workspaceId,
          groupId,
        }),
        Requirement.make(GroupPermissions.Rename, { _tag: "Group", workspaceId, groupId }),
        Requirement.make(GroupPermissions.Moderate, { _tag: "Group", workspaceId, groupId }),
      ]),
    );
    const granted = (offset: number) =>
      new Set(candidates.filter((_, index) => allowed[index * 4 + offset] === true));
    const ids = [...granted(0)];
    const managed = granted(1),
      renamers = granted(2),
      moderators = granted(3);
    const records = new Map(
      (yield* groups.getMany(ids)).map((group) => [group.id, group] as const),
    );
    const latest = new Map(
      (yield* groups.getLatest(ids)).map((value) => [value.groupId, value.occurredAt] as const),
    );
    const caughtUp = new Map(
      (yield* readStates.getGroupsCaughtUp(memberId, ids)).map(
        (value) => [value.groupId, value.caughtUpAt] as const,
      ),
    );
    const following = new Set(
      (yield* follows.findActiveMany(
        ids.flatMap((groupId) => admissions.get(groupId)?.id ?? []),
      )).map((follow) => follow.groupMembershipId),
    );
    const pending = new Map(
      (yield* notifications.countPendingByGroup(
        Notification.ofMember(actor.memberId, actor.identity),
        ids,
      )).map((value) => [value.groupId, value.count] as const),
    );
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
        pending: pending.get(groupId) ?? 0,
        // Direct groups keep the members they started with, and are named by them.
        manageable: group.kind === "Team" && managed.has(groupId),
        // Any member tidies a private group; removing people from a public one is moderation.
        membersRemovable:
          group.kind === "Team" &&
          managed.has(groupId) &&
          (group.visibility === "Private" || moderators.has(groupId)),
        renamable: group.kind === "Team" && renamers.has(groupId),
      });
    }
    return items;
  });
  const listMine = Effect.fn("GroupApplication.listMine")(function* (input: Group.ListOptions) {
    const options = yield* Schema.decodeEffect(Group.ListOptions)(input);
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    const items: Array<Group.ListItem> = [];
    let after = options.after;
    // Fill the page with readable groups, reading further when grants skip some.
    while (items.length < options.limit) {
      const admissions = new Map(
        (yield* memberships.pageActiveByMember(
          actor.memberId,
          after === undefined
            ? { limit: options.limit }
            : { afterGroupId: after, limit: options.limit },
        )).map((membership) => [membership.groupId, membership] as const),
      );
      if (admissions.size === 0) break;
      for (const item of yield* describe(actor, admissions))
        if (items.length < options.limit) items.push(item);
      after = [...admissions.keys()].at(-1);
      if (admissions.size < options.limit) break;
    }
    return items;
  });
  const listPublic = Effect.fn("GroupApplication.listPublic")(function* (input: Group.ListOptions) {
    const options = yield* Schema.decodeEffect(Group.ListOptions)(input);
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    const items: Array<Group.PublicItem> = [];
    let after = options.after;
    // Fill the page with groups the actor may join, reading further when grants skip some.
    while (items.length < options.limit) {
      const page = yield* groups.pagePublic(
        after === undefined ? { limit: options.limit } : { after, limit: options.limit },
      );
      if (page.length === 0) break;
      const allowed = yield* authorization.permitted(
        page.map((group) =>
          Requirement.make(GroupMembershipPermissions.Join, {
            _tag: "Group",
            workspaceId,
            groupId: group.id,
          }),
        ),
      );
      const joinable = page.filter((_, index) => allowed[index] === true);
      const ids = new Set(joinable.map((group) => group.id));
      const summaries = new Map(
        (yield* memberships.summarize([...ids], actor.memberId)).map(
          (summary) => [summary.groupId, summary] as const,
        ),
      );
      for (const group of joinable)
        if (items.length < options.limit)
          items.push({
            group,
            members: summaries.get(group.id)?.members ?? 0,
            joined: summaries.get(group.id)?.joined ?? false,
          });
      after = page.at(-1)?.id;
      if (page.length < options.limit) break;
    }
    return items;
  });

  return Service.of({
    workspaceId,
    createTeam,
    rename,
    get,
    listMine,
    listPublic,
  });
});

/** Provide group creation and authorized reads over the workspace's services. @category layers */
export const layer = Layer.effect(Service, make());

export * as GroupApplication from "./application.ts";
