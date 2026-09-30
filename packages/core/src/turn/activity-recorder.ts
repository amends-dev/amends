import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { Event } from "../journal/event.ts";
import type { Publication } from "../journal/publication.ts";
import type { Store } from "../journal/store.ts";
import { ThreadActivityPublisher } from "../thread/activity/publisher.ts";
import type { ThreadId } from "../thread/id.ts";
import { ThreadStore } from "../thread/store.ts";
import { Thread } from "../thread/thread.ts";
import type { TurnActivity } from "./activity.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "TurnActivityRecorder.InvalidResponse",
  { message: Schema.String },
) {}
export type Error = ThreadActivityPublisher.Error | ThreadStore.Failure | InvalidResponse;

/**
 * Records a turn's changes in its thread's timeline as `TurnActivity`. It lives apart from the
 * kinds, so protocols that read timelines carry none of it.
 */
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /**
   * Record a turn's change in its thread's timeline, in the caller's commit, caused by the turn
   * fact that reports it. It informs no one.
   */
  readonly record: <
    K extends
      | typeof TurnActivity.Created
      | typeof TurnActivity.Started
      | typeof TurnActivity.Stopping
      | typeof TurnActivity.Ended,
  >(
    thread: Thread.Record | ThreadId.Id,
    kind: K,
    details: K["details"]["Type"],
    cause: Event.Record,
  ) => Effect.Effect<void, Error, Store.Transaction | Publication.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/activity-recorder/Service",
) {}

/** @category constructors */
export const make = Effect.fn("TurnActivityRecorder.make")(function* () {
  const publisher = yield* ThreadActivityPublisher.Service;
  const threads = yield* ThreadStore.Service;
  const workspaceId = publisher.workspaceId;
  if (threads.workspaceId !== workspaceId)
    return yield* new InvalidResponse({
      message: "Turn activity services belong to different workspaces",
    });
  const decode = Schema.decodeEffect(Schema.toType(Thread.Record));
  const record: Interface["record"] = Effect.fnUntraced(function* (thread, kind, details, cause) {
    const found =
      typeof thread === "string"
        ? yield* Effect.flatMap(threads.get(thread), (row) =>
            Option.isNone(row)
              ? Effect.fail(new InvalidResponse({ message: "The turn's thread is missing" }))
              : decode(row.value).pipe(
                  Effect.mapError((cause) => new InvalidResponse({ message: cause.message })),
                ),
          )
        : thread;
    const occurredAt = yield* DateTime.now;
    yield* publisher.publish({
      thread: found,
      occurredAt,
      step: () => Effect.succeed({ value: undefined, kind, details, recipients: [], cause }),
    });
  });
  return Service.of({ workspaceId, record });
});

/** Internal service: callers own authorization and the commit. @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnActivityRecorder from "./activity-recorder.ts";
