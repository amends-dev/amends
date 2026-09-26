import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Actor } from "../identity/actor.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";
import { NotificationSource } from "./source.ts";
import { NotificationInbox } from "./inbox.ts";
import type { Thread } from "../thread/thread.ts";
import { Signal } from "../signal/signal.ts";
import { Signals } from "../signal/signals.ts";
import { AlreadyHandled, HumanRecipientRequired, NotFound, SourceUnavailable } from "./errors.ts";
export { AlreadyHandled, HumanRecipientRequired, NotFound, SourceUnavailable } from "./errors.ts";

export class WorkspaceMismatch extends Schema.TaggedError<WorkspaceMismatch>()(
  "NotificationApplication.WorkspaceMismatch",
  { expectedWorkspaceId: WorkspaceId.Id, actualWorkspaceId: WorkspaceId.Id },
) {}

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "NotificationApplication.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | Authorization.Error
  | NotificationStore.Failure
  | Schema.SchemaError
  | NotFound
  | WorkspaceMismatch
  | InvalidResponse;
export type ResolveError =
  | Error
  | Exclude<
      NotificationSource.Error,
      NotificationSource.Unavailable | NotificationSource.InvalidReference
    >
  | SourceUnavailable;
export type InboxError =
  | Exclude<Error, NotFound>
  | Exclude<
      NotificationSource.Error,
      NotificationSource.Unavailable | NotificationSource.InvalidReference
    >;
export type AcknowledgeError =
  | Error
  | NotificationStore.Conflict
  | HumanRecipientRequired
  | AlreadyHandled;

/**
 * Read the acting identity's inbox and acknowledge human receipt within one workspace. Active membership is
 * required; owning a role does not grant access to another recipient's inbox.
 * Reads use current state without opening a transaction. Acknowledgment records private Seen
 * state outside the journal, without the workspace's write order; an existing caller
 * transaction is honored by both. Reading a notification neither acknowledges it nor grants
 * access to its source.
 */
export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  readonly get: (
    notificationId: Notification.Id,
  ) => Effect.Effect<Notification.Record, Error, Actor.Service>;
  readonly list: (
    options: NotificationStore.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Error, Actor.Service>;
  readonly listPending: (
    options: NotificationStore.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Error, Actor.Service>;
  readonly resolveSource: (
    notificationId: Notification.Id,
  ) => Effect.Effect<Thread.TimelineItem, ResolveError, Actor.Service>;
  /**
   * The acting identity's notifications newest first, each with its source as `resolveSource`
   * reads it, or without one where that source is unavailable.
   */
  readonly inbox: (
    options: NotificationInbox.Options,
  ) => Effect.Effect<ReadonlyArray<NotificationInbox.Item>, InboxError, Actor.Service>;
  /** Record that the acting human saw their notification; source access is independent. */
  readonly acknowledge: (
    notificationId: Notification.Id,
  ) => Effect.Effect<Notification.Record, AcknowledgeError, Actor.Service>;
  /**
   * Record that the acting human saw every notification still pending for them up to and
   * including `through`, in inbox order, so what arrives after the newest they saw stays pending.
   * Returns how many it marked. Their other sessions hear of each batch as a signal.
   */
  readonly acknowledgeThrough: (
    through: NotificationStore.Cursor,
  ) => Effect.Effect<number, Exclude<AcknowledgeError, NotFound | AlreadyHandled>, Actor.Service>;
  /** How many notifications are still pending for the acting identity, from anywhere. */
  readonly countPending: Effect.Effect<number, Exclude<Error, NotFound>, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/notification/application/Service",
) {}

const decodeRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const decodeRecords = Schema.decodeEffect(Schema.Array(Schema.toType(Notification.Record)));
const decodeOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const decodeInboxOptions = Schema.decodeEffect(Schema.toType(NotificationInbox.Options));
const sameRecipient = Schema.toEquivalence(Notification.Recipient);
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
const atOrBefore = (record: Notification.Record, cursor: NotificationStore.Cursor) => {
  const byTime =
    DateTime.toEpochMillis(record.recordedAt) - DateTime.toEpochMillis(cursor.recordedAt);
  return byTime < 0 || (byTime === 0 && compareIds(record.id, cursor.id) <= 0);
};
/** How many seen notifications one write records, and one signal names. */
const seenBatch = 100;
const invalidRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Notification store returned invalid data: ${cause.message}` });
const requireWorkspace = Effect.fnUntraced(function* (
  expectedWorkspaceId: WorkspaceId.Id,
  actualWorkspaceId: WorkspaceId.Id,
) {
  if (expectedWorkspaceId !== actualWorkspaceId)
    return yield* new WorkspaceMismatch({ expectedWorkspaceId, actualWorkspaceId });
});

/**
 * Capture workspace dependencies; resolve the actor and current membership per operation.
 *
 * @category constructors
 */
export const make = Effect.fn("NotificationApplication.make")(function* (): Effect.fn.Return<
  Interface,
  WorkspaceMismatch,
  NotificationStore.Service | Authorization.Service | NotificationSource.Service | Signals.Service
> {
  const notifications = yield* NotificationStore.Service;
  const signals = yield* Signals.Service;
  const authorization = yield* Authorization.Service;
  const source = yield* NotificationSource.Service;
  const workspaceId = authorization.workspaceId;
  yield* requireWorkspace(workspaceId, notifications.workspaceId);
  yield* requireWorkspace(workspaceId, source.workspaceId);
  yield* requireWorkspace(workspaceId, signals.workspaceId);

  const recipient = Effect.fnUntraced(function* () {
    yield* authorization.require([]);
    const actor = yield* Actor.Service;
    return Notification.ofMember(actor.memberId, actor.identity);
  });

  const get = Effect.fn("NotificationApplication.get")(function* (notificationId: Notification.Id) {
    const target = yield* recipient();
    const id = yield* Schema.decodeEffect(Notification.Id)(notificationId);
    const found = yield* notifications.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ workspaceId, notificationId: id });
    const record = yield* decodeRecord(found.value).pipe(Effect.mapError(invalidRecord));
    yield* requireWorkspace(workspaceId, record.workspaceId);
    if (record.id !== id)
      return yield* new InvalidResponse({ message: "Notification store returned a different ID" });
    if (!sameRecipient(record.recipient, target))
      return yield* new NotFound({ workspaceId, notificationId: id });
    return record;
  });

  /** A page the store returned for this recipient, checked against what was asked. */
  const checked = Effect.fnUntraced(function* (
    target: Notification.Recipient,
    readPage: Effect.Effect<ReadonlyArray<Notification.Record>, NotificationStore.Failure>,
    limit: number,
    pendingOnly: boolean,
  ) {
    const records = yield* decodeRecords(yield* readPage).pipe(Effect.mapError(invalidRecord));
    if (records.length > limit)
      return yield* new InvalidResponse({
        message: "Notification page exceeds the requested limit",
      });
    const seen = new Set<Notification.Id>();
    for (const record of records) {
      yield* requireWorkspace(workspaceId, record.workspaceId);
      if (!sameRecipient(record.recipient, target))
        return yield* new InvalidResponse({
          message: "Notification store returned a different recipient",
        });
      if (pendingOnly && record.state._tag !== "Pending")
        return yield* new InvalidResponse({
          message: "Pending notification page contains a handled notification",
        });
      if (seen.has(record.id))
        return yield* new InvalidResponse({ message: "Notification page contains duplicate IDs" });
      seen.add(record.id);
    }
    return records;
  });
  const read = Effect.fnUntraced(function* (
    options: NotificationStore.ReadOptions,
    pendingOnly: boolean,
  ) {
    const target = yield* recipient();
    const request = yield* decodeOptions(options);
    const readPage = pendingOnly
      ? notifications.listPendingByRecipient(target, request)
      : notifications.listByRecipient(target, request);
    return yield* checked(target, readPage, request.limit, pendingOnly);
  });

  const list = Effect.fn("NotificationApplication.list")((options: NotificationStore.ReadOptions) =>
    read(options, false),
  );
  const listPending = Effect.fn("NotificationApplication.listPending")(
    (options: NotificationStore.ReadOptions) => read(options, true),
  );

  /** The source of a notification the actor owns, or None where it is unavailable. */
  const sourceOf = (notification: Notification.Record) =>
    source.resolve(notification).pipe(
      Effect.asSome,
      Effect.catchTags({
        "NotificationSource.Unavailable": () => Effect.succeed(Option.none<Thread.TimelineItem>()),
        "NotificationSource.InvalidReference": (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
      }),
    );
  const resolveSource = Effect.fn("NotificationApplication.resolveSource")(function* (
    notificationId: Notification.Id,
  ) {
    const notification = yield* get(notificationId);
    const found = yield* sourceOf(notification);
    if (Option.isNone(found))
      return yield* new SourceUnavailable({ notificationId: notification.id });
    return found.value;
  });
  const inbox = Effect.fn("NotificationApplication.inbox")(function* (
    options: NotificationInbox.Options,
  ) {
    const target = yield* recipient();
    const { pendingOnly = false, ...request } = yield* decodeInboxOptions(options);
    const records = yield* checked(
      target,
      pendingOnly
        ? notifications.listLatestPendingByRecipient(target, request)
        : notifications.listLatestByRecipient(target, request),
      request.limit,
      pendingOnly,
    );
    return yield* Effect.forEach(
      records,
      (notification) =>
        Effect.map(
          sourceOf(notification),
          Option.match({
            onNone: (): NotificationInbox.Item => ({ notification }),
            onSome: (item): NotificationInbox.Item => ({ notification, source: item }),
          }),
        ),
      { concurrency: 4 },
    );
  });
  const acknowledge = Effect.fn("NotificationApplication.acknowledge")(function* (
    notificationId: Notification.Id,
  ) {
    const notification = yield* get(notificationId);
    if (notification.recipient._tag !== "Human") return yield* new HumanRecipientRequired({});
    if (notification.state._tag === "Acknowledged") return notification;
    if (notification.state._tag !== "Pending")
      return yield* new AlreadyHandled({ notificationId: notification.id });
    yield* notifications.markSeen([notification.id], yield* DateTime.now);
    // The recipient's other sessions hear of it as a signal.
    yield* signals.publish(
      Signal.Value.cases.NotificationsSeen.make({
        workspaceId,
        memberId: (yield* Actor.Service).memberId,
        notificationIds: [notification.id],
      }),
    );
    // Another device may have seen it first; the stored time is the one that holds.
    const seen = yield* get(notification.id);
    if (seen.state._tag !== "Acknowledged")
      return yield* new InvalidResponse({ message: "Seen notification still reads as unseen" });
    return seen;
  });
  const acknowledgeThrough = Effect.fn("NotificationApplication.acknowledgeThrough")(function* (
    input: NotificationStore.Cursor,
  ) {
    const target = yield* recipient();
    if (target._tag !== "Human") return yield* new HumanRecipientRequired({});
    const through = yield* decodeCursor(input);
    const memberId = (yield* Actor.Service).memberId;
    let after: NotificationStore.Cursor | undefined;
    let marked = 0;
    while (true) {
      const page = yield* checked(
        target,
        notifications.listPendingByRecipient(
          target,
          after === undefined ? { limit: seenBatch } : { limit: seenBatch, after },
        ),
        seenBatch,
        true,
      );
      const due = page.filter((record) => atOrBefore(record, through));
      const [first, ...rest] = due.map((record) => record.id);
      if (first !== undefined) {
        const notificationIds = [first, ...rest] as const;
        yield* notifications.markSeen(notificationIds, yield* DateTime.now);
        yield* signals.publish(
          Signal.Value.cases.NotificationsSeen.make({ workspaceId, memberId, notificationIds }),
        );
        marked += due.length;
      }
      const last = page.at(-1);
      if (last === undefined || page.length < seenBatch || due.length < page.length) return marked;
      after = { recordedAt: last.recordedAt, id: last.id };
    }
  });
  const countPending = Effect.gen(function* () {
    const target = yield* recipient();
    return yield* notifications.countPendingByRecipient(target);
  }).pipe(Effect.withSpan("NotificationApplication.countPending"));
  return Service.of({
    workspaceId,
    get,
    list,
    listPending,
    resolveSource,
    inbox,
    acknowledge,
    acknowledgeThrough,
    countPending,
  });
});

/**
 * Provide notification operations over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as NotificationApplication from "./application.ts";
