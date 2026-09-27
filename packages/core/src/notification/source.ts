import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { Actor } from "../identity/actor.ts";
import type { Authorization } from "../authorization/authorization.ts";
import { Journal } from "../journal/journal.ts";
import { Event } from "../journal/event.ts";
import type { Log } from "../journal/log.ts";
import { Thread } from "../thread/thread.ts";
import { ThreadActivity } from "../thread/activity/activity.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import type { ThreadAccess } from "../thread/access.ts";
import { ThreadActivityReading } from "../thread/activity/reading.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { Notification } from "./notification.ts";

export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "NotificationSource.Unavailable",
  {},
) {}
export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "NotificationSource.InvalidReference",
  { message: Schema.String },
) {}
/** Losing access to the source, or its activity gone missing, surface as Unavailable or InvalidReference. */
export type Error =
  | Exclude<
      ThreadActivityReading.Error,
      ThreadAccess.NotFound | Authorization.Denied | ThreadActivityReading.NotFound
    >
  | ThreadParticipationStore.Failure
  | Log.ReadError
  | InvalidReference
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
const sameRecipient = Schema.toEquivalence(Notification.Recipient);
/** The item shows the recorded activity: the same one, at the same place, about the same subject. */
const sameActivity = (
  recorded: ThreadActivity.Record,
  shown: Pick<ThreadActivity.Record, "id" | "threadId" | "sequence" | "subject"> & {
    readonly kind: string;
  },
) =>
  recorded.id === shown.id &&
  recorded.threadId === shown.threadId &&
  recorded.sequence === shown.sequence &&
  recorded.kind === shown.kind &&
  recorded.subject === shown.subject;
/** @category constructors */
export const make = Effect.fn("NotificationSource.make")(function* () {
  const journal = yield* Journal.Service;
  const reading = yield* ThreadActivityReading.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const workspaceId = reading.workspaceId;
  if (participations.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Notification source services belong to different workspaces",
    });
  const invalid = (cause: Schema.SchemaError) =>
    new InvalidReference({ message: `Invalid notification source: ${cause.message}` });
  const resolve = Effect.fn("NotificationSource.resolve")(function* (input: Notification.Record) {
    const notification = yield* Schema.decodeEffect(Schema.toType(Notification.Record))(input).pipe(
      Effect.mapError(invalid),
    );
    if (notification.workspaceId !== workspaceId)
      return yield* new InvalidReference({ message: "Notification belongs to another workspace" });
    if (
      notification.source.logId !== journal.log.id ||
      (notification.recipient._tag !== "Human" && notification.recipient._tag !== "Agent")
    )
      return yield* new Unavailable({});
    const target = notification.recipient;
    const found = yield* journal.log
      .getEntry(notification.source.entryId)
      .pipe(Effect.catchTag("SchemaError", (cause) => Effect.fail(invalid(cause))));
    if (Option.isNone(found)) return yield* new Unavailable({});
    const entry = found.value;
    if (
      entry.id !== notification.source.entryId ||
      entry.logId !== notification.source.logId ||
      entry.payload.provenance.workspaceId !== workspaceId
    )
      return yield* new InvalidReference({
        message: "Source entry belongs to another entry, log, or workspace",
      });
    if (
      entry.payload.name !== ThreadActivityFacts.Recorded.name ||
      entry.payload.version !== ThreadActivityFacts.Recorded.version
    )
      return yield* new Unavailable({});
    const event = yield* Event.decode(ThreadActivityFacts.Recorded, entry).pipe(
      Effect.mapError(
        () => new InvalidReference({ message: "Source entry is not a valid recorded activity" }),
      ),
    );
    const { activity, recipients } = event.payload;
    if (
      activity.workspaceId !== workspaceId ||
      notification.participationId === undefined ||
      DateTime.formatIso(notification.recordedAt) !== DateTime.formatIso(event.recordedAt)
    )
      return yield* new InvalidReference({
        message: "Notification does not match its source activity",
      });
    if (
      !recipients.some(
        (recipient) =>
          recipient.participationId === notification.participationId &&
          sameRecipient(recipient.recipient, target),
      )
    )
      return yield* new InvalidReference({
        message: "Notification recipient was not selected by its source activity",
      });
    const foundParticipation = yield* participations.get(notification.participationId);
    if (Option.isNone(foundParticipation))
      return yield* new InvalidReference({ message: "Notification participation is missing" });
    const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
      foundParticipation.value,
    ).pipe(Effect.mapError(invalid));
    if (
      participant.id !== notification.participationId ||
      participant.workspaceId !== workspaceId ||
      participant.threadId !== activity.threadId ||
      participant.joinedAtSequence > activity.sequence ||
      !sameRecipient(
        ThreadParticipation.recipientOf(participant.participant),
        notification.recipient,
      )
    )
      return yield* new InvalidReference({
        message: "Notification participation does not match its source",
      });
    // Current source access is independent of historical selection or notification state.
    const item = yield* reading.get(activity.id).pipe(
      Effect.catchTags({
        "ThreadAccess.NotFound": () => Effect.fail(new Unavailable({})),
        "Authorization.Denied": () => Effect.fail(new Unavailable({})),
        "ThreadActivityReading.NotFound": () =>
          Effect.fail(
            new InvalidReference({ message: "Recorded activity is missing from the timeline" }),
          ),
      }),
    );
    if (!sameActivity(activity, item.activity))
      return yield* new InvalidReference({
        message: "Timeline activity differs from the notification source",
      });
    return item;
  });
  return Service.of({ workspaceId, resolve });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as NotificationSource from "./source.ts";
