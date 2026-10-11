/**
 * The memory implementation of `NotificationStore` from `../notification/NotificationStore.ts`,
 * over the workspace's `Binding`. It keeps what the contract leaves to storage: an insert writes
 * every record or none, and a reused ID, or a second notification for one source entry and
 * recipient, conflicts. Marking seen conflicts unless each notification is stored, of a human
 * recipient, and pending or already seen, and it runs through the binding's `exclusive`, so no
 * commit lands between its check and its write. Accepting conflicts unless each notification is
 * pending and of one agent, for a turn, or of contacts, for a delivery. A human recipient's first
 * Seen is also kept beside the records, where rebuilding projections leaves it, and is applied
 * again when the notification is projected anew. `NotificationStore.make` checks every input
 * before this driver sees it.
 *
 * @since 0.1.0
 */
import { Store } from "../journal/index.ts";
import { Group } from "../group/index.ts";
import { Notification, NotificationStore } from "../notification/index.ts";
import { DateTime, Effect, Layer, Option, Schema, Predicate } from "effect";
import * as Binding from "./Binding.ts";
import type * as MemoryDatabase from "./MemoryDatabase.ts";
import { storeFailure } from "./internal/errors.ts";
import * as Rows from "./Rows.ts";
import { compareBinary, keyOf } from "./Rows.ts";

const rows = Rows.make(Schema.fromJsonString(Notification.Notification));

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
const sourceKey = ({ source, recipient }: Notification.Notification) =>
  keyOf(
    source.logId,
    source.entryId,
    recipient._tag,
    Notification.Recipient.isAnyOf(["Triage"])(recipient) ? "" : recipient.id,
  );
/** Recorded time, then ID in binary order. */
const byRecorded = (left: Notification.Notification, right: Notification.Notification) =>
  DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt) ||
  compareBinary(left.id, right.id);
const isAfter = (record: Notification.Notification, cursor: NotificationStore.Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) > 0;
const isBefore = (record: Notification.Notification, cursor: NotificationStore.Cursor) =>
  byRecorded(record, Object.assign({}, record, cursor)) < 0;

/**
 * A record as stored: one projected as Pending reads as Seen, with its first time, once its human
 * recipient has seen it, as when projections are rebuilt after they saw it.
 */
const withSeen = (space: MemoryDatabase.Space, record: Notification.Notification) => {
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
 * @since 0.1.0
 */
export const make = Effect.fn("Notifications.make")(function* () {
  const { workspaceId, read, write, exclusive } = yield* Binding.Binding;
  const all = Effect.flatMap(read, (space) => rows.all(space.records.of("notifications")));

  const listPending = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.ReadOptions,
  ) {
    const target = inboxKey(recipient);
    const after = options.after;
    const records = yield* all;
    return records
      .filter(
        (record) =>
          inboxKey(record.recipient) === target &&
          Notification.State.isAnyOf(["Pending"])(record.state) &&
          (after === undefined || isAfter(record, after)),
      )
      .toSorted(byRecorded)
      .slice(0, options.limit);
  });

  const latest = Effect.fnUntraced(function* (
    recipient: Notification.Recipient,
    options: NotificationStore.LatestOptions,
    pendingOnly: boolean,
  ) {
    const target = inboxKey(recipient);
    const before = options.before;
    const records = yield* all;
    return records
      .filter(
        (record) =>
          inboxKey(record.recipient) === target &&
          (!pendingOnly || Notification.State.isAnyOf(["Pending"])(record.state)) &&
          (before === undefined || isBefore(record, before)),
      )
      .toSorted((left, right) => byRecorded(right, left))
      .slice(0, options.limit);
  });

  /** Write every record or none: an ID or source already recorded conflicts. */
  const insert = Effect.fnUntraced(function* (
    records: ReadonlyArray<Notification.Notification>,
    operation: string,
  ) {
    if (records.length === 0) return;
    const space = yield* write.pipe(Effect.mapError(storeFailure(NotificationStore, operation)));
    const stored = yield* rows
      .all(space.records.of("notifications"))
      .pipe(Effect.mapError(storeFailure(NotificationStore, operation)));
    const ids = new Set(space.records.of("notifications").keys());
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
    for (const [id, row] of written) space.records.of("notifications").set(id, row);
  });

  const driver: NotificationStore.NotificationStore["Service"] = {
    get: Effect.fn("Notifications.get")(
      function* (id) {
        const space = yield* read;
        return yield* rows.get(space.records.of("notifications"), id);
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
      function* (recipient, threadId, range) {
        const target = inboxKey(recipient);
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
      function* (recipient, threadId, throughSequence) {
        const target = inboxKey(recipient);
        const records = yield* all;
        return records
          .filter(
            (record) =>
              inboxKey(record.recipient) === target &&
              Notification.State.isAnyOf(["Pending"])(record.state) &&
              record.thread !== undefined &&
              record.thread.threadId === threadId &&
              record.thread.sequence <= throughSequence,
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
        const target = inboxKey(recipient);
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
        const target = inboxKey(recipient);
        const groupIds = new Set(groupInput);
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
    markSeen: Effect.fn("Notifications.markSeen")(function* (ids, seenAt) {
      // Checked and recorded without a commit in between, as a row lock orders them on PostgreSQL:
      // a departure that settles one first makes this conflict, and one after keeps its Seen.
      yield* exclusive((space) =>
        Effect.gen(function* () {
          // Check every notification before recording any of them; one seen before keeps its time.
          const pending: Array<Notification.Notification> = [];
          for (const id of new Set(ids)) {
            const found = yield* rows
              .get(space.records.of("notifications"), id)
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
            space.records.of("notifications").set(record.id, row);
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
    accept: Effect.fn("Notifications.accept")(function* (ids, by, acceptedAt) {
      if (ids.length === 0) return;
      const space = yield* write.pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
      // A turn takes pending notifications of one agent; a delivery takes those of contacts.
      const takes = Notification.AcceptedBy.isAnyOf(["Turn"])(by)
        ? (recipient: Notification.Recipient, first: Notification.Recipient | undefined) =>
            Notification.Recipient.isAnyOf(["Agent"])(recipient) &&
            (!Predicate.isTagged(first, "Agent") || first.memberId === recipient.memberId)
        : (recipient: Notification.Recipient) =>
            Notification.Recipient.isAnyOf(["Contact"])(recipient);
      const accepted: Array<Notification.Notification> = [];
      for (const id of new Set(ids)) {
        const found = yield* rows
          .get(space.records.of("notifications"), id)
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
      for (const record of accepted) {
        const row = yield* rows
          .encode(
            Object.assign({}, record, {
              state: Notification.State.cases.Accepted.make({ by, acceptedAt }),
            }),
          )
          .pipe(Effect.mapError(storeFailure(NotificationStore, "accept")));
        space.records.of("notifications").set(record.id, row);
      }
    }),
    discardPendingForParticipation: Effect.fn("Notifications.discardPendingForParticipation")(
      function* (participationId) {
        const space = yield* write;
        const records = yield* rows.all(space.records.of("notifications"));
        for (const record of records) {
          if (
            record.participationId !== participationId ||
            !Notification.Recipient.isAnyOf(["Agent"])(record.recipient) ||
            !Notification.State.isAnyOf(["Pending"])(record.state)
          )
            continue;
          const row = yield* rows.encode({
            ...record,
            state: { _tag: "Discarded", reason: "participation-ended" },
          });
          space.records.of("notifications").set(record.id, row);
        }
      },
      Effect.mapError(storeFailure(NotificationStore, "discardPendingForParticipation")),
    ),
    discardPendingForGroup: Effect.fn("Notifications.discardPendingForGroup")(
      function* (memberId, groupId) {
        const space = yield* write;
        const records = yield* rows.all(space.records.of("notifications"));
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
          const row = yield* rows.encode({ ...record, state: { _tag: "Discarded", reason } });
          space.records.of("notifications").set(record.id, row);
        }
      },
      Effect.mapError(storeFailure(NotificationStore, "discardPendingForGroup")),
    ),
    insert: Effect.fn("Notifications.insert")((input) => insert([input], "insert")),
    insertMany: Effect.fn("Notifications.insertMany")((input) => insert(input, "insertMany")),
  };
  return NotificationStore.make(workspaceId, driver);
});

/**
 * Provide notification storage over the caller's binding.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(NotificationStore.NotificationStore, make());
