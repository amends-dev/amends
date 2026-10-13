/**
 * How a turn's activity appears in a thread's timeline: each kind in `TurnActivity` as an item of
 * its own, carrying the activity alone, since its details say everything the item shows, so the
 * resolver reads nothing beyond the page. A client folds a turn's items into one row at its
 * `turn.created` position.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Thread from "../thread/Thread.ts";
import type * as ThreadActivity from "../thread/ThreadActivity.ts";
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import type * as ThreadActivityResolvers from "../thread/ThreadActivityResolvers.ts";
import * as TurnActivity from "./TurnActivity.ts";

/**
 * A turn accepted here, or a retry asked again: where its row shows.
 *
 * @category schemas
 * @since 0.1.0
 */
export const CreatedItem = Schema.Struct({ activity: TurnActivity.Created.Activity });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface CreatedItem extends Schema.Schema.Type<typeof CreatedItem> {}

/**
 * The turn began working.
 *
 * @category schemas
 * @since 0.1.0
 */
export const StartedItem = Schema.Struct({ activity: TurnActivity.Started.Activity });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface StartedItem extends Schema.Schema.Type<typeof StartedItem> {}

/**
 * The turn was asked to stop while working.
 *
 * @category schemas
 * @since 0.1.0
 */
export const StoppingItem = Schema.Struct({ activity: TurnActivity.Stopping.Activity });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface StoppingItem extends Schema.Schema.Type<typeof StoppingItem> {}

/**
 * The turn ended, and how: its outcome, the reply it posted, and why it failed or was stopped.
 *
 * @category schemas
 * @since 0.1.0
 */
export const EndedItem = Schema.Struct({ activity: TurnActivity.Ended.Activity });

/**
 * @category schemas
 * @since 0.1.0
 */
export interface EndedItem extends Schema.Schema.Type<typeof EndedItem> {}

type Created = CreatedItem;
type Started = StartedItem;
type Stopping = StoppingItem;
type Ended = EndedItem;
declare module "../thread/ThreadActivityKind.ts" {
  interface Items {
    "turn.created": Created;
    "turn.started": Started;
    "turn.stopping": Stopping;
    "turn.ended": Ended;
  }
}

/**
 * Turn activity carries everything its items show, so resolving it reads nothing more: a thread
 * shows each turn where it began, as its later activity says it went.
 *
 * @category constructors
 * @since 0.1.0
 */
export const resolver = Effect.succeed({
  kinds: [TurnActivity.Created, TurnActivity.Started, TurnActivity.Stopping, TurnActivity.Ended],
  resolve: Effect.fn("TurnTimeline.resolve")(function* (
    _thread: Thread.Thread,
    listed: ReadonlyArray<ThreadActivity.ThreadActivity>,
  ) {
    return yield* Effect.orDie(
      Effect.forEach(listed, (activity) =>
        Effect.gen(function* (): Effect.fn.Return<
          ThreadActivityKind.Item,
          ThreadActivityKind.Mismatch | Schema.SchemaError
        > {
          if (ThreadActivityKind.is(TurnActivity.Created)(activity))
            return { activity: yield* ThreadActivityKind.decode(TurnActivity.Created, activity) };
          if (ThreadActivityKind.is(TurnActivity.Started)(activity))
            return { activity: yield* ThreadActivityKind.decode(TurnActivity.Started, activity) };
          if (ThreadActivityKind.is(TurnActivity.Stopping)(activity))
            return {
              activity: yield* ThreadActivityKind.decode(TurnActivity.Stopping, activity),
            };
          return { activity: yield* ThreadActivityKind.decode(TurnActivity.Ended, activity) };
        }),
      ),
    );
  }),
} satisfies ThreadActivityResolvers.Resolver);
