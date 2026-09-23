import { Thread, ThreadParticipation } from "@amends/core/thread";
import { Store } from "@amends/core/journal";
import { Group } from "@amends/core/group";
import { Notification, NotificationStore } from "@amends/core/notification";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { notifications } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const validateRecipient = Schema.decodeEffect(Notification.Recipient);
const validateOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...Notification.Record.fields,
      recordedAt: Schema.DateTimeUtcFromDate,
      state: Schema.Union([
        Notification.State.cases.Pending,
        Notification.State.cases.Discarded,
        Schema.Struct({
          ...Notification.State.cases.Acknowledged.fields,
          acknowledgedAt: Schema.DateTimeUtcFromDate,
        }),
      ]),
    }),
  ),
);
const decode = (rows: ReadonlyArray<unknown>) =>
  decodeRows(rows).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))),
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
  ...(row.participationId === null ? {} : { participationId: row.participationId }),
  ...(row.threadId === null
    ? {}
    : {
        thread: {
          threadId: row.threadId,
          groupId: row.threadGroupId,
          sequence: row.threadSequence,
        },
      }),
  state:
    row.state === "Acknowledged"
      ? row.discardReason === null
        ? {
            _tag: "Acknowledged",
            outcome: { _tag: row.acknowledgmentOutcome },
            acknowledgedAt: row.acknowledgedAt,
          }
        : undefined
      : row.acknowledgmentOutcome !== null || row.acknowledgedAt !== null
        ? undefined
        : row.state === "Pending"
          ? row.discardReason === null
            ? { _tag: "Pending" }
            : undefined
          : { _tag: row.state, reason: row.discardReason },
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
            // A row comparison bounds the index scan; the equivalent OR form only filters it.
            after === undefined
              ? undefined
              : sql`(${notifications.recordedAt}, ${orderedId}) > (${sql.param(DateTime.toDate(after.recordedAt), notifications.recordedAt)}, ${after.id})`,
          ),
        )
        .orderBy(asc(notifications.recordedAt), asc(orderedId))
        .limit(request.limit),
    ).pipe(Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))));
  });

  /** Validate every record, then write them in one statement. */
  const insert = Effect.fnUntraced(function* (
    input: ReadonlyArray<Notification.Record>,
    operation: string,
  ) {
    yield* Store.Transaction;
    const rows: Array<typeof notifications.$inferInsert> = [];
    for (const value of input) {
      const record = yield* validateRecord(value).pipe(
        Effect.mapError(storeConflict(NotificationStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Expected a notification in this workspace",
        });
      rows.push({
        workspaceId,
        id: record.id,
        sourceLogId: record.source.logId,
        sourceEntryId: record.source.entryId,
        participationId: record.participationId ?? null,
        threadId: record.thread?.threadId ?? null,
        threadGroupId: record.thread?.groupId ?? null,
        threadSequence: record.thread?.sequence ?? null,
        discardReason: record.state._tag === "Discarded" ? record.state.reason : null,
        acknowledgmentOutcome:
          record.state._tag === "Acknowledged" ? record.state.outcome._tag : null,
        acknowledgedAt:
          record.state._tag === "Acknowledged"
            ? DateTime.toDate(record.state.acknowledgedAt)
            : null,
        recipientKind: record.recipient._tag,
        recipientId: record.recipient._tag === "Triage" ? null : record.recipient.id,
        recordedAt: DateTime.toDate(record.recordedAt),
        state: record.state._tag,
      });
    }
    if (rows.length === 0) return;
    yield* guard(db.insert(notifications).values(rows), true).pipe(
      Effect.mapError(storeError(NotificationStore, operation)),
    );
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
    countPendingByGroup: Effect.fn("Notifications.countPendingByGroup")(
      function* (recipient, groupInput) {
        const target = yield* validateRecipient(recipient);
        const groupIds = yield* Schema.decodeEffect(Schema.Array(Group.Id))(groupInput);
        if (groupIds.length === 0) return [];
        const rows = yield* guard(
          db
            .select({ groupId: notifications.threadGroupId, count: sql<number>`count(*)::int` })
            .from(notifications)
            .where(
              and(
                inWorkspace,
                eq(notifications.recipientKind, target._tag),
                eq(
                  sql`coalesce(${notifications.recipientId}, '')`,
                  target._tag === "Triage" ? "" : target.id,
                ),
                eq(notifications.state, "Pending"),
                inArray(notifications.threadGroupId, [...groupIds]),
              ),
            )
            .groupBy(notifications.threadGroupId),
        );
        return yield* Schema.decodeUnknownEffect(Schema.Array(NotificationStore.PendingCount))(
          rows,
        );
      },
      Effect.mapError(storeFailure(NotificationStore, "countPendingByGroup")),
    ),
    listPendingByThread: Effect.fn("Notifications.listPendingByThread")(
      function* (recipient, threadInput, throughSequence) {
        const target = yield* validateRecipient(recipient);
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const through = yield* Schema.decodeEffect(Schema.Int)(throughSequence);
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
                eq(notifications.threadId, threadId),
                lte(notifications.threadSequence, through),
                eq(notifications.state, "Pending"),
              ),
            )
            .orderBy(asc(notifications.threadSequence), asc(orderedId)),
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))));
      },
      Effect.mapError(storeFailure(NotificationStore, "listPendingByThread")),
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
        db
          .select()
          .from(notifications)
          .where(and(inWorkspace, eq(notifications.id, id))),
        true,
      ).pipe(
        Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))),
        Effect.mapError(storeFailure(NotificationStore, "acknowledge")),
      );
      const current = rows[0];
      if (current === undefined || current.state._tag !== "Pending")
        return yield* new NotificationStore.Conflict({
          operation: "acknowledge",
          message: "Expected a pending notification",
        });
      yield* validateRecord({
        ...current,
        state: {
          _tag: "Acknowledged",
          outcome: acknowledgment.outcome,
          acknowledgedAt: acknowledgment.acknowledgedAt,
        },
      }).pipe(Effect.mapError(storeConflict(NotificationStore, "acknowledge")));
      const updated = yield* guard(
        db
          .update(notifications)
          .set({
            state: "Acknowledged",
            acknowledgmentOutcome: acknowledgment.outcome._tag,
            acknowledgedAt: DateTime.toDate(acknowledgment.acknowledgedAt),
          })
          .where(and(inWorkspace, eq(notifications.id, id), eq(notifications.state, "Pending")))
          .returning({ id: notifications.id }),
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
          db
            .update(notifications)
            .set({ state: "Discarded", discardReason: "participation-ended" })
            .where(
              and(
                inWorkspace,
                eq(notifications.participationId, id),
                eq(notifications.recipientKind, "Agent"),
                eq(notifications.state, "Pending"),
              ),
            ),
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
