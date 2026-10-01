import { Store } from "@amends/core/journal";
import { Group } from "@amends/core/group";
import { Notification, NotificationStore } from "@amends/core/notification";
import { Thread, ThreadParticipation } from "@amends/core/thread";
import { Turn } from "@amends/core/turn";
import { Member } from "@amends/core/workspace";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import type { MemoryDatabase } from "./database.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, keyOf, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const validateRecipient = Schema.decodeEffect(Notification.Recipient);
const validateOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const validateLatest = Schema.decodeEffect(Schema.toType(NotificationStore.LatestOptions));
const rows = Rows.make(Schema.fromJsonString(Notification.Record));

/** Whose inbox a notification is in: a membership, a contact, or triage. */
const inboxKey = (recipient: Notification.Recipient) =>
  keyOf(
    recipient._tag,
    recipient._tag === "Triage"
      ? ""
      : recipient._tag === "Contact"
        ? recipient.id
        : recipient.memberId,
  );
/** One notification per source entry and recipient identity. */
const sourceKey = ({ source, recipient }: Notification.Record) =>
  keyOf(
    source.logId,
    source.entryId,
    recipient._tag,
    recipient._tag === "Triage" ? "" : recipient.id,
  );
/** Recorded time, then ID in binary order. */
const byRecorded = (left: Notification.Record, right: Notification.Record) =>
  DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt) ||
  compareBinary(left.id, right.id);
const isAfter = (record: Notification.Record, cursor: NotificationStore.Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) > 0;
const isBefore = (record: Notification.Record, cursor: NotificationStore.Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) < 0;

/** A record as reads show it: a pending notification its human recipient saw reads as Seen. */
const withSeen = (space: MemoryDatabase.Space) => (record: Notification.Record) => {
  const seen = space.notificationsSeen.get(record.id);
  return seen === undefined || record.state._tag !== "Pending"
    ? record
    : Object.assign({}, record, {
        state: Notification.State.cases.Acknowledged.make({
          outcome: { _tag: "Seen" },
          acknowledgedAt: DateTime.makeUnsafe(seen),
        }),
      });
};

/**
 * Notification records and recipient reads over the workspace transaction, with each human
 * recipient's private Seen kept beside them.
 *
 * @category constructors
 */
export const make = Effect.fn("Notifications.make")(function* () {
  const { workspaceId, read, write, exclusive } = yield* Binding.Service;
  /** Every record as reads show it. */
  const all = Effect.flatMap(read, (space) =>
    Effect.map(rows.all(space.records.notifications), (records) => records.map(withSeen(space))),
  );

  const list = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
    pendingOnly: boolean,
  ) {
    const target = inboxKey(yield* validateRecipient(recipient));
    const request = yield* validateOptions(options);
    const after = request.after;
    const records = yield* all;
    return records
      .filter(
        (record) =>
          inboxKey(record.recipient) === target &&
          (!pendingOnly || record.state._tag === "Pending") &&
          (after === undefined || isAfter(record, after)),
      )
      .toSorted(byRecorded)
      .slice(0, request.limit);
  });

  const latest = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.LatestOptions,
    pendingOnly: boolean,
  ) {
    const target = inboxKey(yield* validateRecipient(recipient));
    const request = yield* validateLatest(options);
    const before = request.before;
    const records = yield* all;
    return records
      .filter(
        (record) =>
          inboxKey(record.recipient) === target &&
          (!pendingOnly || record.state._tag === "Pending") &&
          (before === undefined || isBefore(record, before)),
      )
      .toSorted((left, right) => byRecorded(right, left))
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
      if (record.state._tag === "Acknowledged")
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Seen is recorded with markSeen",
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
    get: Effect.fn("Notifications.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Notification.Id)(input);
        const space = yield* read;
        return Option.map(yield* rows.get(space.records.notifications, id), withSeen(space));
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
    listLatestByRecipient: Effect.fn("Notifications.listLatestByRecipient")(
      (recipient, options) => latest(recipient, options, false),
      Effect.mapError(storeFailure(NotificationStore, "listLatestByRecipient")),
    ),
    listLatestPendingByRecipient: Effect.fn("Notifications.listLatestPendingByRecipient")(
      (recipient, options) => latest(recipient, options, true),
      Effect.mapError(storeFailure(NotificationStore, "listLatestPendingByRecipient")),
    ),
    listPendingByThread: Effect.fn("Notifications.listPendingByThread")(
      function* (recipient, threadInput, throughSequence) {
        const target = inboxKey(yield* validateRecipient(recipient));
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const through = yield* Schema.decodeEffect(Schema.Int)(throughSequence);
        const records = yield* all;
        return records
          .filter(
            (record) =>
              inboxKey(record.recipient) === target &&
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
    countPendingByRecipient: Effect.fn("Notifications.countPendingByRecipient")(
      function* (recipient) {
        const target = inboxKey(yield* validateRecipient(recipient));
        return (yield* all).filter(
          (record) => inboxKey(record.recipient) === target && record.state._tag === "Pending",
        ).length;
      },
      Effect.mapError(storeFailure(NotificationStore, "countPendingByRecipient")),
    ),
    countPendingByGroup: Effect.fn("Notifications.countPendingByGroup")(
      function* (recipient, groupInput) {
        const target = inboxKey(yield* validateRecipient(recipient));
        const groupIds = new Set(yield* Schema.decodeEffect(Schema.Array(Group.Id))(groupInput));
        const counts = new Map<Group.Id, number>();
        for (const record of yield* all)
          if (
            inboxKey(record.recipient) === target &&
            record.state._tag === "Pending" &&
            record.thread !== undefined &&
            groupIds.has(record.thread.groupId)
          )
            counts.set(record.thread.groupId, (counts.get(record.thread.groupId) ?? 0) + 1);
        return [...counts].map(([groupId, count]) => ({ groupId, count }));
      },
      Effect.mapError(storeFailure(NotificationStore, "countPendingByGroup")),
    ),
    markSeen: Effect.fn("Notifications.markSeen")(function* (input, at) {
      const ids = yield* Schema.decodeEffect(Schema.Array(Notification.Id))(input).pipe(
        Effect.mapError(storeConflict(NotificationStore, "markSeen")),
      );
      const seenAt = yield* Schema.decodeEffect(Schema.toType(Schema.DateTimeUtcFromString))(
        at,
      ).pipe(Effect.mapError(storeConflict(NotificationStore, "markSeen")));
      // Checked and recorded without a commit in between, as a row lock orders them on PostgreSQL:
      // a departure that settles one first makes this conflict, and one after keeps its Seen.
      yield* exclusive((space) =>
        Effect.gen(function* () {
          // Check every notification before recording any of them.
          for (const id of ids) {
            const found = yield* rows
              .get(space.records.notifications, id)
              .pipe(Effect.mapError(storeFailure(NotificationStore, "markSeen")));
            if (
              Option.isNone(found) ||
              found.value.recipient._tag !== "Human" ||
              found.value.state._tag !== "Pending"
            )
              return yield* new NotificationStore.Conflict({
                operation: "markSeen",
                message: "Expected a pending notification of a human recipient",
              });
          }
          for (const id of ids)
            if (!space.notificationsSeen.has(id))
              space.notificationsSeen.set(id, DateTime.toEpochMillis(seenAt));
        }),
      ).pipe(
        // The binding's own errors, such as another host writing, are failures of the call.
        Effect.mapError((error) =>
          error._tag === "JournalStore.Failure" || error._tag === "JournalStore.Conflict"
            ? new NotificationStore.Failure({ operation: "markSeen", cause: error })
            : error,
        ),
      );
    }),
    accept: Effect.fn("Notifications.accept")(function* (inputs, turnInput, acceptedInput) {
      yield* Store.Transaction;
      if (inputs.length === 0) return;
      const ids = yield* Schema.decodeEffect(Schema.Array(Notification.Id))(inputs).pipe(
        Effect.mapError(storeConflict(NotificationStore, "accept")),
      );
      const turnId = yield* Schema.decodeEffect(Turn.Id)(turnInput).pipe(
        Effect.mapError(storeConflict(NotificationStore, "accept")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
      const accepted: Array<Notification.Record> = [];
      for (const id of new Set(ids)) {
        const found = yield* rows
          .get(space.records.notifications, id)
          .pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
        const record = Option.getOrUndefined(found);
        const first = accepted[0]?.recipient;
        if (
          record === undefined ||
          record.recipient._tag !== "Agent" ||
          record.state._tag !== "Pending" ||
          (first?._tag === "Agent" && first.memberId !== record.recipient.memberId)
        )
          return yield* new NotificationStore.Conflict({
            operation: "accept",
            message: "Expected pending notifications of one agent",
          });
        accepted.push(record);
      }
      const acknowledgedAt = DateTime.toUtc(acceptedInput);
      for (const record of accepted) {
        const row = yield* rows
          .encode(
            Object.assign({}, record, {
              state: Notification.State.cases.Acknowledged.make({
                outcome: { _tag: "Accepted", turnId },
                acknowledgedAt,
              }),
            }),
          )
          .pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
        space.records.notifications.set(record.id, row);
      }
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
    discardPendingForGroup: Effect.fn("Notifications.discardPendingForGroup")(
      function* (memberInput, groupInput) {
        yield* Store.Transaction;
        const memberId = yield* Schema.decodeEffect(Member.Id)(memberInput).pipe(
          Effect.mapError(storeConflict(NotificationStore, "discardPendingForGroup")),
        );
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput).pipe(
          Effect.mapError(storeConflict(NotificationStore, "discardPendingForGroup")),
        );
        const space = yield* write.pipe(
          Effect.mapError(storeFailure(NotificationStore, "discardPendingForGroup")),
        );
        const records = yield* rows
          .all(space.records.notifications)
          .pipe(Effect.mapError(storeFailure(NotificationStore, "discardPendingForGroup")));
        for (const record of records) {
          const { recipient } = record;
          if (
            (recipient._tag !== "Human" && recipient._tag !== "Agent") ||
            recipient.memberId !== memberId ||
            record.thread?.groupId !== groupId ||
            record.state._tag !== "Pending" ||
            space.notificationsSeen.has(record.id)
          )
            continue;
          const reason = recipient._tag === "Agent" ? "participation-ended" : "access-lost";
          const row = yield* rows
            .encode({ ...record, state: { _tag: "Discarded", reason } })
            .pipe(Effect.mapError(storeFailure(NotificationStore, "discardPendingForGroup")));
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
