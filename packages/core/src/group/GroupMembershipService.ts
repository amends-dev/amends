/**
 * The operations on group membership an actor calls: adding a member to a team group, removing
 * one, joining a public group, leaving a team group, and listing a group's current admissions.
 * Creating a group with its first members is `GroupService.createTeam`, and a direct group's
 * members are fixed when it is established. Each operation authorizes the actor itself, writes
 * inside one journal commit through `GroupCommand`, and reads outside any.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Authorization from "../authorization/Authorization.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Group from "./Group.ts"
import * as GroupCommand from "./GroupCommand.ts"
import * as GroupId from "./GroupId.ts"
import * as GroupMembership from "./GroupMembership.ts"
import * as GroupMembershipPermissions from "./GroupMembershipPermissions.ts"
import * as GroupMembershipStore from "./GroupMembershipStore.ts"
import * as GroupPermissions from "./GroupPermissions.ts"
import * as GroupQuery from "./GroupQuery.ts"
import * as GroupStore from "./GroupStore.ts"

/**
 * What changing membership can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain

/**
 * What listing admissions can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type ReadError = CoreError.NotFound | CoreError.Denied | CoreError.Invalid | CoreError.Unavailable

/**
 * The membership operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class GroupMembershipService extends Context.Service<
  GroupMembershipService,
  {
    /**
     * Require group.membership.manage on this group and membership of it, validate its active
     * workspace member, and publish a fresh admission in one commit. An active admission is
     * rejected without another fact. No workspace role reaches a group from outside it: to a
     * non-member, a group is `CoreError.NotFound`, as a missing one is. Adding, removing, and
     * leaving apply to team groups; direct groups reject them as fixed.
     */
    readonly add: (
      input: GroupMembership.AddInput
    ) => Effect.Effect<GroupMembership.GroupMembership, Error, Actor.Actor>
    /**
     * End this team-group admission, requiring group.membership.manage on its group and membership
     * of it. Any member may remove others from a private group; removing someone else from a public
     * one also requires group.moderate. Nobody is removed from the general group.
     */
    readonly remove: (
      input: GroupMembership.RemoveInput
    ) => Effect.Effect<GroupMembership.GroupMembership, Error, Actor.Actor>
    /**
     * Join a public team group as the actor, under group.join on it. Private and direct groups are
     * `CoreError.NotFound` like missing ones, so joining discloses nothing about them. Joining
     * again returns the actor's current admission and records nothing.
     */
    readonly join: (groupId: GroupId.GroupId) => Effect.Effect<GroupMembership.GroupMembership, Error, Actor.Actor>
    /**
     * End only the actor's own team-group admission; active workspace membership is sufficient.
     * Nobody leaves the general group.
     */
    readonly leave: (
      input: GroupMembership.LeaveInput
    ) => Effect.Effect<GroupMembership.GroupMembership, Error, Actor.Actor>
    /**
     * A page of current admissions of active workspace members, in admission-ID order; require
     * group.read and audience membership.
     */
    readonly listCurrent: (
      groupId: GroupId.GroupId,
      options: GroupMembership.ListOptions
    ) => Effect.Effect<ReadonlyArray<GroupMembership.GroupMembership>, ReadError, Actor.Actor>
  }
>()("@amends-dev/core/group/GroupMembershipService") {}

/**
 * Capture the stores, the shared group read and writes, the journal, and authorization; resolve
 * authority inside each commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const groupStore = yield* GroupStore.GroupStore
  const memberStore = yield* MemberStore.MemberStore
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore
  const groupCommand = yield* GroupCommand.GroupCommand
  const groupQuery = yield* GroupQuery.GroupQuery
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId

  /**
   * Management needs the grant and membership of the group; to anyone outside it, it is missing.
   */
  const requireManagement = Effect.fnUntraced(function* (groupId: GroupId.GroupId) {
    yield* authorization.require([
      Requirement.make(GroupMembershipPermissions.Manage, Target.Reference.cases.Group.make({ workspaceId, groupId }))
    ])
    yield* groupQuery.requireAudience(groupId)
  })

  /** The group, or `CoreError.NotFound` when it is not stored. */
  const requireGroup = Effect.fnUntraced(function* (groupId: GroupId.GroupId) {
    const foundGroup = yield* groupStore.get(groupId)
    if (Option.isNone(foundGroup)) return yield* new CoreError.NotFound({ resource: "Group", id: groupId })
    return foundGroup.value
  })

  /** The group, when it is a team: a direct group keeps the members it started with. */
  const requireTeamGroup = Effect.fnUntraced(function* (groupId: GroupId.GroupId) {
    const group = yield* requireGroup(groupId)
    if (group.kind === "Direct")
      return yield* new CoreError.Invalid({ reason: new CoreError.FixedMembership({ groupId }) })
    return group
  })

  /** Admit the member to the group now, returning the new admission. */
  const admitMember = Effect.fnUntraced(function* (groupId: GroupId.GroupId, memberId: MemberId.MemberId) {
    const admitted = yield* groupCommand.admitMember(groupId, memberId, yield* DateTime.now)
    return admitted.membership
  })

  const add = Effect.fn("GroupMembershipService.add")(
    function* (input: GroupMembership.AddInput) {
      const { groupId, memberId } = yield* Schema.decodeEffect(GroupMembership.AddInput)(input)
      yield* requireManagement(groupId)
      yield* requireTeamGroup(groupId)

      const member = yield* memberStore.get(memberId)
      if (Option.isNone(member)) return yield* new CoreError.NotFound({ resource: "Member", id: memberId })
      if (member.value.status !== "active")
        return yield* new CoreError.Conflict({
          reason: new CoreError.InactiveMember({ memberId })
        })
      if (Option.isSome(yield* groupMembershipStore.findActive(groupId, memberId)))
        return yield* new CoreError.Conflict({
          reason: new CoreError.AlreadyMember({ groupId, memberId })
        })
      return yield* admitMember(groupId, memberId)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const join = Effect.fn("GroupMembershipService.join")(
    function* (input: GroupId.GroupId) {
      const groupId = yield* Schema.decodeEffect(GroupId.GroupId)(input)
      yield* authorization.require([
        Requirement.make(GroupMembershipPermissions.Join, Target.Reference.cases.Group.make({ workspaceId, groupId }))
      ])
      const actor = yield* Actor.Actor
      const group = yield* requireGroup(groupId)
      if (group.kind !== "Team" || group.visibility !== "Public")
        return yield* new CoreError.NotFound({ resource: "Group", id: groupId })
      const current = yield* groupMembershipStore.findActive(groupId, actor.memberId)
      if (Option.isSome(current)) return current.value
      return yield* admitMember(groupId, actor.memberId)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  /** The admission the input names in its group, or `CoreError.NotFound`. */
  const requireMembership = Effect.fnUntraced(function* (input: GroupMembership.RemoveInput) {
    const found = yield* groupMembershipStore.get(input.membershipId)
    if (Option.isNone(found) || found.value.groupId !== input.groupId)
      return yield* new CoreError.NotFound({ resource: "GroupMembership", id: input.membershipId })
    return found.value
  })

  /** End an active admission for the given reason, returning it as removed. */
  const endMembership = Effect.fnUntraced(function* (
    membership: GroupMembership.GroupMembership,
    reason: "removed" | "left"
  ) {
    if (membership.status === "removed")
      return yield* new CoreError.Conflict({
        reason: new CoreError.AlreadyEnded({ resource: "GroupMembership", id: membership.id })
      })
    const occurredAt = yield* DateTime.now
    yield* groupCommand.removeMembership(
      {
        workspaceId,
        groupId: membership.groupId,
        membershipId: membership.id,
        memberId: membership.memberId,
        reason
      },
      occurredAt
    )
    return Object.assign({}, membership, { status: "removed" as const })
  })

  const remove = Effect.fn("GroupMembershipService.remove")(
    function* (input: GroupMembership.RemoveInput) {
      const checked = yield* Schema.decodeEffect(GroupMembership.RemoveInput)(input)
      yield* requireManagement(checked.groupId)
      const group = yield* requireTeamGroup(checked.groupId)
      const membership = yield* requireMembership(checked)
      if (Group.isGeneral(group))
        return yield* new CoreError.Invalid({
          reason: new CoreError.GeneralMembership({ groupId: group.id })
        })
      // Removing someone from a public group is moderation; a private one is its members' to tidy.
      const actor = yield* Actor.Actor
      if (group.visibility === "Public" && membership.memberId !== actor.memberId)
        yield* authorization.require([
          Requirement.make(
            GroupPermissions.Moderate,
            Target.Reference.cases.Group.make({ workspaceId, groupId: checked.groupId })
          )
        ])
      return yield* endMembership(membership, "removed")
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const leave = Effect.fn("GroupMembershipService.leave")(
    function* (input: GroupMembership.LeaveInput) {
      const checked = yield* Schema.decodeEffect(GroupMembership.LeaveInput)(input)
      yield* authorization.require([])
      const actor = yield* Actor.Actor
      const membership = yield* requireMembership(checked)
      // Do not disclose another member's admission or departure state through self-service.
      if (membership.memberId !== actor.memberId)
        return yield* new CoreError.NotFound({
          resource: "GroupMembership",
          id: checked.membershipId
        })
      const group = yield* requireTeamGroup(checked.groupId)
      if (Group.isGeneral(group))
        return yield* new CoreError.Invalid({
          reason: new CoreError.GeneralMembership({ groupId: group.id })
        })
      return yield* endMembership(membership, "left")
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  /**
   * Fill a page with admissions whose workspace member is still active, reading further as needed.
   */
  const pageCurrentMemberships = Effect.fnUntraced(function* (
    groupId: GroupId.GroupId,
    input: GroupMembership.ListOptions
  ) {
    const options = yield* Schema.decodeEffect(GroupMembership.ListOptions)(input)
    yield* requireGroup(groupId)
    const active: Array<GroupMembership.GroupMembership> = []
    let after = options.after
    while (active.length < options.limit) {
      const page = yield* groupMembershipStore.pageActiveByGroup(
        groupId,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit }
      )
      if (page.length === 0) break
      // One read for the page's members; only admissions of active members are current.
      const members = yield* memberStore.getMany([...new Set(page.map((membership) => membership.memberId))])
      const membersById = new Map(members.map((member) => [member.id, member]))
      for (const membership of page) {
        // The next page starts after the last admission seen, current or not.
        after = membership.id
        if (active.length === options.limit) continue
        if (membersById.get(membership.memberId)?.status === "active") active.push(membership)
      }
      if (page.length < options.limit) break
    }
    return active
  })

  const listCurrent = Effect.fn("GroupMembershipService.listCurrent")(function* (
    groupId: GroupId.GroupId,
    options: GroupMembership.ListOptions
  ) {
    const id = yield* Schema.decodeEffect(GroupId.GroupId)(groupId)
    yield* groupQuery.requireAudience(id)
    yield* authorization.require([
      Requirement.make(GroupPermissions.Read, Target.Reference.cases.Group.make({ workspaceId, groupId: id }))
    ])
    return yield* pageCurrentMemberships(id, options)
  }, Operation.report)
  return GroupMembershipService.of({
    add,
    join,
    remove,
    leave,
    listCurrent
  })
})

/**
 * Provide the membership operations over the stores, the shared group read and writes, the
 * journal, and authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GroupMembershipService, make)
