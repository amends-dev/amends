/**
 * How participation appears in a timeline: a follow or an ending with the participant's public
 * summary, read by ID, so a page of them costs one read of the participation store.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type * as Thread from "./Thread.ts"
import type * as ThreadActivity from "./ThreadActivity.ts"
import * as ThreadActivityKind from "./ThreadActivityKind.ts"
import type * as ThreadActivityResolvers from "./ThreadActivityResolvers.ts"
import * as ThreadParticipation from "./ThreadParticipation.ts"
import * as ThreadParticipationActivity from "./ThreadParticipationActivity.ts"
import * as ThreadParticipationStore from "./ThreadParticipationStore.ts"

/**
 * A member following the thread, with their public participant summary.
 *
 * @category schemas
 * @since 0.1.0
 */
export const FollowedItem = Schema.Struct({
  activity: ThreadParticipationActivity.Followed.Activity,
  participant: ThreadParticipation.Summary
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface FollowedItem extends Schema.Schema.Type<typeof FollowedItem> {}

/**
 * A participation ending, with the participant's public summary as it was when they joined.
 *
 * @category schemas
 * @since 0.1.0
 */
export const EndedItem = Schema.Struct({
  activity: ThreadParticipationActivity.Ended.Activity,
  participant: ThreadParticipation.Summary
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface EndedItem extends Schema.Schema.Type<typeof EndedItem> {}

type Followed = FollowedItem

type Ended = EndedItem

declare module "./ThreadActivityKind.ts" {
  interface Items {
    "participation.followed": Followed
    "participation.ended": Ended
  }
}

const decode = (
  activity: ThreadActivity.ThreadActivity
): Effect.Effect<
  ThreadParticipationActivity.Followed | ThreadParticipationActivity.Ended,
  ThreadActivityKind.Mismatch | Schema.SchemaError
> =>
  ThreadActivityKind.is(ThreadParticipationActivity.Followed)(activity)
    ? ThreadActivityKind.decode(ThreadParticipationActivity.Followed, activity)
    : ThreadActivityKind.decode(ThreadParticipationActivity.Ended, activity)

/**
 * Resolve follows and endings with one read of their participations.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolver = Effect.gen(function* () {
  const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore
  const resolve = Effect.fn("ThreadParticipationTimeline.resolve")(function* (
    _thread: Thread.Thread,
    listed: ReadonlyArray<ThreadActivity.ThreadActivity>
  ) {
    const activities = yield* Effect.orDie(Effect.forEach(listed, (activity) => decode(activity)))
    const rows = yield* threadParticipationStore.getMany([
      ...new Set(activities.map((activity) => activity.details.participationId))
    ])
    const found = new Map(rows.map((participant) => [participant.id, participant] as const))
    return yield* Effect.forEach(activities, (activity): Effect.Effect<FollowedItem | EndedItem> => {
      const participant = found.get(activity.details.participationId)
      if (participant === undefined) return Effect.die("A timeline activity's participation is missing")
      const summary = ThreadParticipation.toSummary(participant)
      return Effect.succeed(
        activity.kind === ThreadParticipationActivity.Followed.name
          ? ({ activity, participant: summary } satisfies FollowedItem)
          : ({ activity, participant: summary } satisfies EndedItem)
      )
    })
  })
  return {
    kinds: [ThreadParticipationActivity.Followed, ThreadParticipationActivity.Ended],
    resolve
  } satisfies ThreadActivityResolvers.Resolver
})
