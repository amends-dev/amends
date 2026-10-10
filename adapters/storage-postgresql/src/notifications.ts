import { Thread, ThreadParticipation } from "@amends/core/thread";
import { Member } from "@amends/core/workspace";
import { Store } from "@amends/core/journal";
import { Group } from "@amends/core/group";
import { Notification, NotificationStore } from "@amends/core/notification";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
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
  const pendingOnly = eq(notifications.state, "Pending");
  const listPending = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
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
      if (Notification.State.isAnyOf(["Seen", "Accepted"])(record.state))
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Seen and Accepted are recorded with markSeen and accept",
        });
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

  return NotificationStore.Service.of({
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
    countPendingByRecipient: Effect.fn("Notifications.countPendingByRecipient")(
      function* (recipient) {
        const target = yield* validateRecipient(recipient);
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
    accept: Effect.fn("Notifications.accept")(function* (input, byInput, at) {
      yield* Store.Transaction;
      const ids = yield* Schema.decodeEffect(Schema.Array(Notification.Id))(input).pipe(
        Effect.mapError(storeConflict(NotificationStore, "accept")),
      );
      const by = yield* Schema.decodeEffect(Schema.toType(Notification.AcceptedBy))(byInput).pipe(
        Effect.mapError(storeConflict(NotificationStore, "accept")),
      );
      const acceptedAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        at,
      ).pipe(Effect.mapError(storeConflict(NotificationStore, "accept")));
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
    discardPendingForGroup: Effect.fn("Notifications.discardPendingForGroup")(
      function* (memberInput, groupInput) {
        yield* Store.Transaction;
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput).pipe(
          Effect.mapError(storeConflict(NotificationStore, "discardPendingForGroup")),
        );
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput).pipe(
          Effect.mapError(storeConflict(NotificationStore, "discardPendingForGroup")),
        );
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
  });
});

/**
 * Provide NotificationStore.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(NotificationStore.Service, make());

export * as Notifications from "./notifications.ts";
