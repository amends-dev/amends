import { Thread, ThreadParticipation } from "@amends/core/thread";
import { Store } from "@amends/core/journal";
import { Group } from "@amends/core/group";
import { Notification, NotificationStore } from "@amends/core/notification";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { notificationSeen, notifications } from "./schema.ts";

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
/** A row with its recipient's private Seen, when they saw it. */
interface JoinedRow {
  readonly notification: NotificationRow;
  readonly seenAt: Date | null;
}
const toEncodedRecord = ({ notification: row, seenAt }: JoinedRow) => ({
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
    row.state === "Discarded"
      ? { _tag: "Discarded", reason: row.discardReason }
      : row.discardReason !== null
        ? undefined
        : seenAt === null
          ? { _tag: "Pending" }
          : { _tag: "Acknowledged", outcome: { _tag: "Seen" }, acknowledgedAt: seenAt },
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
  const seenJoin = and(
    eq(notificationSeen.workspaceId, notifications.workspaceId),
    eq(notificationSeen.notificationId, notifications.id),
  );
  /** Notifications with their recipient's private Seen, which pending reads leave out. */
  const joined = () =>
    db
      .select({ notification: notifications, seenAt: notificationSeen.seenAt })
      .from(notifications)
      .leftJoin(notificationSeen, seenJoin);
  const pendingOnly = and(
    eq(notifications.state, "Pending"),
    isNull(notificationSeen.notificationId),
  );
  const list = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
    pending: boolean,
  ) {
    const target = yield* validateRecipient(recipient);
    const request = yield* validateOptions(options);
    const after = request.after;
    return yield* guard(
      joined()
        .where(
          and(
            inWorkspace,
            eq(notifications.recipientKind, target._tag),
            eq(
              sql`coalesce(${notifications.recipientId}, '')`,
              target._tag === "Triage" ? "" : target.id,
            ),
            pending ? pendingOnly : undefined,
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
      if (record.state._tag === "Acknowledged")
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Seen is recorded with markSeen",
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
          joined().where(and(inWorkspace, eq(notifications.id, requestedId))),
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
            .leftJoin(notificationSeen, seenJoin)
            .where(
              and(
                inWorkspace,
                eq(notifications.recipientKind, target._tag),
                eq(
                  sql`coalesce(${notifications.recipientId}, '')`,
                  target._tag === "Triage" ? "" : target.id,
                ),
                pendingOnly,
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
          joined()
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
                pendingOnly,
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
    markSeen: Effect.fn("Notifications.markSeen")(function* (input, at) {
      const ids = yield* Schema.decodeEffect(Schema.Array(Notification.Id))(input).pipe(
        Effect.mapError(storeConflict(NotificationStore, "markSeen")),
      );
      const seenAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        at,
      ).pipe(Effect.mapError(storeConflict(NotificationStore, "markSeen")));
      const unique = [...new Set(ids)];
      if (unique.length === 0) return;
      // Check every notification, then record them in one statement.
      const eligible = yield* guard(
        db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              inWorkspace,
              inArray(notifications.id, unique),
              eq(notifications.recipientKind, "Human"),
              eq(notifications.state, "Pending"),
            ),
          ),
      ).pipe(Effect.mapError(storeFailure(NotificationStore, "markSeen")));
      if (eligible.length !== unique.length)
        return yield* new NotificationStore.Conflict({
          operation: "markSeen",
          message: "Expected a pending notification of a human recipient",
        });
      yield* guard(
        db
          .insert(notificationSeen)
          .values(
            unique.map((notificationId) => ({
              workspaceId,
              notificationId,
              seenAt: DateTime.toDate(seenAt),
            })),
          )
          .onConflictDoNothing(),
      ).pipe(Effect.mapError(storeError(NotificationStore, "markSeen")));
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
