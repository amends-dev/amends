import { ThreadParticipation } from "@amends/core/thread";
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
      sql`SELECT ${columns} FROM notifications WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.recipient._tag') = ${target._tag} AND coalesce(json_extract(record, '$.recipient.id'), '') = ${target._tag === "Triage" ? "" : target.id} ${pending} ${after} ORDER BY recorded_at, id COLLATE BINARY LIMIT ${request.limit}`,
    ).pipe(Effect.flatMap(decode), Effect.map(records));
  });

  /** Validate every record, then write them in one statement over a JSON array of rows. */
  const insert = Effect.fnUntraced(function* (
    input: ReadonlyArray<Notification.Record>,
    operation: string,
  ) {
    yield* Store.Transaction;
    const rows = [];
    for (const value of input) {
      const record = yield* validateRecord(value).pipe(
        Effect.mapError(storeConflict(NotificationStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Expected a notification in this workspace",
        });
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(NotificationStore, operation)),
      );
      rows.push({ id: record.id, recordedAt: DateTime.toEpochMillis(record.recordedAt), data });
    }
    if (rows.length === 0) return;
    yield* guard(
      sql`INSERT INTO notifications (workspace_id, id, recorded_at, record) SELECT ${workspaceId}, json_extract(value, '$.id'), json_extract(value, '$.recordedAt'), json_extract(value, '$.data') FROM json_each(${JSON.stringify(rows)})`,
      true,
    ).pipe(Effect.mapError(storeError(NotificationStore, operation)));
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
    acknowledge: Effect.fn("Notifications.acknowledge")(function* (input, value) {
      yield* Store.Transaction;
      const id = yield* Schema.decodeEffect(Notification.Id)(input).pipe(
        Effect.mapError(storeConflict(NotificationStore, "acknowledge")),
      );
      const acknowledgment = yield* Schema.decodeEffect(Schema.toType(Notification.Acknowledgment))(
        value,
      ).pipe(Effect.mapError(storeConflict(NotificationStore, "acknowledge")));
      const rows = yield* guard(
        sql`SELECT ${columns} FROM notifications WHERE workspace_id = ${workspaceId} AND id = ${id}`,
        true,
      ).pipe(
        Effect.flatMap(decode),
        Effect.map(records),
        Effect.mapError(storeFailure(NotificationStore, "acknowledge")),
      );
      const current = rows[0];
      if (current === undefined || current.state._tag !== "Pending")
        return yield* new NotificationStore.Conflict({
          operation: "acknowledge",
          message: "Expected a pending notification",
        });
      const record = yield* validateRecord(
        Object.assign({}, current, {
          state: {
            _tag: "Acknowledged",
            outcome: acknowledgment.outcome,
            acknowledgedAt: acknowledgment.acknowledgedAt,
          },
        }),
      ).pipe(Effect.mapError(storeConflict(NotificationStore, "acknowledge")));
      const data = yield* encode(record).pipe(
        Effect.mapError(storeFailure(NotificationStore, "acknowledge")),
      );
      const updated = yield* guard(
        sql`UPDATE notifications SET record = ${data} WHERE workspace_id = ${workspaceId} AND id = ${id} AND json_extract(record, '$.state._tag') = 'Pending' RETURNING id`,
        true,
      ).pipe(Effect.mapError(storeError(NotificationStore, "acknowledge")));
      if (updated.length !== 1)
        return yield* new NotificationStore.Conflict({
          operation: "acknowledge",
          message: "Notification is no longer pending",
        });
    }),
    discardPendingForParticipation: Effect.fn("Notifications.discardPendingForParticipation")(
      function* (input) {
        yield* Store.Transaction;
        const id = yield* Schema.decodeEffect(ThreadParticipation.Id)(input).pipe(
          Effect.mapError(storeConflict(NotificationStore, "discardPendingForParticipation")),
        );
        yield* guard(
          sql`UPDATE notifications SET record = json_set(record, '$.state._tag', 'Discarded', '$.state.reason', 'participation-ended') WHERE workspace_id = ${workspaceId} AND json_extract(record, '$.participationId') = ${id} AND json_extract(record, '$.recipient._tag') = 'Agent' AND json_extract(record, '$.state._tag') = 'Pending'`,
          true,
        ).pipe(Effect.mapError(storeError(NotificationStore, "discardPendingForParticipation")));
      },
    ),
    insert: Effect.fn("Notifications.insert")((input) => insert([input], "insert")),
    insertMany: Effect.fn("Notifications.insertMany")((input) => insert(input, "insertMany")),
  });
});

/**
 * Provide NotificationStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(NotificationStore.Service, make());

export * as Notifications from "./notifications.ts";
