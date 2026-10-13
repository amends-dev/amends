/**
 * How a thread's title appears in its timeline: a rename, whose details carry both titles, so
 * resolving one reads nothing.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Thread from "./Thread.ts";
import type * as ThreadActivity from "./ThreadActivity.ts";
import * as ThreadActivityKind from "./ThreadActivityKind.ts";
import type * as ThreadActivityResolvers from "./ThreadActivityResolvers.ts";
import * as ThreadTitleActivity from "./ThreadTitleActivity.ts";

/**
 * A rename in its thread's timeline: the title it gave, and the one it replaced.
 *
 * @category schemas
 * @since 0.1.0
 */
export const RenamedItem = Schema.Struct({ activity: ThreadTitleActivity.Renamed.Activity });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface RenamedItem extends Schema.Schema.Type<typeof RenamedItem> {}

type Renamed = RenamedItem;

declare module "./ThreadActivityKind.ts" {
  interface Items {
    "thread.renamed": Renamed;
  }
}

/**
 * Resolve renames from their own details.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolver = Effect.succeed({
  kinds: [ThreadTitleActivity.Renamed],
  resolve: Effect.fn("ThreadTitleTimeline.resolve")(function* (
    _thread: Thread.Thread,
    listed: ReadonlyArray<ThreadActivity.ThreadActivity>,
  ) {
    return yield* Effect.orDie(
      Effect.forEach(listed, (activity) =>
        Effect.map(
          ThreadActivityKind.decode(ThreadTitleActivity.Renamed, activity),
          (activity): RenamedItem => ({ activity }),
        ),
      ),
    );
  }),
} satisfies ThreadActivityResolvers.Resolver);
