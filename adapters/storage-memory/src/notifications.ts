import { Store } from "@amends/core/journal";
import { Group } from "@amends/core/group";
import { Notification, NotificationStore } from "@amends/core/notification";
import { Thread, ThreadParticipation } from "@amends/core/thread";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, keyOf, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const validateRecipient = Schema.decodeEffect(Notification.Recipient);
const validateOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const rows = Rows.make(Schema.fromJsonString(Notification.Record));

const recipientKey = (recipient: Notification.Recipient) =>
  keyOf(recipient._tag, recipient._tag === "Triage" ? "" : recipient.id);
/** One notification per source entry and recipient. */
const sourceKey = (record: Notification.Record) =>
  keyOf(record.source.logId, record.source.entryId, recipientKey(record.recipient));
/** Recorded time, then ID in binary order. */
const byRecorded = (left: Notification.Record, right: Notification.Record) =>
  DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt) ||
  compareBinary(left.id, right.id);
const isAfter = (record: Notification.Record, cursor: NotificationStore.Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) > 0;

/**
 * Notification records and recipient reads over the workspace transaction.
 *
 * @category constructors
 */
export const make = Effect.fn("Notifications.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;

  const list = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
    pendingOnly: boolean,
  ) {
    const target = recipientKey(yield* validateRecipient(recipient));
    const request = yield* validateOptions(options);
    const after = request.after;
    const records = yield* rows.all((yield* read).records.notifications);
    return records
      .filter(
        (record) =>
          recipientKey(record.recipient) === target &&
          (!pendingOnly || record.state._tag === "Pending") &&
          (after === undefined || isAfter(record, after)),
      )
      .toSorted(byRecorded)
      .slice(0, request.limit);
  });

  /** Validate every record and its uniqueness, then write them all or none. */
  const insert = Effect.fnUntraced(function* (
    input: ReadonlyArray<Notification.Record>,
    operation: string,
  ) {
    yield* Store.Transaction;
    const records: Array<Notification.Record> = [];
    for (const value of input) {
      const record = yield* validateRecord(value).pipe(
        Effect.mapError(storeConflict(NotificationStore, operation)),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Expected a notification in this workspace",
        });
      records.push(record);
    }
    if (records.length === 0) return;
    const space = yield* write.pipe(Effect.mapError(storeFailure(NotificationStore, operation)));
    const stored = yield* rows
      .all(space.records.notifications)
      .pipe(Effect.mapError(storeFailure(NotificationStore, operation)));
    const ids = new Set(space.records.notifications.keys());
    const sources = new Set(stored.map(sourceKey));
    const written: Array<[string, string]> = [];
    for (const record of records) {
      if (ids.has(record.id) || sources.has(sourceKey(record)))
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Notification ID or source and recipient already recorded",
        });
      ids.add(record.id);
      sources.add(sourceKey(record));
      written.push([
        record.id,
        yield* rows
          .encode(record)
          .pipe(Effect.mapError(storeFailure(NotificationStore, operation))),
      ]);
    }
    for (const [id, row] of written) space.records.notifications.set(id, row);
  });

  return NotificationStore.Service.of({
    workspaceId,
    get: Effect.fn("Notifications.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Notification.Id)(input);
        return yield* rows.get((yield* read).records.notifications, id);
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
    listPendingByThread: Effect.fn("Notifications.listPendingByThread")(
      function* (recipient, threadInput, throughSequence) {
        const target = recipientKey(yield* validateRecipient(recipient));
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const through = yield* Schema.decodeEffect(Schema.Int)(throughSequence);
        const records = yield* rows.all((yield* read).records.notifications);
        return records
          .filter(
            (record) =>
              recipientKey(record.recipient) === target &&
              record.state._tag === "Pending" &&
              record.thread !== undefined &&
              record.thread.threadId === threadId &&
              record.thread.sequence <= through,
          )
          .toSorted(
            (left, right) =>
              (left.thread?.sequence ?? 0) - (right.thread?.sequence ?? 0) ||
              compareBinary(left.id, right.id),
          );
      },
      Effect.mapError(storeFailure(NotificationStore, "listPendingByThread")),
    ),
    countPendingByGroup: Effect.fn("Notifications.countPendingByGroup")(
      function* (recipient, groupInput) {
        const target = recipientKey(yield* validateRecipient(recipient));
        const groupIds = new Set(yield* Schema.decodeEffect(Schema.Array(Group.Id))(groupInput));
        const counts = new Map<Group.Id, number>();
        for (const record of yield* rows.all((yield* read).records.notifications))
          if (
            recipientKey(record.recipient) === target &&
            record.state._tag === "Pending" &&
            record.thread !== undefined &&
            groupIds.has(record.thread.groupId)
          )
            counts.set(record.thread.groupId, (counts.get(record.thread.groupId) ?? 0) + 1);
        return [...counts].map(([groupId, count]) => ({ groupId, count }));
      },
      Effect.mapError(storeFailure(NotificationStore, "countPendingByGroup")),
    ),
    acknowledge: Effect.fn("Notifications.acknowledge")(function* (input, value) {
      yield* Store.Transaction;
      const id = yield* Schema.decodeEffect(Notification.Id)(input).pipe(
        Effect.mapError(storeConflict(NotificationStore, "acknowledge")),
      );
      const acknowledgment = yield* Schema.decodeEffect(Schema.toType(Notification.Acknowledgment))(
        value,
      ).pipe(Effect.mapError(storeConflict(NotificationStore, "acknowledge")));
      const space = yield* write.pipe(
        Effect.mapError(storeFailure(NotificationStore, "acknowledge")),
      );
      const current = yield* rows
        .get(space.records.notifications, id)
        .pipe(Effect.mapError(storeFailure(NotificationStore, "acknowledge")));
      if (Option.isNone(current) || current.value.state._tag !== "Pending")
        return yield* new NotificationStore.Conflict({
          operation: "acknowledge",
          message: "Expected a pending notification",
        });
      const record = yield* validateRecord({
        ...current.value,
        state: { _tag: "Acknowledged", ...acknowledgment },
      }).pipe(Effect.mapError(storeConflict(NotificationStore, "acknowledge")));
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(NotificationStore, "acknowledge")));
      space.records.notifications.set(id, row);
    }),
    discardPendingForParticipation: Effect.fn("Notifications.discardPendingForParticipation")(
      function* (input) {
        yield* Store.Transaction;
        const participationId = yield* Schema.decodeEffect(ThreadParticipation.Id)(input).pipe(
          Effect.mapError(storeConflict(NotificationStore, "discardPendingForParticipation")),
        );
        const space = yield* write.pipe(
          Effect.mapError(storeFailure(NotificationStore, "discardPendingForParticipation")),
        );
        const records = yield* rows
          .all(space.records.notifications)
          .pipe(Effect.mapError(storeFailure(NotificationStore, "discardPendingForParticipation")));
        for (const record of records) {
          if (
            record.participationId !== participationId ||
            record.recipient._tag !== "Agent" ||
            record.state._tag !== "Pending"
          )
            continue;
          const row = yield* rows
            .encode({ ...record, state: { _tag: "Discarded", reason: "participation-ended" } })
            .pipe(
              Effect.mapError(storeFailure(NotificationStore, "discardPendingForParticipation")),
            );
          space.records.notifications.set(record.id, row);
        }
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
