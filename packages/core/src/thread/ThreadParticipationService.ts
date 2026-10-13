/**
 * The operations on participation an actor calls: following a thread, and unfollowing one. Both
 * are quiet in the timeline, notifying nobody. Replying and being mentioned admit participants
 * too, through the message operations.
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
import * as CoreError from "../error/CoreError.ts"
import * as GroupStore from "../group/GroupStore.ts"
import * as Actor from "../identity/Actor.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Store from "../journal/Store.ts"
import * as Operation from "../operation/Operation.ts"
import type * as Thread from "./Thread.ts"
import * as ThreadCommand from "./ThreadCommand.ts"
import * as ThreadParticipation from "./ThreadParticipation.ts"
import * as ThreadParticipationActivity from "./ThreadParticipationActivity.ts"
import * as ThreadParticipationFacts from "./ThreadParticipationFacts.ts"
import * as ThreadParticipationPermissions from "./ThreadParticipationPermissions.ts"
import * as ThreadParticipationStore from "./ThreadParticipationStore.ts"
import * as ThreadQuery from "./ThreadQuery.ts"

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
 * The participation operations, one of `Core.Operations`.
 *
 * The participation operations.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadParticipationService extends Context.Service<
  ThreadParticipationService,
  {
    /** Follow as the acting member. An existing participation is returned without new facts. */
    readonly follow: (threadId: Thread.Id) => Effect.Effect<ThreadParticipation.Summary, Error, Actor.Actor>
    /**
     * End only the actor's addressed participation, with no action grant required. Threads of a
     * direct conversation, where everyone takes part in everything, cannot be unfollowed.
     */
    readonly unfollow: (input: ThreadParticipation.UnfollowInput) => Effect.Effect<void, Error, Actor.Actor>
  }
>()("@amends-dev/core/thread/ThreadParticipationService") {}

/**
 * Capture bound services; authorize each operation inside its commit.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadParticipationService.make")(function* () {
  const authorization = yield* Authorization.Authorization
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const threadCommand = yield* ThreadCommand.ThreadCommand
  const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore
  const groupStore = yield* GroupStore.GroupStore
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto
  const { workspaceId } = yield* Store.Store
  const follow = Effect.fn("ThreadParticipationService.follow")(
    function* (threadId: Thread.Id) {
      const thread = yield* threadQuery.requireAccess(threadId)
      yield* authorization.require([
        Requirement.make(ThreadParticipationPermissions.Follow, {
          _tag: "Thread",
          workspaceId,
          threadId: thread.id
        })
      ])
      const actor = yield* Actor.Actor
      const [current] = yield* threadQuery.findParticipants(thread, [{ _tag: "Member", memberId: actor.memberId }])
      if (current !== undefined) return ThreadParticipation.toSummary(current)
      const followed = yield* threadCommand.publishActivity({
        thread,
        occurredAt: yield* DateTime.now,
        admit: [{ _tag: "Member", memberId: actor.memberId }],
        step: ({ admitted }) => {
          const [participant] = admitted.participants
          const [added] = admitted.added
          if (participant === undefined || added === undefined) return Effect.die("Following admitted no participation")
          return Effect.succeed({
            value: participant,
            kind: ThreadParticipationActivity.Followed,
            details: { participationId: participant.id },
            recipients: [],
            cause: added
          })
        }
      })
      return ThreadParticipation.toSummary(followed.value)
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )

  const unfollow = Effect.fn("ThreadParticipationService.unfollow")(
    function* (input: ThreadParticipation.UnfollowInput) {
      const request = yield* Schema.decodeEffect(ThreadParticipation.UnfollowInput)(input)
      const thread = yield* threadQuery.requireAccess(request.threadId)
      const group = yield* groupStore.get(thread.groupId)
      if (Option.isNone(group)) return yield* Effect.die("A thread's group is missing")
      if (group.value.kind === "Direct")
        return yield* new CoreError.Invalid({
          reason: new CoreError.FixedParticipation({ threadId: thread.id })
        })
      const actor = yield* Actor.Actor
      const found = yield* threadParticipationStore.get(request.participationId)
      if (Option.isNone(found))
        return yield* new CoreError.NotFound({
          resource: "ThreadParticipation",
          id: request.participationId
        })
      const participant = found.value
      const own = participant.participant
      if (
        participant.threadId !== thread.id ||
        !ThreadParticipation.Participant.isAnyOf(["Member"])(own) ||
        own.memberId !== actor.memberId
      )
        return yield* new CoreError.NotFound({
          resource: "ThreadParticipation",
          id: request.participationId
        })
      if (participant.status === "ended")
        return yield* new CoreError.Conflict({
          reason: new CoreError.AlreadyEnded({
            resource: "ThreadParticipation",
            id: request.participationId
          })
        })
      // Unfollowing ends the participation quietly in the timeline. Leaving or being removed from
      // the group ends participations with the departure instead, all together and without
      // thread activity.
      const occurredAt = yield* DateTime.now
      const reason: ThreadParticipation.EndReason = "unfollowed"
      yield* threadCommand.publishActivity({
        thread,
        occurredAt,
        step: () =>
          Effect.map(
            journal
              .publish(ThreadParticipationFacts.Ended, {
                workspaceId,
                threadId: thread.id,
                participationId: participant.id,
                groupId: thread.groupId,
                memberId: own.memberId,
                reason
              })
              .pipe(Publication.withOccurredAt(occurredAt)),
            (ended) => ({
              value: undefined,
              kind: ThreadParticipationActivity.Ended,
              details: { participationId: participant.id, reason },
              recipients: [],
              cause: ended
            })
          )
      })
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
    Operation.report
  )
  return ThreadParticipationService.of({ follow, unfollow })
})

/**
 * Provide the participation operations over the shared reads and writes, the stores, and
 * authorization.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadParticipationService, make())
