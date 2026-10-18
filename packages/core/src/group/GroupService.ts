/**
 * The operations on groups an actor calls: creating a team group, renaming one, and reading one
 * group, the actor's own groups as a sidebar lists them, and the workspace's public groups.
 * Membership is `GroupMembershipService`, following is `GroupFollowService`, and a direct group is
 * established by `ThreadService.startDirect`. Each operation authorizes the actor itself, writes
 * inside one journal commit, and reads outside any.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import * as Authorization from "../authorization/Authorization.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import * as ReadStateStore from "../read-state/ReadStateStore.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Group from "./Group.ts"
import * as GroupCommand from "./GroupCommand.ts"
import * as GroupFacts from "./GroupFacts.ts"
import * as GroupFollowStore from "./GroupFollowStore.ts"
import * as GroupId from "./GroupId.ts"
import type * as GroupMembership from "./GroupMembership.ts"
import * as GroupMembershipPermissions from "./GroupMembershipPermissions.ts"
import * as GroupMembershipStore from "./GroupMembershipStore.ts"
import * as GroupPermissions from "./GroupPermissions.ts"
import * as GroupQuery from "./GroupQuery.ts"
import * as GroupStore from "./GroupStore.ts"

/**
 * What changing a group can fail with, which `CreateError` and `RenameError` extend: authorization,
 * and what its commit meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = CoreError.Denied | CoreError.Invalid | CoreError.Unavailable | CoreError.Uncertain

/**
 * What creating a team group can fail with: a member to admit who is missing or not active. A
 * retried creation reads back the group its first attempt created, so it can also fail as that read
 * does.
 *
 * @category errors
 * @since 0.1.0
 */
export type CreateError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What renaming a team group can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type RenameError =
  | CoreError.NotFound
  | CoreError.Changed
  | CoreError.Denied
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What reading groups can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * The group operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class GroupService extends Context.Service<
  GroupService,
  {
    /**
     * Require group.create in this workspace, then create a team group, private unless the input
     * says otherwise, and its explicit initial admissions in one commit. No extra
     * membership-management grant is required for the initial audience. Within a request, a retry
     * returns the group its first attempt created; outside one, it creates a new group each time.
     */
    readonly createTeam: (input: Group.CreateTeamInput) => Effect.Effect<Group.Group, CreateError, Actor.Actor>
    /**
     * Require group.rename on the group and membership of it, then give a team group a new name. No
     * workspace role reaches a group from outside it: to a non-member, a group is
     * `CoreError.NotFound`, as a missing or foreign one is. A direct group, named by its members,
     * is `CoreError.Invalid` (`NotRenamable`). The same name again records nothing; otherwise a
     * name other than `expectedName` is `CoreError.Changed`, and nothing is recorded.
     */
    readonly rename: (input: Group.RenameInput) => Effect.Effect<Group.Group, RenameError, Actor.Actor>
    /** Require group.read and current audience membership; no transaction or publication. */
    readonly get: (groupId: GroupId.GroupId) => Effect.Effect<Group.Group, ReadError, Actor.Actor>
    /**
     * A page of the actor's current groups that `group.read` covers, in group-ID order, each with
     * its latest activity, when the actor last read it, whether it has new activity for them,
     * whether they follow it, and what their grants let them do to it. Each page reads a fixed
     * number of times, however large.
     */
    readonly listMine: (
      options: Group.ListOptions
    ) => Effect.Effect<ReadonlyArray<Group.ListItem>, ReadError, Actor.Actor>
    /**
     * A page of the workspace's public team groups that `group.join` covers for the actor, in
     * group-ID order, each with its member count and whether the actor belongs to it. Their threads
     * stay with their members. Each page reads a fixed number of times, however large.
     */
    readonly listPublic: (
      options: Group.ListOptions
    ) => Effect.Effect<ReadonlyArray<Group.PublicItem>, ReadError, Actor.Actor>
  }
>()("@amends-dev/core/group/GroupService") {}

/**
 * Capture the stores, the shared reads and writes, the journal, and authorization; resolve
 * authority and member eligibility inside each commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const memberStore = yield* MemberStore.MemberStore
  const groupStore = yield* GroupStore.GroupStore
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore
  const groupQuery = yield* GroupQuery.GroupQuery
  const groupCommand = yield* GroupCommand.GroupCommand
  const groupFollowStore = yield* GroupFollowStore.GroupFollowStore
  const readStateStore = yield* ReadStateStore.ReadStateStore
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId
  const createGroupRequirement = Requirement.make(
    GroupPermissions.Create,
    Target.Reference.cases.Workspace.make({ workspaceId })
  )

  /** The group, or `CoreError.NotFound` when it is not stored. */
  const requireGroup = Effect.fnUntraced(function* (groupId: GroupId.GroupId) {
    const found = yield* groupStore.get(groupId)
    if (Option.isNone(found)) return yield* new CoreError.NotFound({ resource: "Group", id: groupId })
    return found.value
  })

  const createTeam = Effect.fn("GroupService.createTeam")(
    function* (input: Group.CreateTeamInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Group.CreateTeamInput))(input)
      yield* authorization.require([createGroupRequirement])
      const actor = yield* Actor.Actor
      const groupId = yield* Group.newId
      // A retry returns the group its first attempt created.
      if (Option.isSome(yield* groupStore.get(groupId))) return yield* requireGroup(groupId)
      const found = new Map(
        (yield* memberStore.getMany(request.memberIds)).map((member) => [member.id, member] as const)
      )
      for (const memberId of request.memberIds) {
        const member = found.get(memberId)
        if (member === undefined) return yield* new CoreError.NotFound({ resource: "Member", id: memberId })
        if (member.status !== "active")
          return yield* new CoreError.Conflict({
            reason: new CoreError.InactiveMember({ memberId })
          })
      }
      const createdAt = yield* DateTime.now
      const group: Group.Group = {
        id: groupId,
        workspaceId,
        kind: "Team",
        visibility: request.visibility ?? "Private",
        name: request.name,
        createdBy: actor.memberId,
        createdAt
      }
      const created = yield* journal.publish(GroupFacts.Created, group).pipe(Publication.withOccurredAt(createdAt))
      for (const memberId of request.memberIds)
        yield* groupCommand.admitMember(group.id, memberId, createdAt).pipe(Publication.withCause(created, createdAt))
      return group
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const get = Effect.fn("GroupService.get")(function* (groupId: GroupId.GroupId) {
    const id = yield* Schema.decodeEffect(GroupId.GroupId)(groupId)
    yield* groupQuery.requireAudience(id)
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, Target.Reference.cases.Group.make({ workspaceId, groupId: id }))
    ])
    return yield* requireGroup(id)
  }, Operation.report)

  const rename = Effect.fn("GroupService.rename")(
    function* (input: Group.RenameInput) {
      const request = yield* Schema.decodeEffect(Schema.toType(Group.RenameInput))(input)
      yield* authorization.require([
        Requirement.make(
          GroupPermissions.Rename,
          Target.Reference.cases.Group.make({ workspaceId, groupId: request.groupId })
        )
      ])
      // Only its members may rename a group; to anyone else it is missing.
      yield* groupQuery.requireAudience(request.groupId)
      const group = yield* requireGroup(request.groupId)
      if (group.kind !== "Team")
        return yield* new CoreError.Invalid({
          reason: new CoreError.NotRenamable({ groupId: group.id })
        })
      if (group.name === request.name) return group
      if (group.name !== request.expectedName) return yield* new CoreError.Changed({ resource: "Group", id: group.id })
      yield* journal.publish(GroupFacts.Renamed, {
        workspaceId,
        groupId: group.id,
        name: request.name
      })
      return { ...group, name: request.name }
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  /**
   * List items for one page of the actor's admissions, keyed by group, in a fixed number of reads.
   */
  const buildListItems = Effect.fnUntraced(function* (
    actor: Actor.Actor["Service"],
    admissions: ReadonlyMap<GroupId.GroupId, GroupMembership.GroupMembership>
  ) {
    const memberId = actor.memberId
    // One grant resolution and one read per kind of record for the page.
    const candidates = [...admissions.keys()]
    const allowed = yield* authorization.permitted(
      candidates.flatMap((groupId) => [
        Requirement.make(GroupPermissions.Read, Target.Reference.cases.Group.make({ workspaceId, groupId })),
        Requirement.make(
          GroupMembershipPermissions.Manage,
          Target.Reference.cases.Group.make({ workspaceId, groupId })
        ),
        Requirement.make(GroupPermissions.Rename, Target.Reference.cases.Group.make({ workspaceId, groupId })),
        Requirement.make(GroupPermissions.Moderate, Target.Reference.cases.Group.make({ workspaceId, groupId }))
      ])
    )
    const grants = new Map(
      candidates.map((groupId, index) => {
        const [read = false, manage = false, rename = false, moderate = false] = allowed.slice(index * 4, index * 4 + 4)
        return [groupId, { read, manage, rename, moderate }] as const
      })
    )
    const ids = candidates.filter((groupId) => grants.get(groupId)?.read === true).toSorted(Order.String)
    const records = new Map((yield* groupStore.getMany(ids)).map((group) => [group.id, group] as const))
    const latest = new Map(
      (yield* groupStore.getLatest(ids)).map((value) => [value.groupId, value.occurredAt] as const)
    )
    const readTimes = new Map(
      (yield* readStateStore.getGroupReads(memberId, ids)).map((value) => [value.groupId, value.readAt] as const)
    )
    const following = new Set(
      (yield* groupFollowStore.findActiveMany(ids.flatMap((groupId) => admissions.get(groupId)?.id ?? []))).map(
        (follow) => follow.groupMembershipId
      )
    )
    const items: Array<Group.ListItem> = []
    for (const groupId of ids) {
      // A membership whose group is no longer stored is skipped, as a missing group reads.
      const group = records.get(groupId)
      const admission = admissions.get(groupId)
      const grant = grants.get(groupId)
      if (group === undefined || admission === undefined || grant === undefined) continue
      const activity: Group.Activity = {
        latestActivityAt: latest.get(groupId) ?? null,
        readAt: readTimes.get(groupId) ?? null,
        following: following.has(admission.id)
      }
      items.push(Group.listItem(group, admission.admittedAt, activity, grant))
    }
    return items
  })

  const listMine = Effect.fn("GroupService.listMine")(function* (input: Group.ListOptions) {
    const options = yield* Schema.decodeEffect(Group.ListOptions)(input)
    yield* authorization.require([])
    const actor = yield* Actor.Actor
    const items: Array<Group.ListItem> = []
    let after = options.after
    // Fill the page with readable groups, reading further when grants skip some.
    while (items.length < options.limit) {
      const admissions = new Map(
        (yield* groupMembershipStore.pageActiveByMember(
          actor.memberId,
          after === undefined ? { limit: options.limit } : { afterGroupId: after, limit: options.limit }
        )).map((membership) => [membership.groupId, membership] as const)
      )
      if (admissions.size === 0) break
      for (const item of yield* buildListItems(actor, admissions)) if (items.length < options.limit) items.push(item)
      after = [...admissions.keys()].at(-1)
      if (admissions.size < options.limit) break
    }
    return items
  }, Operation.report)

  const listPublic = Effect.fn("GroupService.listPublic")(function* (input: Group.ListOptions) {
    const options = yield* Schema.decodeEffect(Group.ListOptions)(input)
    yield* authorization.require([])
    const actor = yield* Actor.Actor
    const items: Array<Group.PublicItem> = []
    let after = options.after
    // Fill the page with groups the actor may join, reading further when grants skip some.
    while (items.length < options.limit) {
      const page = yield* groupStore.pagePublic(
        after === undefined ? { limit: options.limit } : { after, limit: options.limit }
      )
      if (page.length === 0) break
      const allowed = yield* authorization.permitted(
        page.map((group) =>
          Requirement.make(
            GroupMembershipPermissions.Join,
            Target.Reference.cases.Group.make({ workspaceId, groupId: group.id })
          )
        )
      )
      const joinable = page.filter((_, index) => allowed[index] === true)
      const ids = new Set(joinable.map((group) => group.id))
      const summaries = new Map(
        (yield* groupMembershipStore.summarize([...ids], actor.memberId)).map(
          (summary) => [summary.groupId, summary] as const
        )
      )
      for (const group of joinable) {
        if (items.length === options.limit) break
        const summary = summaries.get(group.id)
        items.push({ group, members: summary?.members ?? 0, joined: summary?.joined ?? false })
      }
      after = page.at(-1)?.id
      if (page.length < options.limit) break
    }
    return items
  }, Operation.report)

  return GroupService.of({
    createTeam,
    rename,
    get,
    listMine,
    listPublic
  })
})

/**
 * Provide the group operations over the stores, the shared reads and writes, the journal, and
 * authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GroupService, make)
