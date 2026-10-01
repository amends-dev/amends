import { Context, Effect, Layer, Option, Schema } from "effect";
import type { Actor } from "../identity/actor.ts";
import type { Authorization } from "../authorization/authorization.ts";
import { Journal } from "../journal/journal.ts";
import { Event } from "../journal/event.ts";
import type { Log } from "../journal/log.ts";
import { Thread } from "../thread/thread.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import type { ThreadAccess } from "../thread/access.ts";
import { ThreadActivityReading } from "../thread/activity/reading.ts";
import { Notification } from "./notification.ts";

export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "NotificationSource.Unavailable",
  {},
) {}
/** Losing access to the source, or a source that is not thread activity, surfaces as Unavailable. */
export type Error =
  | Exclude<
      ThreadActivityReading.Error,
      ThreadAccess.NotFound | Authorization.Denied | ThreadActivityReading.NotFound
    >
  | Log.ReadError
  | Unavailable;
export interface Interface {
  readonly workspaceId: Notification.Record["workspaceId"];
  /** Internal: the application establishes notification ownership before calling this reader. */
  readonly resolve: (
    notification: Notification.Record,
  ) => Effect.Effect<Thread.TimelineItem, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/notification/source/Service",
) {}
/** @category constructors */
export const make = Effect.fn("NotificationSource.make")(function* () {
  const journal = yield* Journal.Service;
  const reading = yield* ThreadActivityReading.Service;
  const workspaceId = reading.workspaceId;
  const resolve = Effect.fn("NotificationSource.resolve")(function* (
    notification: Notification.Record,
  ) {
    if (
      notification.source.logId !== journal.log.id ||
      (notification.recipient._tag !== "Human" && notification.recipient._tag !== "Agent")
    )
      return yield* new Unavailable({});
    const found = yield* journal.log
      .getEntry(notification.source.entryId)
      .pipe(Effect.catchTag("SchemaError", Effect.die));
    if (Option.isNone(found)) return yield* new Unavailable({});
    const entry = found.value;
    if (
      entry.payload.name !== ThreadActivityFacts.Recorded.name ||
      entry.payload.version !== ThreadActivityFacts.Recorded.version
    )
      return yield* new Unavailable({});
    const event = yield* Effect.orDie(Event.decode(ThreadActivityFacts.Recorded, entry));
    // Current source access is independent of historical selection or notification state.
    return yield* reading.get(event.payload.activity.id).pipe(
      Effect.catchTags({
        "ThreadAccess.NotFound": () => Effect.fail(new Unavailable({})),
        "Authorization.Denied": () => Effect.fail(new Unavailable({})),
        "ThreadActivityReading.NotFound": () =>
          Effect.die("A recorded activity is missing from the timeline"),
      }),
    );
  });
  return Service.of({ workspaceId, resolve });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as NotificationSource from "./source.ts";
