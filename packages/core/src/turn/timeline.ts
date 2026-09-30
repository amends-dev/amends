import { Effect, Schema } from "effect";
import type { Thread } from "../thread/thread.ts";
import type { ThreadActivity } from "../thread/activity/activity.ts";
import { ThreadActivityKind } from "../thread/activity/kind.ts";
import { ThreadActivityResolvers } from "../thread/activity/resolvers.ts";
import { ThreadStore } from "../thread/store.ts";
import { TurnActivity } from "./activity.ts";

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
declare module "../thread/activity/kind.ts" {
  interface Items {
    "turn.created": Created;
    "turn.started": Started;
    "turn.stopping": Stopping;
    "turn.ended": Ended;
  }
}

const invalid = (message: string) => new ThreadActivityResolvers.InvalidResponse({ message });

/**
 * Turn activity carries everything its items show, so resolving it reads nothing more: a thread
 * shows each turn where it began, as its later activity says it went.
 *
 * @category constructors
 */
export const resolver = Effect.gen(function* () {
  const threads = yield* ThreadStore.Service;
  const resolve = Effect.fn("TurnTimeline.resolve")(function* (
    _thread: Thread.Record,
    listed: ReadonlyArray<ThreadActivity.Record>,
  ) {
    return yield* Effect.forEach(listed, (activity) =>
      Effect.gen(function* (): Effect.fn.Return<
        ThreadActivityKind.Item,
        ThreadActivityKind.Mismatch | Schema.SchemaError
      > {
        if (ThreadActivityKind.is(TurnActivity.Created)(activity))
          return { activity: yield* ThreadActivityKind.decode(TurnActivity.Created, activity) };
        if (ThreadActivityKind.is(TurnActivity.Started)(activity))
          return { activity: yield* ThreadActivityKind.decode(TurnActivity.Started, activity) };
        if (ThreadActivityKind.is(TurnActivity.Stopping)(activity))
          return { activity: yield* ThreadActivityKind.decode(TurnActivity.Stopping, activity) };
        return { activity: yield* ThreadActivityKind.decode(TurnActivity.Ended, activity) };
      }).pipe(Effect.mapError((cause) => invalid(`Invalid turn activity: ${cause.message}`))),
    );
  });
  return {
    workspaceId: threads.workspaceId,
    kinds: [TurnActivity.Created, TurnActivity.Started, TurnActivity.Stopping, TurnActivity.Ended],
    resolve,
  } satisfies ThreadActivityResolvers.Resolver;
});

export * as TurnTimeline from "./timeline.ts";
