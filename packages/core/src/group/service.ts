import { Context, Crypto, DateTime, Effect, Layer, Option, Order, Schema } from "effect";
import * as Request from "../request/request.ts";
import type { PlatformError } from "effect";
import * as Authorization from "../authorization/authorization.ts";
import * as Requirement from "../authorization/requirement.ts";
import * as Target from "../authorization/target.ts";
import * as Actor from "../identity/actor.ts";
import * as Journal from "../journal/journal.ts";
import type * as Log from "../journal/log.ts";
import type * as Projection from "../journal/projection.ts";
import * as Publication from "../journal/publication.ts";
import * as Store from "../journal/store.ts";
import * as MemberStore from "../workspace/member/store.ts";
import * as Group from "./group.ts";
import * as GroupCommand from "./command.ts";
import * as GroupQuery from "./query.ts";
import * as GroupStore from "./store.ts";
import * as GroupFacts from "./facts.ts";
import * as GroupPermissions from "./permissions.ts";
import * as GroupMembership from "./membership/membership.ts";

import * as GroupMembershipPermissions from "./membership/permissions.ts";
import * as GroupMembershipStore from "./membership/store.ts";
import * as GroupFollowStore from "./follow/store.ts";
import * as ReadStateStore from "../read-state/store.ts";
import * as NotificationStore from "../notification/store.ts";
import { Changed, InactiveMember, MemberNotFound, NotFound, NotRenamable } from "./errors.ts";
import * as Notification from "../notification/notification.ts";
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

export class GroupService extends Context.Service<
  GroupService,
  {
    /**
     * Require group.create in this workspace, then create a private team and its explicit
     * initial admissions in one commit. No extra membership-management grant is required
     * for the initial audience. New invocations create new groups; this is not a retry receipt.
     */
    readonly createTeam: (
      input: Group.CreateTeamInput,
      options?: Request.Options,
    ) => Effect.Effect<Group.Record, CreateError, Actor.Actor>;
    /**
     * Require group.rename on the group and membership of it, then give a team group a new name.
     * No workspace role reaches a group from outside it: to a non-member, a group is NotFound, as a
     * missing or foreign one is. A direct group, named by its members, is NotRenamable. The same name
     * again records nothing; otherwise a name other than `expectedName` is Changed, and nothing is
     * recorded.
     */
    readonly rename: (
      input: Group.RenameInput,
    ) => Effect.Effect<Group.Record, RenameError, Actor.Actor>;
    /** Require group.read and current audience membership; no transaction or publication. */
    readonly get: (groupId: Group.Id) => Effect.Effect<Group.Record, ReadError, Actor.Actor>;
    /** Current readable groups only, ordered by group ID. Honors an existing transaction. */
    /**
     * A page of the actor's current groups that `group.read` covers, in group-ID order, each with
     * its latest activity, when the actor last read it, whether it has new activity for them, and
     * whether they follow it. Each page reads a fixed number of times, however large.
     */
    readonly listMine: (
      options: Group.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Group.ListItem>, ReadError, Actor.Actor>;
    /**
     * A page of the workspace's public team groups that `group.join` covers for the actor, in
     * group-ID order, each with its member count and whether the actor belongs to it. Their threads
     * stay with their members. Each page reads a fixed number of times, however large.
     */
    readonly listPublic: (
      options: Group.ListOptions,
    ) => Effect.Effect<ReadonlyArray<Group.PublicItem>, ReadError, Actor.Actor>;
  }
>()("@amends-dev/core/group/service/Service") {}

/** Capture workspace dependencies; resolve authority and member eligibility inside each commit. @category constructors */
export const make = Effect.fn("GroupService.make")(function* () {
  const authorization = yield* Authorization.Authorization;
  const memberStore = yield* MemberStore.MemberStore;
  const groupStore = yield* GroupStore.GroupStore;
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore;
  const groupQuery = yield* GroupQuery.GroupQuery;
  const groupCommand = yield* GroupCommand.GroupCommand;
  const groupFollowStore = yield* GroupFollowStore.GroupFollowStore;
  const readStateStore = yield* ReadStateStore.ReadStateStore;
  const notificationStore = yield* NotificationStore.NotificationStore;
  const journal = yield* Journal.Journal;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;
  const createGroupRequirement = Requirement.make(
    GroupPermissions.Create,
    Target.Reference.cases.Workspace.make({ workspaceId }),
  );

  /** The group, or NotFound when it is not stored. */
  const requireGroup = Effect.fnUntraced(function* (groupId: Group.Id) {
    const found = yield* groupStore.get(groupId);
    if (Option.isNone(found)) return yield* new NotFound({ groupId });
    return found.value;
  });

  const createTeam = Effect.fn("GroupService.createTeam")(
    function* (input: Group.CreateTeamInput, options: Request.Options = {}) {
      const request = yield* Schema.decodeEffect(Schema.toType(Group.CreateTeamInput))(input);
      yield* authorization.require([createGroupRequirement]);
      const actor = yield* Actor.Actor;
      const groupId = Group.Id.make(
        yield* Request.idFor(options.requestKey, ["group.create", workspaceId, actor.memberId]),
      );
      // A retry returns the group its first attempt created.
      if (options.requestKey !== undefined && Option.isSome(yield* groupStore.get(groupId)))
        return yield* requireGroup(groupId);
      const found = new Map(
        (yield* memberStore.getMany(request.memberIds)).map(
          (member) => [member.id, member] as const,
        ),
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
      for (const memberId of request.memberIds)
        yield* groupCommand
          .admitMember(group.id, memberId, createdAt)
          .pipe(Publication.withCause(created, createdAt));
      return group;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );

  const get = Effect.fn("GroupService.get")(function* (groupId: Group.Id) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    yield* groupQuery
      .requireAudience(id)
      .pipe(Effect.catchTag("GroupQuery.NotMember", () => new NotFound({ groupId: id })));
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId: id }),
    ]);
    return yield* requireGroup(id);
  });

  const rename = Effect.fn("GroupService.rename")(
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
      yield* groupQuery
        .requireAudience(request.groupId)
        .pipe(
          Effect.catchTag("GroupQuery.NotMember", () => new NotFound({ groupId: request.groupId })),
        );
      const group = yield* requireGroup(request.groupId);
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

  /** List items for one page of the actor's admissions, keyed by group, in a fixed number of reads. */
  const buildListItems = Effect.fnUntraced(function* (
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
    const grants = new Map(
      candidates.map((groupId, index) => {
        const [read = false, manage = false, rename = false, moderate = false] = allowed.slice(
          index * 4,
          index * 4 + 4,
        );
        return [groupId, { read, manage, rename, moderate }] as const;
      }),
    );
    const ids = candidates
      .filter((groupId) => grants.get(groupId)?.read === true)
      .toSorted(Order.String);
    const records = new Map(
      (yield* groupStore.getMany(ids)).map((group) => [group.id, group] as const),
    );
    const latest = new Map(
      (yield* groupStore.getLatest(ids)).map((value) => [value.groupId, value.occurredAt] as const),
    );
    const readTimes = new Map(
      (yield* readStateStore.getGroupReads(memberId, ids)).map(
        (value) => [value.groupId, value.readAt] as const,
      ),
    );
    const following = new Set(
      (yield* groupFollowStore.findActiveMany(
        ids.flatMap((groupId) => admissions.get(groupId)?.id ?? []),
      )).map((follow) => follow.groupMembershipId),
    );
    const pending = new Map(
      (yield* notificationStore.countPendingByGroup(
        Notification.ofMember(actor.memberId, actor.identity),
        ids,
      )).map((value) => [value.groupId, value.count] as const),
    );
    const items: Array<Group.ListItem> = [];
    for (const groupId of ids) {
      // A membership whose group is no longer stored is skipped, as a missing group reads.
      const group = records.get(groupId);
      const admission = admissions.get(groupId);
      const grant = grants.get(groupId);
      if (group === undefined || admission === undefined || grant === undefined) continue;
      const activity: Group.Activity = {
        latestActivityAt: latest.get(groupId) ?? null,
        readAt: readTimes.get(groupId) ?? null,
        following: following.has(admission.id),
        pending: pending.get(groupId) ?? 0,
      };
      items.push(Group.listItem(group, admission.admittedAt, activity, grant));
    }
    return items;
  });

  const listMine = Effect.fn("GroupService.listMine")(function* (input: Group.ListOptions) {
    const options = yield* Schema.decodeEffect(Group.ListOptions)(input);
    yield* authorization.require([]);
    const actor = yield* Actor.Actor;
    const items: Array<Group.ListItem> = [];
    let after = options.after;
    // Fill the page with readable groups, reading further when grants skip some.
    while (items.length < options.limit) {
      const admissions = new Map(
        (yield* groupMembershipStore.pageActiveByMember(
          actor.memberId,
          after === undefined
            ? { limit: options.limit }
            : { afterGroupId: after, limit: options.limit },
        )).map((membership) => [membership.groupId, membership] as const),
      );
      if (admissions.size === 0) break;
      for (const item of yield* buildListItems(actor, admissions))
        if (items.length < options.limit) items.push(item);
      after = [...admissions.keys()].at(-1);
      if (admissions.size < options.limit) break;
    }
    return items;
  });

  const listPublic = Effect.fn("GroupService.listPublic")(function* (input: Group.ListOptions) {
    const options = yield* Schema.decodeEffect(Group.ListOptions)(input);
    yield* authorization.require([]);
    const actor = yield* Actor.Actor;
    const items: Array<Group.PublicItem> = [];
    let after = options.after;
    // Fill the page with groups the actor may join, reading further when grants skip some.
    while (items.length < options.limit) {
      const page = yield* groupStore.pagePublic(
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
        (yield* groupMembershipStore.summarize([...ids], actor.memberId)).map(
          (summary) => [summary.groupId, summary] as const,
        ),
      );
      for (const group of joinable) {
        if (items.length === options.limit) break;
        const summary = summaries.get(group.id);
        items.push({ group, members: summary?.members ?? 0, joined: summary?.joined ?? false });
      }
      after = page.at(-1)?.id;
      if (page.length < options.limit) break;
    }
    return items;
  });

  return GroupService.of({
    createTeam,
    rename,
    get,
    listMine,
    listPublic,
  });
});

/** Provide group creation and authorized reads over the workspace's services. @category layers */
export const layer = Layer.effect(GroupService, make());
