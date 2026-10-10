import { Store } from "@amends-dev/core/journal";
import { Group } from "@amends-dev/core/group";
import { Notification, NotificationStore } from "@amends-dev/core/notification";
import { Thread, ThreadParticipation } from "@amends-dev/core/thread";
import { Member } from "@amends-dev/core/workspace";
import { DateTime, Effect, Layer, Option, Schema, Predicate } from "effect";
import { Binding } from "./binding.ts";
import type { MemoryDatabase } from "./database.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { compareBinary, keyOf, Rows } from "./rows.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Notification.Record));
const validateRecipient = Schema.decodeEffect(Notification.Recipient);
const validateOptions = Schema.decodeEffect(Schema.toType(NotificationStore.ReadOptions));
const validateLatest = Schema.decodeEffect(Schema.toType(NotificationStore.LatestOptions));
const validateRange = Schema.decodeEffect(Schema.toType(NotificationStore.ThreadRange));
const rows = Rows.make(Schema.fromJsonString(Notification.Record));

/** Whose inbox a notification is in: a membership, a contact, or triage. */
const inboxKey = (recipient: Notification.Recipient) =>
  keyOf(
    recipient._tag,
    Notification.Recipient.isAnyOf(["Triage"])(recipient)
      ? ""
      : Notification.Recipient.isAnyOf(["Contact"])(recipient)
        ? recipient.id
        : recipient.memberId,
  );
/** One notification per source entry and recipient identity. */
const sourceKey = ({ source, recipient }: Notification.Record) =>
  keyOf(
    source.logId,
    source.entryId,
    recipient._tag,
    Notification.Recipient.isAnyOf(["Triage"])(recipient) ? "" : recipient.id,
  );
/** Recorded time, then ID in binary order. */
const byRecorded = (left: Notification.Record, right: Notification.Record) =>
  DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt) ||
  compareBinary(left.id, right.id);
const isAfter = (record: Notification.Record, cursor: NotificationStore.Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) > 0;
const isBefore = (record: Notification.Record, cursor: NotificationStore.Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) < 0;

/**
 * A record as stored: one projected as Pending reads as Seen, with its first time, once its human
 * recipient has seen it, as when projections are rebuilt after they saw it.
 */
const withSeen = (space: MemoryDatabase.Space, record: Notification.Record) => {
  const seen = space.notificationsSeen.get(record.id);
  return seen === undefined ||
    !Notification.Recipient.isAnyOf(["Human"])(record.recipient) ||
    !Notification.State.isAnyOf(["Pending"])(record.state)
    ? record
    : Object.assign({}, record, {
        state: Notification.State.cases.Seen.make({ seenAt: DateTime.makeUnsafe(seen) }),
      });
};

/**
 * Notification records and recipient reads over the workspace transaction. Each human
 * recipient's Seen is also kept beside them, where rebuilding projections leaves it.
 *
 * @category constructors
 */
export const make = Effect.fn("Notifications.make")(function* () {
  const { workspaceId, read, write, exclusive } = yield* Binding.Service;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.notifications));

  const listPending = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
  ) {
    const target = inboxKey(yield* validateRecipient(recipient));
    const request = yield* validateOptions(options);
    const after = request.after;
    const records = yield* all;
    return records
      .filter(
        (record) =>
          inboxKey(record.recipient) === target &&
          Notification.State.isAnyOf(["Pending"])(record.state) &&
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
          (!pendingOnly || Notification.State.isAnyOf(["Pending"])(record.state)) &&
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
      if (Notification.State.isAnyOf(["Seen", "Accepted"])(record.state))
        return yield* new NotificationStore.Conflict({
          operation,
          message: "Seen and Accepted are recorded with markSeen and accept",
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
          .encode(withSeen(space, record))
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
        return yield* rows.get(space.records.notifications, id);
      },
      Effect.mapError(storeFailure(NotificationStore, "get")),
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
    listByThread: Effect.fn("Notifications.listByThread")(
      function* (recipient, threadInput, rangeInput) {
        const target = inboxKey(yield* validateRecipient(recipient));
        const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput);
        const range = yield* validateRange(rangeInput);
        const records = yield* all;
        return records
          .filter(
            (record) =>
              inboxKey(record.recipient) === target &&
              record.thread !== undefined &&
              record.thread.threadId === threadId &&
              record.thread.sequence > range.afterSequence &&
              record.thread.sequence <= range.throughSequence,
          )
          .toSorted(
            (left, right) =>
              (left.thread?.sequence ?? 0) - (right.thread?.sequence ?? 0) ||
              compareBinary(left.id, right.id),
          );
      },
      Effect.mapError(storeFailure(NotificationStore, "listByThread")),
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
              Notification.State.isAnyOf(["Pending"])(record.state) &&
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
          (record) =>
            inboxKey(record.recipient) === target &&
            Notification.State.isAnyOf(["Pending"])(record.state),
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
            Notification.State.isAnyOf(["Pending"])(record.state) &&
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
          // Check every notification before recording any of them; one seen before keeps its time.
          const pending: Array<Notification.Record> = [];
          for (const id of new Set(ids)) {
            const found = yield* rows
              .get(space.records.notifications, id)
              .pipe(Effect.mapError(storeFailure(NotificationStore, "markSeen")));
            const record = Option.getOrUndefined(found);
            if (
              record === undefined ||
              !Notification.Recipient.isAnyOf(["Human"])(record.recipient) ||
              !Notification.State.isAnyOf(["Pending", "Seen"])(record.state)
            )
              return yield* new NotificationStore.Conflict({
                operation: "markSeen",
                message: "Expected a pending notification of a human recipient",
              });
            if (Notification.State.isAnyOf(["Pending"])(record.state)) pending.push(record);
          }
          for (const record of pending) {
            const row = yield* rows
              .encode(
                Object.assign({}, record, {
                  state: Notification.State.cases.Seen.make({ seenAt }),
                }),
              )
              .pipe(Effect.mapError(storeFailure(NotificationStore, "markSeen")));
            space.records.notifications.set(record.id, row);
            space.notificationsSeen.set(record.id, DateTime.toEpochMillis(seenAt));
          }
        }),
      ).pipe(
        // The binding's own errors, such as another host writing, are failures of the call.
        Effect.mapError((error) =>
          Schema.is(Store.Failure)(error) || Schema.is(Store.Conflict)(error)
            ? new NotificationStore.Failure({ operation: "markSeen", cause: error })
            : error,
        ),
      );
    }),
    accept: Effect.fn("Notifications.accept")(function* (inputs, byInput, acceptedInput) {
      yield* Store.Transaction;
      if (inputs.length === 0) return;
      const ids = yield* Schema.decodeEffect(Schema.Array(Notification.Id))(inputs).pipe(
        Effect.mapError(storeConflict(NotificationStore, "accept")),
      );
      const by = yield* Schema.decodeEffect(Schema.toType(Notification.AcceptedBy))(byInput).pipe(
        Effect.mapError(storeConflict(NotificationStore, "accept")),
      );
      const space = yield* write.pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
      // A turn takes pending notifications of one agent; a delivery takes those of contacts.
      const takes = Notification.AcceptedBy.isAnyOf(["Turn"])(by)
        ? (recipient: Notification.Recipient, first: Notification.Recipient | undefined) =>
            Notification.Recipient.isAnyOf(["Agent"])(recipient) &&
            (!Predicate.isTagged(first, "Agent") || first.memberId === recipient.memberId)
        : (recipient: Notification.Recipient) =>
            Notification.Recipient.isAnyOf(["Contact"])(recipient);
      const accepted: Array<Notification.Record> = [];
      for (const id of new Set(ids)) {
        const found = yield* rows
          .get(space.records.notifications, id)
          .pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
        const record = Option.getOrUndefined(found);
        if (
          record === undefined ||
          !Notification.State.isAnyOf(["Pending"])(record.state) ||
          !takes(record.recipient, accepted[0]?.recipient)
        )
          return yield* new NotificationStore.Conflict({
            operation: "accept",
            message: Notification.AcceptedBy.isAnyOf(["Turn"])(by)
              ? "Expected pending notifications of one agent"
              : "Expected pending notifications of contacts",
          });
        accepted.push(record);
      }
      const acceptedAt = DateTime.toUtc(acceptedInput);
      for (const record of accepted) {
        const row = yield* rows
          .encode(
            Object.assign({}, record, {
              state: Notification.State.cases.Accepted.make({ by, acceptedAt }),
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
            !Notification.Recipient.isAnyOf(["Agent"])(record.recipient) ||
            !Notification.State.isAnyOf(["Pending"])(record.state)
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
            !Notification.Recipient.isAnyOf(["Human", "Agent"])(recipient) ||
            recipient.memberId !== memberId ||
            record.thread?.groupId !== groupId ||
            !Notification.State.isAnyOf(["Pending"])(record.state)
          )
            continue;
          const reason = Notification.Recipient.isAnyOf(["Agent"])(recipient)
            ? "participation-ended"
            : "access-lost";
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
