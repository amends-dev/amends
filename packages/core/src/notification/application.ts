import { Context, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Actor } from "../identity/actor.ts";
import { Journal } from "../journal/journal.ts";
import type { Transaction } from "../journal/transaction.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { Notification } from "./notification.ts";
import { NotificationStore } from "./store.ts";

/** Missing and other recipients' notifications deliberately share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("NotificationApplication.NotFound", {
  workspaceId: WorkspaceId.Id,
  notificationId: Notification.Id,
}) {}

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
  | Transaction.Error
  | Schema.SchemaError
  | NotFound
  | WorkspaceMismatch
  | InvalidResponse;

/**
 * Read the acting identity's inbox within one workspace. Active membership is
 * required; owning a role does not grant access to another recipient's inbox.
 * Authorization and reads share one journal transaction, joining an outer commit.
 * Reading a notification neither acknowledges it nor grants access to its source.
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
  NotificationStore.Service | Authorization.Service | Journal.Service
> {
  const notifications = yield* NotificationStore.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const workspaceId = authorization.workspaceId;
  yield* requireWorkspace(workspaceId, notifications.workspaceId);

  const recipient = Effect.fnUntraced(function* () {
    yield* authorization.require([]);
    return (yield* Actor.Service).identity;
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
  }, journal.commit);

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

  const list = Effect.fn("NotificationApplication.list")(
    (options: NotificationStore.ReadOptions) => read(options, false),
    journal.commit,
  );
  const listPending = Effect.fn("NotificationApplication.listPending")(
    (options: NotificationStore.ReadOptions) => read(options, true),
    journal.commit,
  );

  return Service.of({ workspaceId, get, list, listPending });
});

/**
 * Provide notification reads over the caller's workspace services.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as NotificationApplication from "./application.ts";
