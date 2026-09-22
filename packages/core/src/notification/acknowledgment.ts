import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "./notification.ts";
import { NotificationFacts } from "./facts.ts";
import { NotificationStore } from "./store.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "NotificationAcknowledgment.InvalidReference",
  { message: Schema.String },
) {}
export class AlreadyHandled extends Schema.TaggedError<AlreadyHandled>()(
  "NotificationAcknowledgment.AlreadyHandled",
  { notificationId: Notification.Id },
) {}
export type Error =
  | NotificationStore.Failure
  | Schema.SchemaError
  | Log.WriteError
  | Projection.Error
  | InvalidReference
  | AlreadyHandled;
export interface Interface {
  readonly workspaceId: Notification.Record["workspaceId"];
  /** The caller authorizes handling and durably establishes any outcome's handoff in this transaction. */
  readonly record: (
    notificationId: Notification.Id,
    outcome: Notification.AcknowledgmentOutcome,
  ) => Effect.Effect<Notification.Record, Error, Store.Transaction | Publication.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/notification/acknowledgment/Service",
) {}
const sameOutcome = Schema.toEquivalence(Notification.AcknowledgmentOutcome);
/** @category constructors */
export const make = Effect.fn("NotificationAcknowledgment.make")(function* () {
  const notifications = yield* NotificationStore.Service;
  const journal = yield* Journal.Service;
  const workspaceId = notifications.workspaceId;
  const record = Effect.fn("NotificationAcknowledgment.record")(function* (
    notificationId: Notification.Id,
    input: Notification.AcknowledgmentOutcome,
  ) {
    yield* Store.Transaction;
    const id = yield* Schema.decodeEffect(Notification.Id)(notificationId);
    const outcome = yield* Schema.decodeEffect(Notification.AcknowledgmentOutcome)(input);
    const found = yield* notifications.get(id);
    if (Option.isNone(found))
      return yield* new InvalidReference({ message: "Notification is missing" });
    const notification = yield* Schema.decodeEffect(Schema.toType(Notification.Record))(
      found.value,
    ).pipe(
      Effect.mapError(
        (cause) => new InvalidReference({ message: `Invalid notification: ${cause.message}` }),
      ),
    );
    if (notification.id !== id || notification.workspaceId !== workspaceId)
      return yield* new InvalidReference({
        message: "Notification belongs to another ID or workspace",
      });
    if (!Notification.acceptsAcknowledgment(notification.recipient, outcome))
      return yield* new InvalidReference({
        message: "Acknowledgment outcome does not match the recipient",
      });
    if (
      notification.state._tag === "Acknowledged" &&
      sameOutcome(notification.state.outcome, outcome)
    )
      return notification;
    if (notification.state._tag !== "Pending")
      return yield* new AlreadyHandled({ notificationId: id });
    const acknowledgment: Notification.Acknowledgment = {
      outcome,
      acknowledgedAt: yield* DateTime.now,
    };
    yield* journal
      .publish(NotificationFacts.Acknowledged, {
        workspaceId,
        notificationId: id,
        recipient: notification.recipient,
        acknowledgment,
      })
      .pipe(Publication.withOccurredAt(acknowledgment.acknowledgedAt));
    return {
      ...notification,
      state: {
        _tag: "Acknowledged" as const,
        outcome: acknowledgment.outcome,
        acknowledgedAt: acknowledgment.acknowledgedAt,
      },
    };
  });
  return Service.of({ workspaceId, record });
});
/** @category layers */
export const layer = Layer.effect(Service, make());
export * as NotificationAcknowledgment from "./acknowledgment.ts";
