import { Effect, Schema } from "effect";
import type * as Thread from "../thread/Thread.ts";
import type * as ThreadActivity from "../thread/ThreadActivity.ts";
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import * as ThreadActivityResolvers from "../thread/ThreadActivityResolvers.ts";
import * as TurnActivity from "./TurnActivity.ts";

/** A turn accepted here: where its row shows. */
export const CreatedItem = Schema.Struct({ activity: TurnActivity.Created.Activity });
export interface CreatedItem extends Schema.Schema.Type<typeof CreatedItem> {}
/** The turn began working. */
export const StartedItem = Schema.Struct({ activity: TurnActivity.Started.Activity });
export interface StartedItem extends Schema.Schema.Type<typeof StartedItem> {}
/** The turn was asked to stop while working. */
export const StoppingItem = Schema.Struct({ activity: TurnActivity.Stopping.Activity });
export interface StoppingItem extends Schema.Schema.Type<typeof StoppingItem> {}
/** The turn ended, and how. */
export const EndedItem = Schema.Struct({ activity: TurnActivity.Ended.Activity });
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
 */
export const resolver = Effect.succeed({
  kinds: [TurnActivity.Created, TurnActivity.Started, TurnActivity.Stopping, TurnActivity.Ended],
  resolve: Effect.fn("TurnTimeline.resolve")(function* (
    _thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
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
