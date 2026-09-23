import { Store } from "@amends/core/journal";
import { Thread, ThreadActivity, ThreadActivityStore, ThreadMessage } from "@amends/core/thread";
import { Array, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Binding } from "./binding.ts";
import type { MemoryDatabase } from "./database.ts";
import { storeConflict, storeFailure } from "./errors.ts";
import { Rows } from "./rows.ts";
import { ThreadParticipations } from "./thread-participations.ts";

const validate = Schema.decodeEffect(Schema.toType(ThreadActivity.Record));
const rows = Rows.make(Schema.fromJsonString(ThreadActivity.Record));
const messages = Rows.make(Schema.fromJsonString(ThreadMessage.Record));
const bySequence = (left: ThreadActivity.Record, right: ThreadActivity.Record) =>
  left.sequence - right.sequence;

/** Does the activity's subject exist in its thread, in the state the activity describes? */
const related = Effect.fnUntraced(function* (
  space: MemoryDatabase.Space,
  record: ThreadActivity.Record,
) {
  if (record.kind === "MessagePublished") {
    const message = yield* messages.get(space.records.threadMessages, record.messageId);
    return Option.isSome(message) && message.value.threadId === record.threadId;
  }
  const participation = yield* ThreadParticipations.rows.get(
    space.records.threadParticipations,
    record.participationId,
  );
  if (Option.isNone(participation) || participation.value.threadId !== record.threadId)
    return false;
  const value = participation.value;
  return record.kind === "ParticipationFollowed"
    ? value.joinedAtSequence === record.sequence
    : value.joinedAtSequence < record.sequence &&
        value.status === "ended" &&
        value.endedAt !== null &&
        DateTime.toEpochMillis(value.endedAt) === DateTime.toEpochMillis(record.occurredAt);
});

/** One activity per message, and one of each kind per participation. */
const subjectOf = (record: ThreadActivity.Record) =>
  record.kind === "MessagePublished"
    ? `message:${record.messageId}`
    : `${record.kind}:${record.participationId}`;

/** Workspace-bound thread-activities projection storage. @category constructors */
export const make = Effect.fn("ThreadActivities.make")(function* () {
  const { workspaceId, read, write } = yield* Binding.Service;
  const inThread = Effect.fnUntraced(function* (threadId: Thread.Id) {
    const records = yield* rows.all((yield* read).records.threadActivities);
    return records.filter((record) => record.threadId === threadId).toSorted(bySequence);
  });
  return ThreadActivityStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadActivities.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadActivity.Id)(input);
        return yield* rows.get((yield* read).records.threadActivities, id);
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "get")),
    ),
    listByThread: Effect.fn("ThreadActivities.listByThread")(
      function* (input) {
        return yield* inThread(yield* Schema.decodeEffect(Thread.Id)(input));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "listByThread")),
    ),
    latest: Effect.fn("ThreadActivities.latest")(
      function* (input) {
        return Array.last(yield* inThread(yield* Schema.decodeEffect(Thread.Id)(input)));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "latest")),
    ),
    readPage: Effect.fn("ThreadActivities.readPage")(
      function* (input, options) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        const request = yield* Schema.decodeEffect(ThreadActivityStore.ReadOptions)(options);
        return (yield* inThread(id))
          .filter((record) => record.sequence > (request.afterSequence ?? 0))
          .slice(0, request.limit);
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "readPage")),
    ),
    insert: Effect.fn("ThreadActivities.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadActivityStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const space = yield* write.pipe(Effect.mapError(storeFailure(ThreadActivityStore, "insert")));
      if (
        !(yield* related(space, record).pipe(
          Effect.mapError(storeFailure(ThreadActivityStore, "insert")),
        ))
      )
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      const activities = yield* rows
        .all(space.records.threadActivities)
        .pipe(Effect.mapError(storeFailure(ThreadActivityStore, "insert")));
      const timeline = activities.filter((activity) => activity.threadId === record.threadId);
      const next = Math.max(0, ...timeline.map((activity) => activity.sequence)) + 1;
      if (record.sequence !== next)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Activity must follow the current thread sequence",
        });
      if (
        space.records.threadActivities.has(record.id) ||
        activities.some((activity) => subjectOf(activity) === subjectOf(record))
      )
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Activity ID reused, or its subject is already recorded",
        });
      const row = yield* rows
        .encode(record)
        .pipe(Effect.mapError(storeFailure(ThreadActivityStore, "insert")));
      space.records.threadActivities.set(record.id, row);
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadActivityStore.Service, make());
export * as ThreadActivities from "./thread-activities.ts";
