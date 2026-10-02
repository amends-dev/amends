import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Actor } from "../identity/actor.ts";
import { Event } from "../journal/event.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { ThreadQuery } from "../thread/query.ts";

import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";
import { NotificationInbox } from "./inbox.ts";
import type { Thread } from "../thread/thread.ts";
import { Signal } from "../signal/signal.ts";
import { SignalHub } from "../signal/hub.ts";
import { AlreadyHandled, HumanRecipientRequired, NotFound } from "./errors.ts";
import { Store } from "../journal/store.ts";
export { AlreadyHandled, HumanRecipientRequired, NotFound } from "./errors.ts";

export type Error = Authorization.Error | NotificationStore.Failure | Schema.SchemaError;
/** What reading a notification's source can fail with. */
export type SourceError =
  | Exclude<ThreadQuery.TimelineError, ThreadQuery.NotFound | Authorization.Denied>
  | Log.ReadError;
export type InboxError = Error | SourceError;
export type MarkSeenError =
  | Error
  | NotificationStore.Conflict
  | NotFound
  | HumanRecipientRequired
  | AlreadyHandled;

/**
 * The acting member's inbox, its pending count, and marking what they saw, within one workspace. Active membership
 * is required; owning a role does not grant access to another recipient's inbox. Reads use
 * current state without opening a transaction. Seen is private state outside the journal,
 * without the workspace's write order; an existing caller transaction is honored. Reading a
 * notification neither marks it seen nor grants access to its source.
 */
export interface Interface {
  /**
   * The acting member's notifications newest first, each with the timeline item it points to
   * while they may still read it, or without one where they may not.
   */
  readonly inbox: (
    options: NotificationInbox.Options,
  ) => Effect.Effect<ReadonlyArray<NotificationInbox.Item>, InboxError, Actor.Service>;
  /** Record that the acting person saw their notification; source access is independent. */
  readonly markSeen: (
    notificationId: Notification.Id,
  ) => Effect.Effect<Notification.Record, MarkSeenError, Actor.Service>;
  /**
   * Record that the acting person saw every notification still pending for them up to and
   * including `through`, in inbox order, so what arrives after the newest they saw stays pending.
   * Returns how many it marked. Their other sessions hear of each batch as a signal.
   */
  readonly markSeenThrough: (
    through: NotificationStore.Cursor,
  ) => Effect.Effect<number, Exclude<MarkSeenError, NotFound | AlreadyHandled>, Actor.Service>;
  /** How many notifications are still pending for the acting member, from anywhere. */
  readonly countPending: Effect.Effect<number, Error, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/notification/service/Service",
) {}

const decodeInboxOptions = Schema.decodeEffect(Schema.toType(NotificationInbox.Options));
const isSameRecipient = Schema.toEquivalence(Notification.Recipient);
const decodeCursor = Schema.decodeEffect(Schema.toType(NotificationStore.Cursor));
/** IDs in binary lexical order, as stores order them: by code point. */
const compareIds = (left: string, right: string) => {
  const a = Array.from(left, (char) => char.codePointAt(0) ?? 0),
    b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index++)
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  return a.length - b.length;
};
/** Whether a notification comes at or before a cursor in inbox order. */
const isAtOrBefore = (record: Notification.Record, cursor: NotificationStore.Cursor) => {
  const byTime =
    DateTime.toEpochMillis(record.recordedAt) - DateTime.toEpochMillis(cursor.recordedAt);
  return byTime < 0 || (byTime === 0 && compareIds(record.id, cursor.id) <= 0);
};
/** How many seen notifications one write records, and one signal names. */
const seenBatch = 100;

/**
 * Capture workspace dependencies; resolve the actor and current membership per operation.
 *
 * @category constructors
 */
export const make = Effect.fn("NotificationService.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  | NotificationStore.Service
  | Authorization.Service
  | Journal.Service
  | ThreadQuery.Service
  | SignalHub.Service
  | Store.Service
> {
  const notificationStore = yield* NotificationStore.Service;
  const signalHub = yield* SignalHub.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const { workspaceId } = yield* Store.Service;

  /** The acting member as a recipient, once their membership is checked. */
  const requireRecipient = Effect.fnUntraced(function* () {
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    return Notification.ofMember(actor.memberId, actor.identity);
  });

  /** The acting member's own notification; another recipient's reads as missing. */
  const requireOwn = Effect.fnUntraced(function* (notificationId: Notification.Id) {
    const target = yield* requireRecipient();
    const id = yield* Schema.decodeEffect(Notification.Id)(notificationId);
    const found = yield* notificationStore.get(id);
    if (Option.isNone(found) || !isSameRecipient(found.value.recipient, target))
      return yield* new NotFound({ workspaceId, notificationId: id });
    return found.value;
  });

  /**
   * The timeline item a notification the actor owns points to, while they may still read it. None
   * when they have lost access to it, or its source is not thread activity; access is current,
   * whatever the notification's state.
   */
  const findSource = Effect.fnUntraced(function* (notification: Notification.Record) {
    if (
      notification.source.logId !== journal.log.id ||
      !Notification.Recipient.isAnyOf(["Human", "Agent"])(notification.recipient)
    )
      return Option.none<Thread.TimelineItem>();
    const found = yield* journal.log
      .getEntry(notification.source.entryId)
      .pipe(Effect.catchTag("SchemaError", Effect.die));
    if (Option.isNone(found)) return Option.none<Thread.TimelineItem>();
    const entry = found.value;
    if (
      entry.payload.name !== ThreadActivityFacts.Recorded.name ||
      entry.payload.version !== ThreadActivityFacts.Recorded.version
    )
      return Option.none<Thread.TimelineItem>();
    const event = yield* Effect.orDie(Event.decode(ThreadActivityFacts.Recorded, entry));
    return yield* threadQuery.readTimelineItem(event.payload.activity.id).pipe(
      Effect.asSome,
      Effect.catchTags({
        "ThreadQuery.NotFound": () => Effect.succeedNone,
        "Authorization.Denied": () => Effect.succeedNone,
      }),
    );
  });
  const inbox = Effect.fn("NotificationService.inbox")(function* (
    options: NotificationInbox.Options,
  ) {
    const target = yield* requireRecipient();
    const { pendingOnly = false, ...request } = yield* decodeInboxOptions(options);
    const records = yield* pendingOnly
      ? notificationStore.listLatestPendingByRecipient(target, request)
      : notificationStore.listLatestByRecipient(target, request);
    // One at a time: inside a caller's commit, the store takes one step at a time.
    return yield* Effect.forEach(records, (notification) =>
      Effect.map(
        findSource(notification),
        Option.match({
          onNone: (): NotificationInbox.Item => ({ notification }),
          onSome: (item): NotificationInbox.Item => ({ notification, source: item }),
        }),
      ),
    );
  });
  const markSeen = Effect.fn("NotificationService.markSeen")(function* (
    notificationId: Notification.Id,
  ) {
    const notification = yield* requireOwn(notificationId);
    if (!Notification.Recipient.isAnyOf(["Human"])(notification.recipient))
      return yield* new HumanRecipientRequired({});
    if (Notification.State.isAnyOf(["Seen"])(notification.state)) return notification;
    if (!Notification.State.isAnyOf(["Pending"])(notification.state))
      return yield* new AlreadyHandled({ notificationId: notification.id });
    // Leaving its group may settle it first, and the store then refuses it or records nothing:
    // what it reads as afterwards decides.
    yield* notificationStore
      .markSeen([notification.id], yield* DateTime.now)
      .pipe(Effect.catchTag("NotificationStore.Conflict", () => Effect.void));
    // Another device may have seen it first; the stored time is the one that holds.
    const seen = yield* requireOwn(notification.id);
    if (Notification.State.isAnyOf(["Discarded"])(seen.state))
      return yield* new AlreadyHandled({ notificationId: notification.id });
    if (!Notification.State.isAnyOf(["Seen"])(seen.state))
      return yield* Effect.die("A seen notification still reads as unseen");
    // The recipient's other sessions hear of it as a signal.
    yield* signalHub.publish(
      Signal.Value.cases.NotificationsSeen.make({
        workspaceId,
        memberId: (yield* Actor.Service).memberId,
        notificationIds: [notification.id],
      }),
    );
    return seen;
  });
  const markSeenThrough = Effect.fn("NotificationService.markSeenThrough")(function* (
    input: NotificationStore.Cursor,
  ) {
    const target = yield* requireRecipient();
    if (!Notification.Recipient.isAnyOf(["Human"])(target))
      return yield* new HumanRecipientRequired({});
    const through = yield* decodeCursor(input);
    const memberId = (yield* Actor.Service).memberId;
    /** One page marked: what it listed and how many of them were due. */
    const markPageSeen = Effect.fnUntraced(function* (after: NotificationStore.Cursor | undefined) {
      const page = yield* notificationStore.listPendingByRecipient(
        target,
        after === undefined ? { limit: seenBatch } : { limit: seenBatch, after },
      );
      const due = page.filter((record) => isAtOrBefore(record, through));
      const [first, ...rest] = due.map((record) => record.id);
      if (first !== undefined) {
        const notificationIds = [first, ...rest] as const;
        yield* notificationStore.markSeen(notificationIds, yield* DateTime.now);
        yield* signalHub.publish(
          Signal.Value.cases.NotificationsSeen.make({ workspaceId, memberId, notificationIds }),
        );
      }
      return { page, due: due.length };
    });
    let after: NotificationStore.Cursor | undefined;
    let marked = 0;
    while (true) {
      // Leaving a group settles its notifications, which the store then refuses to mark; they are
      // no longer pending, so reading the page again leaves them out.
      const { page, due } = yield* markPageSeen(after).pipe(
        Effect.retry({
          times: 2,
          while: Schema.is(NotificationStore.Conflict),
        }),
      );
      marked += due;
      const last = page.at(-1);
      if (last === undefined || page.length < seenBatch || due < page.length) return marked;
      after = { recordedAt: last.recordedAt, id: last.id };
    }
  });
  const countPending = Effect.gen(function* () {
    const target = yield* requireRecipient();
    return yield* notificationStore.countPendingByRecipient(target);
  }).pipe(Effect.withSpan("NotificationService.countPending"));
  return Service.of({ inbox, markSeen, markSeenThrough, countPending });
});

/**
 * Provide notification operations over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as NotificationService from "./service.ts";
