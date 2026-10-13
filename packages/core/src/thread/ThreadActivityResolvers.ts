/**
 * How recorded activity becomes timeline items. Each domain that records activity registers a
 * resolver for its kinds, which loads what a page's activities of those kinds reference in one
 * batch; this service routes each activity to the one resolver for its kind and returns the items
 * in timeline order. The composition root registers the resolvers.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as StoreError from "../journal/StoreError.ts"
import type * as Thread from "./Thread.ts"
import type * as ThreadActivity from "./ThreadActivity.ts"
import type * as ThreadActivityKind from "./ThreadActivityKind.ts"

/**
 * No resolver is registered for a recorded kind, as when a newer host recorded it. A defect, not a
 * failure: reading such a kind dies with it.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unknown extends Schema.TaggedError<Unknown>()("ThreadActivityResolvers.Unknown", {
  kind: Schema.String
}) {}

/**
 * How a domain shows its kinds of activity in a timeline. Given activities of those kinds in one
 * thread, it loads what they reference in one batch and returns their items in the same order.
 *
 * @category models
 * @since 0.1.0
 */
export interface Resolver {
  readonly kinds: ReadonlyArray<ThreadActivityKind.Definition>
  readonly resolve: (
    thread: Thread.Thread,
    activities: ReadonlyArray<ThreadActivity.ThreadActivity>
  ) => Effect.Effect<ReadonlyArray<ThreadActivityKind.Item>, StoreError.StoreError>
}

/**
 * The resolvers of every registered kind, which `ThreadQuery` reads timelines through.
 *
 * The registered resolvers as one.
 *
 * @category services
 * @since 0.1.0
 */
export class ThreadActivityResolvers extends Context.Service<
  ThreadActivityResolvers,
  {
    /** Resolve a thread's activities of any registered kinds, in their order. */
    readonly resolve: (
      thread: Thread.Thread,
      activities: ReadonlyArray<ThreadActivity.ThreadActivity>
    ) => Effect.Effect<ReadonlyArray<ThreadActivityKind.Item>, StoreError.StoreError>
  }
>()("@amends-dev/core/thread/ThreadActivityResolvers") {}

/**
 * Route each kind to the one resolver that registers it; two resolvers for one kind is a defect.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fnUntraced(function* (resolvers: ReadonlyArray<Resolver>) {
  const byKind = new Map<string, Resolver>()
  for (const resolver of resolvers)
    for (const kind of resolver.kinds) {
      if (byKind.has(kind.name)) return yield* Effect.die(`Kind ${kind.name} has two resolvers`)
      byKind.set(kind.name, resolver)
    }
  const resolve = Effect.fn("ThreadActivityResolvers.resolve")(function* (
    thread: Thread.Thread,
    activities: ReadonlyArray<ThreadActivity.ThreadActivity>
  ) {
    const batches = new Map<Resolver, Array<ThreadActivity.ThreadActivity>>()
    for (const activity of activities) {
      const resolver = byKind.get(activity.kind)
      if (resolver === undefined) return yield* Effect.die(new Unknown({ kind: activity.kind }))
      const batch = batches.get(resolver) ?? []
      batch.push(activity)
      batches.set(resolver, batch)
    }
    const items = new Map<ThreadActivity.ThreadActivityId, ThreadActivityKind.Item>()
    for (const [resolver, batch] of batches)
      for (const item of yield* resolver.resolve(thread, batch)) items.set(item.activity.id, item)
    return activities.flatMap((activity) => {
      const item = items.get(activity.id)
      return item === undefined ? [] : [item]
    })
  })
  return ThreadActivityResolvers.of({ resolve })
})

/**
 * Register the domains' resolvers, each built over the stores it reads.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = <const Resolvers extends ReadonlyArray<Effect.Effect<Resolver, any, any>>>(
  resolvers: Resolvers
): Layer.Layer<ThreadActivityResolvers, Effect.Error<Resolvers[number]>, Effect.Services<Resolvers[number]>> =>
  Layer.effect(
    ThreadActivityResolvers,
    Effect.flatMap(
      Effect.all(
        resolvers as ReadonlyArray<
          Effect.Effect<Resolver, Effect.Error<Resolvers[number]>, Effect.Services<Resolvers[number]>>
        >
      ),
      make
    )
  )
