import { Thread, ThreadParticipation } from "@amends/core/thread";
import { Store } from "@amends/core/journal";
import { Group } from "@amends/core/group";
import { Notification, NotificationStore } from "@amends/core/notification";
import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import type { PgInsertValue } from "drizzle-orm/pg-core";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { inIds } from "./id-list.ts";
import { insertChunked } from "./parameters.ts";
import { notificationSeen, notifications } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const validateRecipient = Schema.decodeEffect(Notification.Recipient);
const validateOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const validateLatest = Schema.decodeEffect(Schema.toType(NotificationStore.LatestOptions));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...Notification.Record.fields,
      recordedAt: Schema.DateTimeUtcFromDate,
      state: Schema.Union([
        Notification.State.cases.Pending,
        Notification.State.cases.Discarded,
        Notification.State.cases.Informational,
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
/** A row as reads show it: a pending notification its human recipient saw reads as Seen. */
const toEncodedRecord = (row: NotificationRow) => ({
  id: row.id,
  workspaceId: row.workspaceId,
  source: { logId: row.sourceLogId, entryId: row.sourceEntryId },
  recipient:
    row.recipientKind === "Triage"
      ? row.recipientId === null
        ? { _tag: "Triage" }
        : undefined
      : row.recipientKind === "Contact"
        ? { _tag: row.recipientKind, id: row.recipientId }
        : { _tag: row.recipientKind, id: row.recipientId, memberId: row.recipientMemberId },
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
      : row.state === "Informational"
        ? row.discardReason === null && row.seenAt === null
          ? { _tag: "Informational" }
          : undefined
        : row.discardReason !== null
          ? undefined
          : row.seenAt === null
            ? { _tag: "Pending" }
            : { _tag: "Acknowledged", outcome: { _tag: "Seen" }, acknowledgedAt: row.seenAt },
});

/** A membership for people and agents, a contact, or triage. */
const inboxOf = (recipient: Notification.Recipient) =>
  recipient._tag === "Triage"
    ? ""
    : recipient._tag === "Contact"
      ? recipient.id
      : recipient.memberId;

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
  /** Whose inbox a row is in, as the recipient indexes key it. */
  const inbox = sql`coalesce(${notifications.recipientMemberId}, ${notifications.recipientId}, '')`;
  const recorded = () => db.select().from(notifications);
  /** The pending indexes leave out what a human has seen, so pending reads never scan it. */
  const pendingOnly = and(eq(notifications.state, "Pending"), isNull(notifications.seenAt));
  const list = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
    pending: boolean,
  ) {
    const target = yield* validateRecipient(recipient);
    const request = yield* validateOptions(options);
    const after = request.after;
    return yield* guard(
      recorded()
        .where(
          and(
            inWorkspace,
            eq(notifications.recipientKind, target._tag),
            eq(inbox, inboxOf(target)),
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

  /** Newest first: the recipient indexes read backwards. */
  const latest = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.LatestOptions,
    pending: boolean,
  ) {
    const target = yield* validateRecipient(recipient);
    const request = yield* validateLatest(options);
    const before = request.before;
    return yield* guard(
      recorded()
        .where(
          and(
            inWorkspace,
            eq(notifications.recipientKind, target._tag),
            eq(inbox, inboxOf(target)),
            pending ? pendingOnly : undefined,
            before === undefined
              ? undefined
              : sql`(${notifications.recordedAt}, ${orderedId}) < (${sql.param(DateTime.toDate(before.recordedAt), notifications.recordedAt)}, ${before.id})`,
          ),
        )
        .orderBy(desc(notifications.recordedAt), desc(orderedId))
        .limit(request.limit),
    ).pipe(Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))));
  });

  /** Validate every record, then write them in as few statements as fit. */
  const insert = Effect.fnUntraced(function* (
    input: ReadonlyArray<Notification.Record>,
    operation: string,
  ) {
    yield* Store.Transaction;
    const rows: Array<PgInsertValue<typeof notifications>> = [];
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
        recipientMemberId:
          record.recipient._tag === "Human" || record.recipient._tag === "Agent"
            ? record.recipient.memberId
            : null,
        recordedAt: DateTime.toDate(record.recordedAt),
        state: record.state._tag,
        // A rebuild inserts notifications again; the Seen that outlived their rows comes back.
        seenAt:
          record.recipient._tag === "Human" && record.state._tag === "Pending"
            ? sql`(SELECT seen_at FROM notification_seen WHERE workspace_id = ${workspaceId} AND notification_id = ${record.id})`
            : null,
      });
    }
    if (rows.length === 0) return;
    yield* guard(
      insertChunked(notifications, rows, (chunk) => db.insert(notifications).values(chunk), {
        extra: 2,
      }),
      true,
    ).pipe(Effect.mapError(storeError(NotificationStore, operation)));
  });

  return NotificationStore.Service.of({
    workspaceId,
    get: Effect.fn("Notifications.get")(
      function* (id) {
        const requestedId = yield* Schema.decodeEffect(Notification.Id)(id);
        return yield* guard(
          recorded().where(and(inWorkspace, eq(notifications.id, requestedId))),
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
    countPendingByRecipient: Effect.fn("Notifications.countPendingByRecipient")(
      function* (recipient) {
        const target = yield* validateRecipient(recipient);
        // The pending recipient index answers this without reading what the recipient has seen.
        const [row] = yield* guard(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(notifications)
            .where(
              and(
                inWorkspace,
                eq(notifications.recipientKind, target._tag),
                eq(inbox, inboxOf(target)),
                pendingOnly,
              ),
            ),
        );
        return yield* Schema.decodeUnknownEffect(Schema.Int)(row?.count ?? 0);
      },
      Effect.mapError(storeFailure(NotificationStore, "countPendingByRecipient")),
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
                eq(inbox, inboxOf(target)),
                pendingOnly,
                inIds(notifications.threadGroupId, groupIds),
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
          recorded()
            .where(
              and(
                inWorkspace,
                eq(notifications.recipientKind, target._tag),
                eq(inbox, inboxOf(target)),
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
    listLatestByRecipient: Effect.fn("Notifications.listLatestByRecipient")(
      (recipient, options) => latest(recipient, options, false),
      Effect.mapError(storeFailure(NotificationStore, "listLatestByRecipient")),
    ),
    listLatestPendingByRecipient: Effect.fn("Notifications.listLatestPendingByRecipient")(
      (recipient, options) => latest(recipient, options, true),
      Effect.mapError(storeFailure(NotificationStore, "listLatestPendingByRecipient")),
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
      // Check every notification, then record them in one statement, however many there are.
      const eligible = yield* guard(
        db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              inWorkspace,
              inIds(notifications.id, unique),
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
      // The row keeps the first time for pending reads, and notification_seen keeps it through
      // rebuilds. Updating the row first serializes concurrent calls on its lock, so both agree.
      const seen = sql.param(DateTime.toDate(seenAt), notificationSeen.seenAt);
      yield* guard(
        db.execute(sql`
          WITH seen AS (
            UPDATE notifications SET seen_at = coalesce(seen_at, ${seen}::timestamptz)
            WHERE workspace_id = ${workspaceId} AND id = any(${sql.param(unique)}::text[])
              AND recipient_kind = 'Human' AND state = 'Pending'
            RETURNING id, seen_at
          )
          INSERT INTO notification_seen (workspace_id, notification_id, seen_at)
          SELECT ${workspaceId}::text, id, seen_at FROM seen
          ON CONFLICT DO NOTHING`),
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
