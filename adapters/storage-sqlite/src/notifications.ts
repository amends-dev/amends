import { Store } from "@amends/core/journal";
import { Notification, NotificationStore } from "@amends/core/notification";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const validateRecipient = Schema.decodeEffect(Notification.Recipient);
const validateOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const codec = Schema.fromJsonString(Notification.Record);
const encode = Schema.encodeEffect(codec);
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      workspaceId: Notification.Record.fields.workspaceId,
      id: Notification.Id,
      recordedAt: Schema.Finite,
      record: codec,
    }).check(
      Schema.makeFilter(
        (row) =>
          (row.workspaceId === row.record.workspaceId &&
            row.id === row.record.id &&
            row.recordedAt === DateTime.toEpochMillis(row.record.recordedAt)) ||
          "Notification columns must match the stored record",
      ),
    ),
  ),
);

/**
 * Notification records and recipient reads over the workspace transaction.
 *
 * @category constructors
 */
export const make = Effect.fn("Notifications.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { sql } = database;
  const columns = sql`workspace_id AS workspaceId, id, recorded_at AS recordedAt, record`;
  const records = (rows: ReadonlyArray<{ readonly record: Notification.Record }>) =>
    rows.map((row) => row.record);

  const list = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
    pendingOnly: boolean,
  ) {
    const target = yield* validateRecipient(recipient);
    const request = yield* validateOptions(options);
    const pending = pendingOnly ? sql`AND json_extract(record, '$.state._tag') = 'Pending'` : sql``;
    const after =
      request.after === undefined
        ? sql``
        : sql`AND (recorded_at > ${DateTime.toEpochMillis(request.after.recordedAt)} OR (recorded_at = ${DateTime.toEpochMillis(request.after.recordedAt)} AND id COLLATE BINARY > ${request.after.id}))`;
    return yield* guard(
      sql`SELECT ${columns} FROM notifications WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.recipient._tag') = ${target._tag} AND json_extract(record, '$.recipient.id') = ${target.id} ${pending} ${after} ORDER BY recorded_at, id COLLATE BINARY LIMIT ${request.limit}`,
    ).pipe(Effect.flatMap(decode), Effect.map(records));
  });

  return NotificationStore.Service.of({
    workspaceId,
    get: Effect.fn("Notifications.get")(
      function* (id) {
        const requestedId = yield* Schema.decodeEffect(Notification.Id)(id);
        return yield* guard(
          sql`SELECT ${columns} FROM notifications WHERE workspace_id = ${workspaceId} AND id = ${requestedId}`,
        ).pipe(Effect.flatMap(decode), Effect.map(records), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(NotificationStore, "get")),
    ),
    listByRecipient: Effect.fn("Notifications.listByRecipient")(
      (recipient, options) => list(recipient, options, false),
      Effect.mapError(storeFailure(NotificationStore, "listByRecipient")),
    ),
    listPendingByRecipient: Effect.fn("Notifications.listPendingByRecipient")(
      (recipient, options) => list(recipient, options, true),
      Effect.mapError(storeFailure(NotificationStore, "listPendingByRecipient")),
    ),
    insert: Effect.fn("Notifications.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(NotificationStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new NotificationStore.Conflict({
          operation: "insert",
          message: "Expected a notification in this workspace",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(NotificationStore, "insert")),
      );
      yield* guard(
        sql`INSERT INTO notifications (workspace_id, id, recorded_at, record) VALUES (${workspaceId}, ${record.id}, ${DateTime.toEpochMillis(record.recordedAt)}, ${data})`,
        true,
      ).pipe(Effect.mapError(storeError(NotificationStore, "insert")));
    }),
  });
});

/**
 * Provide NotificationStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(NotificationStore.Service, make());

export * as Notifications from "./notifications.ts";
