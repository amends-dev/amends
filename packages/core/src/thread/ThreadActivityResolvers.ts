/**
 * How recorded activity becomes timeline items. Each domain that records activity registers a
 * resolver for its kinds, which loads what a page's activities of those kinds reference in one
 * batch; this service routes each activity to the one resolver for its kind and returns the items
 * in timeline order. The composition root registers the resolvers.
 *
 * @since 0.1.0
 */
import { Context, Effect, Layer, Schema } from "effect";
import type { Thread } from "./Thread.ts";
import type { ThreadActivity } from "./ThreadActivity.ts";
import type { ThreadActivityKind } from "./ThreadActivityKind.ts";

/**
 * Storage failed while loading what activity references.
 *
 * @category errors
 * @since 0.1.0
 */
export class Failure extends Schema.TaggedError<Failure>()("ThreadActivityResolvers.Failure", {
  cause: Schema.Defect(),
}) {}

/**
 * No resolver is registered for a recorded kind, as when a newer host recorded it. A defect, not a
 * failure: reading such a kind dies with it.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unknown extends Schema.TaggedError<Unknown>()("ThreadActivityResolvers.Unknown", {
  kind: Schema.String,
}) {}

/**
 * What resolving can fail with.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = Failure;

/**
 * How a domain shows its kinds of activity in a timeline. Given activities of those kinds in one
 * thread, it loads what they reference in one batch and returns their items in the same order.
 *
 * @category models
 * @since 0.1.0
 */
export interface Resolver {
  readonly kinds: ReadonlyArray<ThreadActivityKind.Definition>;
  readonly resolve: (
    thread: Thread.Record,
    activities: ReadonlyArray<ThreadActivity.Record>,
  ) => Effect.Effect<ReadonlyArray<ThreadActivityKind.Item>, Failure>;
}

/**
 * The registered resolvers as one.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  /** Resolve a thread's activities of any registered kinds, in their order. */
  readonly resolve: (
    thread: Thread.Record,
    activities: ReadonlyArray<ThreadActivity.Record>,
  ) => Effect.Effect<ReadonlyArray<ThreadActivityKind.Item>, Error>;
}

/**
 * The resolvers of every registered kind, which `ThreadQuery` reads timelines through.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/ThreadActivityResolvers",
) {}

/**
 * Route each kind to the one resolver that registers it; two resolvers for one kind is a defect.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ThreadActivityResolvers.make")(function* (
  resolvers: ReadonlyArray<Resolver>,
) {
  const byKind = new Map<string, Resolver>();
  for (const resolver of resolvers)
    for (const kind of resolver.kinds) {
      if (byKind.has(kind.name)) return yield* Effect.die(`Kind ${kind.name} has two resolvers`);
      byKind.set(kind.name, resolver);
    }
  const resolve = Effect.fn("ThreadActivityResolvers.resolve")(function* (
    thread: Thread.Record,
    activities: ReadonlyArray<ThreadActivity.Record>,
  ) {
    const batches = new Map<Resolver, Array<ThreadActivity.Record>>();
    for (const activity of activities) {
      const resolver = byKind.get(activity.kind);
      if (resolver === undefined) return yield* Effect.die(new Unknown({ kind: activity.kind }));
      const batch = batches.get(resolver) ?? [];
      batch.push(activity);
      batches.set(resolver, batch);
    }
    const items = new Map<ThreadActivity.Id, ThreadActivityKind.Item>();
    for (const [resolver, batch] of batches)
      for (const item of yield* resolver.resolve(thread, batch)) items.set(item.activity.id, item);
    return activities.flatMap((activity) => {
      const item = items.get(activity.id);
      return item === undefined ? [] : [item];
    });
  });
  return Service.of({ resolve });
});

/**
 * Register the domains' resolvers, each built over the stores it reads.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = <const Resolvers extends ReadonlyArray<Effect.Effect<Resolver, any, any>>>(
  resolvers: Resolvers,
): Layer.Layer<Service, Effect.Error<Resolvers[number]>, Effect.Services<Resolvers[number]>> =>
  Layer.effect(
    Service,
    Effect.flatMap(
      Effect.all(
        resolvers as ReadonlyArray<
          Effect.Effect<
            Resolver,
            Effect.Error<Resolvers[number]>,
            Effect.Services<Resolvers[number]>
          >
        >,
      ),
      make,
    ),
  );

export * as ThreadActivityResolvers from "./ThreadActivityResolvers.ts";
