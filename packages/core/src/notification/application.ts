import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Actor } from "../identity/actor.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";
import { NotificationSource } from "./source.ts";
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
  /** Record that the acting human saw their notification; source access is independent. */
  readonly acknowledge: (
    notificationId: Notification.Id,
  ) => Effect.Effect<Notification.Record, AcknowledgeError, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/notification/application/Service",
) {}

const decodeRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const decodeRecords = Schema.decodeEffect(Schema.Array(Schema.toType(Notification.Record)));
const decodeOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const sameRecipient = Schema.toEquivalence(Notification.Recipient);
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

  const read = Effect.fnUntraced(function* (
    options: NotificationStore.ReadOptions,
    pendingOnly: boolean,
  ) {
    const target = yield* recipient();
    const request = yield* decodeOptions(options);
    const readPage = pendingOnly
      ? notifications.listPendingByRecipient(target, request)
      : notifications.listByRecipient(target, request);
    const records = yield* decodeRecords(yield* readPage).pipe(Effect.mapError(invalidRecord));
    if (records.length > request.limit)
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

  const list = Effect.fn("NotificationApplication.list")((options: NotificationStore.ReadOptions) =>
    read(options, false),
  );
  const listPending = Effect.fn("NotificationApplication.listPending")(
    (options: NotificationStore.ReadOptions) => read(options, true),
  );

  const resolveSource = Effect.fn("NotificationApplication.resolveSource")(function* (
    notificationId: Notification.Id,
  ) {
    const notification = yield* get(notificationId);
    return yield* source.resolve(notification).pipe(
      Effect.catchTags({
        "NotificationSource.Unavailable": () =>
          Effect.fail(new SourceUnavailable({ notificationId: notification.id })),
        "NotificationSource.InvalidReference": (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
      }),
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
  return Service.of({ workspaceId, get, list, listPending, resolveSource, acknowledge });
});

/**
 * Provide notification operations over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as NotificationApplication from "./application.ts";
