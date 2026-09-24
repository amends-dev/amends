import { Context, Effect, Layer, Schema } from "effect";
import type { WorkspaceId } from "../../workspace/id.ts";
import type { Thread } from "../thread.ts";
import type { ThreadActivity } from "./activity.ts";
import type { ThreadActivityKind } from "./kind.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadActivityResolvers.InvalidResponse",
  { message: Schema.String },
) {}
/** Storage failed while loading what activity references. */
export class Failure extends Schema.TaggedError<Failure>()("ThreadActivityResolvers.Failure", {
  cause: Schema.Defect(),
}) {}
/** No resolver is registered for a recorded kind, as when a newer host recorded it. */
export class Unknown extends Schema.TaggedError<Unknown>()("ThreadActivityResolvers.Unknown", {
  kind: Schema.String,
}) {}
export type Error = InvalidResponse | Failure | Unknown;

/**
 * How a domain shows its kinds of activity in a timeline. Given activities of those kinds in one
 * thread, it loads what they reference in one batch and returns their items in the same order.
 */
export interface Resolver {
  readonly workspaceId: WorkspaceId.Id;
  readonly kinds: ReadonlyArray<ThreadActivityKind.Definition>;
  readonly resolve: (
    thread: Thread.Record,
    activities: ReadonlyArray<ThreadActivity.Record>,
  ) => Effect.Effect<ReadonlyArray<ThreadActivityKind.Item>, InvalidResponse | Failure>;
}

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /** Resolve a thread's activities of any registered kinds, in their order. */
  readonly resolve: (
    thread: Thread.Record,
    activities: ReadonlyArray<ThreadActivity.Record>,
  ) => Effect.Effect<ReadonlyArray<ThreadActivityKind.Item>, Error>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/activity/resolvers/Service",
) {}

/** Route each kind to the one resolver that registers it. @category constructors */
export const make = Effect.fn("ThreadActivityResolvers.make")(function* (
  resolvers: ReadonlyArray<Resolver>,
) {
  const [first] = resolvers;
  if (first === undefined || resolvers.some((r) => r.workspaceId !== first.workspaceId))
    return yield* new InvalidResponse({
      message: "Activity resolvers must share one workspace",
    });
  const byKind = new Map<string, Resolver>();
  for (const resolver of resolvers)
    for (const kind of resolver.kinds) {
      if (byKind.has(kind.name))
        return yield* new InvalidResponse({ message: `Kind ${kind.name} has two resolvers` });
      byKind.set(kind.name, resolver);
    }
  const resolve = Effect.fn("ThreadActivityResolvers.resolve")(function* (
    thread: Thread.Record,
    activities: ReadonlyArray<ThreadActivity.Record>,
  ) {
    const batches = new Map<Resolver, Array<ThreadActivity.Record>>();
    for (const activity of activities) {
      const resolver = byKind.get(activity.kind);
      if (resolver === undefined) return yield* new Unknown({ kind: activity.kind });
      const batch = batches.get(resolver) ?? [];
      batch.push(activity);
      batches.set(resolver, batch);
    }
    const items = new Map<ThreadActivity.Id, ThreadActivityKind.Item>();
    for (const [resolver, batch] of batches) {
      const resolved = yield* resolver.resolve(thread, batch);
      if (
        resolved.length !== batch.length ||
        resolved.some((item, index) => item.activity.id !== batch[index]?.id)
      )
        return yield* new InvalidResponse({
          message: "A resolver returned other activities than it was given",
        });
      for (const item of resolved) items.set(item.activity.id, item);
    }
    return activities.flatMap((activity) => {
      const item = items.get(activity.id);
      return item === undefined ? [] : [item];
    });
  });
  return Service.of({ workspaceId: first.workspaceId, resolve });
});

/** Register the domains' resolvers, built over their stores. @category layers */
export const layer = <const Resolvers extends ReadonlyArray<Effect.Effect<Resolver, any, any>>>(
  resolvers: Resolvers,
): Layer.Layer<
  Service,
  Effect.Error<Resolvers[number]> | InvalidResponse,
  Effect.Services<Resolvers[number]>
> =>
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

export * as ThreadActivityResolvers from "./resolvers.ts";
