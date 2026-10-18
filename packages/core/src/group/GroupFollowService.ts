/**
 * The operations on following an actor calls: following a team group and unfollowing it, for
 * oneself or for an agent one may use. Following one thread is `ThreadParticipationService`.
 * Each operation authorizes the actor itself and writes inside one journal commit.
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
import * as AgentPermissions from "../agent/AgentPermissions.ts"
import * as Authorization from "../authorization/Authorization.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Identity from "../identity/Identity.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import * as MemberStore from "../workspace/MemberStore.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as GroupFollow from "./GroupFollow.ts"
import * as GroupFollowFacts from "./GroupFollowFacts.ts"
import * as GroupFollowStore from "./GroupFollowStore.ts"
import * as GroupMembershipStore from "./GroupMembershipStore.ts"
import * as GroupPermissions from "./GroupPermissions.ts"
import * as GroupQuery from "./GroupQuery.ts"
import * as GroupStore from "./GroupStore.ts"

/**
 * What following and unfollowing can fail with.
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
 * The follow operations, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class GroupFollowService extends Context.Service<
  GroupFollowService,
  {
    /**
     * Follow a team group, so that threads started there afterwards admit the member. Members
     * follow for themselves under `group.follow`; making an agent member follow needs `agent.use`
     * for it. The actor must belong to the group. Following again while following changes nothing.
     */
    readonly follow: (input: GroupFollow.Input) => Effect.Effect<void, Error, Actor.Actor>
    /**
     * Stop following a team group; current thread participation is unchanged. Members unfollow for
     * themselves without an action grant; an agent member needs `agent.use` for it. Unfollowing
     * while not following changes nothing.
     */
    readonly unfollow: (input: GroupFollow.Input) => Effect.Effect<void, Error, Actor.Actor>
  }
>()("@amends-dev/core/group/GroupFollowService") {}

/**
 * Capture the stores, the shared group read, the journal, and authorization; resolve authority
 * inside each commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const authorization = yield* Authorization.Authorization
  const groupQuery = yield* GroupQuery.GroupQuery
  const groupStore = yield* GroupStore.GroupStore
  const groupMembershipStore = yield* GroupMembershipStore.GroupMembershipStore
  const memberStore = yield* MemberStore.MemberStore
  const groupFollowStore = yield* GroupFollowStore.GroupFollowStore
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId

  /** The admission whose follow changes, after the checks that apply to the actor and target. */
  const authorizeFollowChange = Effect.fnUntraced(function* (input: GroupFollow.Input, following: boolean) {
    const request = yield* Schema.decodeEffect(GroupFollow.Input)(input)
    const own = yield* groupQuery.requireAudience(request.groupId)
    const foundGroup = yield* groupStore.get(request.groupId)
    if (Option.isNone(foundGroup)) return yield* Effect.die("An audience's group is missing")
    const group = foundGroup.value
    if (group.kind === "Direct")
      return yield* new CoreError.Invalid({
        reason: new CoreError.NotFollowable({ groupId: group.id })
      })
    const actor = yield* Actor.Actor
    if (request.memberId === actor.memberId) {
      // People follow for themselves under group.follow; unfollowing needs no grant.
      if (following)
        yield* authorization.require([
          Requirement.make(
            GroupPermissions.Follow,
            Target.Reference.cases.Group.make({ workspaceId, groupId: group.id })
          )
        ])
      return own
    }
    const admission = yield* groupMembershipStore.findActive(group.id, request.memberId)
    const found = yield* memberStore.get(request.memberId)
    if (Option.isNone(admission) || Option.isNone(found))
      return yield* new CoreError.Conflict({
        reason: new CoreError.ParticipantUnavailable({ memberId: request.memberId })
      })
    const member = found.value
    if (member.status !== "active")
      return yield* new CoreError.Conflict({
        reason: new CoreError.ParticipantUnavailable({ memberId: request.memberId })
      })
    if (!Identity.MemberReference.isAnyOf(["Agent"])(member.identity))
      return yield* new CoreError.Denied({
        reason: new CoreError.AgentRequired({ memberId: request.memberId })
      })
    // Directing an agent's attention is using it, in either direction.
    yield* authorization.require([
      Requirement.make(AgentPermissions.Use, Target.Reference.cases.Member.make({ workspaceId, memberId: member.id }))
    ])
    return admission.value
  })

  const follow = Effect.fn("GroupFollowService.follow")(
    function* (input: GroupFollow.Input) {
      const admission = yield* authorizeFollowChange(input, true)
      if (Option.isSome(yield* groupFollowStore.findActive(admission.id))) return
      const followedAt = yield* DateTime.now
      yield* journal
        .publish(GroupFollowFacts.Started, {
          id: yield* GroupFollow.newId(admission.groupId, admission.memberId),
          workspaceId,
          groupId: admission.groupId,
          memberId: admission.memberId,
          groupMembershipId: admission.id,
          followedAt,
          status: "active",
          endedAt: null
        })
        .pipe(Publication.withOccurredAt(followedAt))
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const unfollow = Effect.fn("GroupFollowService.unfollow")(
    function* (input: GroupFollow.Input) {
      const admission = yield* authorizeFollowChange(input, false)
      const existing = yield* groupFollowStore.findActive(admission.id)
      if (Option.isNone(existing)) return
      const follow = existing.value
      yield* journal.publish(GroupFollowFacts.Ended, {
        workspaceId,
        groupId: follow.groupId,
        followId: follow.id,
        memberId: follow.memberId
      })
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )
  return GroupFollowService.of({ follow, unfollow })
})

/**
 * Provide the follow operations over the stores, the shared group read, the journal, and
 * authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GroupFollowService, make)
