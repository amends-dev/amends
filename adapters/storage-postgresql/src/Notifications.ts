/**
 * The PostgreSQL driver for `NotificationStore.NotificationStore`, over `notifications` and
 * `notification_seen`. A row's `state` is the notification's, and a check keeps each state to its
 * own columns; a recipient's inbox is keyed by the membership notified, the contact's ID, or
 * nothing for the workspace's triage. A person's `Seen` is private state outside the journal, so
 * `markSeen` also records it in `notification_seen`, which rebuilds keep, and inserting a pending
 * human notification again restores it in the same statement. `NotificationStore.make` checks
 * every input before the driver sees it, so the driver keeps only what storage keeps: the primary
 * key refuses a reused ID and `notifications_by_source_recipient` a second notification of one
 * source entry for one recipient, each as the store's `Conflict`, and `markSeen` and `accept` check
 * every notification first, writing nothing unless each is eligible. Every statement is scoped to
 * the binding's workspace and runs under its `guard`, which lets a read join the caller's
 * transaction and requires one for a write, except `markSeen`, which also runs on its own.
 *
 * @since 0.1.0
 */
import { Notification, NotificationStore } from "@amends-dev/core/notification";
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgInsertValue } from "drizzle-orm/pg-core";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { storeError, storeFailure } from "./internal/errors.ts";
import { inIds } from "./internal/id-list.ts";
import { insertChunked } from "./internal/parameters.ts";
import { notificationSeen, notifications } from "./internal/schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Notification));
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...Notification.Notification.fields,
      recordedAt: Schema.DateTimeUtcFromDate,
      state: Schema.Union([
        Notification.State.cases.Pending,
        Schema.Struct({
          ...Notification.State.cases.Seen.fields,
          seenAt: Schema.DateTimeUtcFromDate,
        }),
        Schema.Struct({
          ...Notification.State.cases.Accepted.fields,
          acceptedAt: Schema.DateTimeUtcFromDate,
        }),
        Notification.State.cases.Discarded,
        Notification.State.cases.Informational,
      ]),
    }),
  ),
);
const decode = (rows: ReadonlyArray<unknown>) =>
  decodeRows(rows).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record))),
  );

type NotificationRow = typeof notifications.$inferSelect;
/** A row as reads show it. */
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
    row.state === "Seen"
      ? { _tag: "Seen", seenAt: row.seenAt }
      : row.state === "Accepted"
        ? {
            _tag: "Accepted",
            by:
              row.acceptedByKind === "Turn"
                ? { _tag: "Turn", turnId: row.acceptedTurnId }
                : { _tag: "Delivery", deliveryId: row.acceptedDeliveryId },
            acceptedAt: row.acceptedAt,
          }
        : row.state === "Discarded"
          ? { _tag: "Discarded", reason: row.discardReason }
          : { _tag: row.state },
});

/** A membership for people and agents, a contact, or triage. */
const inboxOf = (recipient: Notification.Recipient) =>
  Notification.Recipient.isAnyOf(["Triage"])(recipient)
    ? ""
    : Notification.Recipient.isAnyOf(["Contact"])(recipient)
      ? recipient.id
      : recipient.memberId;

/**
 * Builds the notification store for the binding's workspace: this module's driver inside
 * `NotificationStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Notifications.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(notifications.workspaceId, workspaceId);
  const orderedId = sql`${notifications.id} COLLATE "C"`;
  /** Whose inbox a row is in, as the recipient indexes key it. */
  const inbox = sql`coalesce(${notifications.recipientMemberId}, ${notifications.recipientId}, '')`;
  const recorded = () => db.select().from(notifications);
  const pendingOnly = eq(notifications.state, "Pending");
  const listPending = Effect.fnUntraced(function* (
    target: Notification.Recipient,
    request: NotificationStore.ReadOptions,
  ) {
    const after = request.after;
    return yield* guard(
      recorded()
        .where(
          and(
            inWorkspace,
            eq(notifications.recipientKind, target._tag),
            eq(inbox, inboxOf(target)),
            pendingOnly,
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
    target: Notification.Recipient,
    request: NotificationStore.LatestOptions,
    pending: boolean,
  ) {
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

  /** Write the records in as few statements as fit. */
  const insert = Effect.fnUntraced(function* (
    records: ReadonlyArray<Notification.Notification>,
    operation: string,
  ) {
    const rows: Array<PgInsertValue<typeof notifications>> = [];
    for (const record of records) {
      // A rebuild inserts notifications again; the Seen that outlived their rows comes back.
      const seenAt =
        Notification.Recipient.isAnyOf(["Human"])(record.recipient) &&
        Notification.State.isAnyOf(["Pending"])(record.state)
          ? sql`(SELECT seen_at FROM notification_seen WHERE workspace_id = ${workspaceId} AND notification_id = ${record.id})`
          : null;
      rows.push({
        workspaceId,
        id: record.id,
        sourceLogId: record.source.logId,
        sourceEntryId: record.source.entryId,
        participationId: record.participationId ?? null,
        threadId: record.thread?.threadId ?? null,
        threadGroupId: record.thread?.groupId ?? null,
        threadSequence: record.thread?.sequence ?? null,
        discardReason: Notification.State.isAnyOf(["Discarded"])(record.state)
          ? record.state.reason
          : null,
        recipientKind: record.recipient._tag,
        recipientId: Notification.Recipient.isAnyOf(["Triage"])(record.recipient)
          ? null
          : record.recipient.id,
        recipientMemberId: Notification.Recipient.isAnyOf(["Human", "Agent"])(record.recipient)
          ? record.recipient.memberId
          : null,
        recordedAt: DateTime.toDate(record.recordedAt),
        state:
          seenAt === null
            ? record.state._tag
            : sql`CASE WHEN ${seenAt} IS NULL THEN 'Pending' ELSE 'Seen' END`,
        seenAt,
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

  const driver: NotificationStore.NotificationStore["Service"] = {
    get: Effect.fn("Notifications.get")(
      function* (requestedId) {
        return yield* guard(
          recorded().where(and(inWorkspace, eq(notifications.id, requestedId))),
        ).pipe(
          Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))),
          Effect.map(Array.head),
        );
      },
      Effect.mapError(storeFailure(NotificationStore, "get")),
    ),
    countPendingByRecipient: Effect.fn("Notifications.countPendingByRecipient")(
      function* (target) {
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
        return yield* Schema.decodeEffect(Schema.Int)(row?.count ?? 0);
      },
      Effect.mapError(storeFailure(NotificationStore, "countPendingByRecipient")),
    ),
    countPendingByGroup: Effect.fn("Notifications.countPendingByGroup")(
      function* (target, groupIds) {
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
    listByThread: Effect.fn("Notifications.listByThread")(
      function* (target, threadId, range) {
        return yield* guard(
          recorded()
            .where(
              and(
                inWorkspace,
                eq(notifications.recipientKind, target._tag),
                eq(inbox, inboxOf(target)),
                eq(notifications.threadId, threadId),
                gt(notifications.threadSequence, range.afterSequence),
                lte(notifications.threadSequence, range.throughSequence),
              ),
            )
            .orderBy(asc(notifications.threadSequence), asc(orderedId)),
        ).pipe(Effect.flatMap((rows) => decode(rows.map(toEncodedRecord))));
      },
      Effect.mapError(storeFailure(NotificationStore, "listByThread")),
    ),
    listPendingByThread: Effect.fn("Notifications.listPendingByThread")(
      function* (target, threadId, through) {
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
      listPending,
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
    markSeen: Effect.fn("Notifications.markSeen")(function* (ids, seenAt) {
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
              inArray(notifications.state, ["Pending", "Seen"]),
            ),
          ),
      ).pipe(Effect.mapError(storeFailure(NotificationStore, "markSeen")));
      if (eligible.length !== unique.length)
        return yield* new NotificationStore.Conflict({
          operation: "markSeen",
          message: "Expected a pending notification of a human recipient",
        });
      // The row keeps the first time, and notification_seen keeps it through rebuilds. Updating
      // the row first serializes concurrent calls on its lock, and the later one finds it Seen.
      const seen = sql.param(DateTime.toDate(seenAt), notificationSeen.seenAt);
      yield* guard(
        db.execute(sql`
          WITH seen AS (
            UPDATE notifications SET state = 'Seen', seen_at = ${seen}::timestamptz
            WHERE workspace_id = ${workspaceId} AND id = any(${sql.param(unique)}::text[])
              AND recipient_kind = 'Human' AND state = 'Pending'
            RETURNING id, seen_at
          )
          INSERT INTO notification_seen (workspace_id, notification_id, seen_at)
          SELECT ${workspaceId}::text, id, seen_at FROM seen
          ON CONFLICT DO NOTHING`),
      ).pipe(Effect.mapError(storeError(NotificationStore, "markSeen")));
    }),
    accept: Effect.fn("Notifications.accept")(function* (ids, by, acceptedAt) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return;
      // A turn takes pending notifications of one agent; a delivery takes those of contacts. Check
      // every notification is one, then settle them together.
      const byTurn = Notification.AcceptedBy.isAnyOf(["Turn"])(by);
      const eligible = yield* guard(
        db
          .select({ id: notifications.id, memberId: notifications.recipientMemberId })
          .from(notifications)
          .where(
            and(
              inWorkspace,
              inIds(notifications.id, unique),
              eq(notifications.recipientKind, byTurn ? "Agent" : "Contact"),
              eq(notifications.state, "Pending"),
            ),
          ),
      ).pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
      if (
        eligible.length !== unique.length ||
        (byTurn && new Set(eligible.map((row) => row.memberId)).size !== 1)
      )
        return yield* new NotificationStore.Conflict({
          operation: "accept",
          message: byTurn
            ? "Expected pending notifications of one agent"
            : "Expected pending notifications of contacts",
        });
      yield* guard(
        db
          .update(notifications)
          .set({
            state: "Accepted",
            acceptedByKind: by._tag,
            acceptedTurnId: byTurn ? by.turnId : null,
            acceptedDeliveryId: byTurn ? null : by.deliveryId,
            acceptedAt: DateTime.toDate(acceptedAt),
          })
          .where(and(inWorkspace, inIds(notifications.id, unique))),
        true,
      ).pipe(Effect.mapError(storeError(NotificationStore, "accept")));
    }),
    discardPendingForParticipation: Effect.fn("Notifications.discardPendingForParticipation")(
      function* (id) {
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
    discardPendingForGroup: Effect.fn("Notifications.discardPendingForGroup")(
      function* (memberId, groupId) {
        // The same predicate as the pending counts, so pending_notifications_by_group finds them.
        const settlements = [
          { kind: "Human", reason: "access-lost" },
          { kind: "Agent", reason: "participation-ended" },
        ] as const;
        for (const { kind, reason } of settlements)
          yield* guard(
            db
              .update(notifications)
              .set({ state: "Discarded", discardReason: reason })
              .where(
                and(
                  inWorkspace,
                  eq(notifications.recipientKind, kind),
                  eq(inbox, memberId),
                  pendingOnly,
                  eq(notifications.threadGroupId, groupId),
                ),
              ),
            true,
          ).pipe(Effect.mapError(storeError(NotificationStore, "discardPendingForGroup")));
      },
    ),
    insert: Effect.fn("Notifications.insert")((input) => insert([input], "insert")),
    insertMany: Effect.fn("Notifications.insertMany")((input) => insert(input, "insertMany")),
  };
  return NotificationStore.make(workspaceId, driver);
});

/**
 * Provides `NotificationStore.NotificationStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(NotificationStore.NotificationStore, make());
