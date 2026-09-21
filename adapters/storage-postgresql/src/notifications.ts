import { Store } from "@amends/core/journal";
import { Notification, NotificationStore } from "@amends/core/notification";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { notifications } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const validateRecipient = Schema.decodeEffect(Notification.Recipient);
const validateOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...Notification.Record.fields, recordedAt: Schema.DateTimeUtcFromDate }),
  ),
);

type NotificationRow = typeof notifications.$inferSelect;
const toEncodedRecord = (row: NotificationRow) => ({
  id: row.id,
  workspaceId: row.workspaceId,
  source: { logId: row.sourceLogId, entryId: row.sourceEntryId },
  recipient:
    row.recipientKind === "Triage"
      ? row.recipientId === null
        ? { _tag: "Triage" }
        : undefined
      : { _tag: row.recipientKind, id: row.recipientId },
  recordedAt: row.recordedAt,
  state: { _tag: row.state },
});

/**
 * Notification records and recipient reads over the workspace transaction.
 *
 * @category constructors
 */
export const make = Effect.fn("Notifications.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(notifications.workspaceId, workspaceId);
  const orderedId = sql`${notifications.id} COLLATE "C"`;
  const list = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
    pendingOnly: boolean,
  ) {
    const target = yield* validateRecipient(recipient);
    const request = yield* validateOptions(options);
    const after = request.after;
    return yield* guard(
      db
        .select()
        .from(notifications)
        .where(
          and(
            inWorkspace,
            eq(notifications.recipientKind, target._tag),
            eq(
              sql`coalesce(${notifications.recipientId}, '')`,
              target._tag === "Triage" ? "" : target.id,
            ),
            pendingOnly ? eq(notifications.state, "Pending") : undefined,
            after === undefined
              ? undefined
              : or(
                  gt(notifications.recordedAt, DateTime.toDate(after.recordedAt)),
                  and(
                    eq(notifications.recordedAt, DateTime.toDate(after.recordedAt)),
                    gt(orderedId, after.id),
                  ),
                ),
          ),
        )
        .orderBy(asc(notifications.recordedAt), asc(orderedId))
        .limit(request.limit),
    ).pipe(Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))));
  });

  return NotificationStore.Service.of({
    workspaceId,
    get: Effect.fn("Notifications.get")(
      function* (id) {
        const requestedId = yield* Schema.decodeEffect(Notification.Id)(id);
        return yield* guard(
          db
            .select()
            .from(notifications)
            .where(and(inWorkspace, eq(notifications.id, requestedId))),
        ).pipe(
          Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))),
          Effect.map(Array.head),
        );
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
      yield* guard(
        db.insert(notifications).values({
          workspaceId,
          id: record.id,
          sourceLogId: record.source.logId,
          sourceEntryId: record.source.entryId,
          recipientKind: record.recipient._tag,
          recipientId: record.recipient._tag === "Triage" ? null : record.recipient.id,
          recordedAt: DateTime.toDate(record.recordedAt),
          state: record.state._tag,
        }),
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
