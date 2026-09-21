import { ThreadActivity, Thread, ThreadActivityStore } from "@amends/core/thread";

import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { threadActivities, threadMessages } from "./schema.ts";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(ThreadActivity.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({ ...ThreadActivity.Record.fields, occurredAt: Schema.DateTimeUtcFromDate }),
  ),
);
const decodeRows = (rows: ReadonlyArray<typeof threadActivities.$inferSelect>) =>
  decode(rows).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))),
  );
/** Workspace-bound thread-activities projection storage. @category constructors */
export const make = Effect.fn("ThreadActivities.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(threadActivities.workspaceId, workspaceId);
  return ThreadActivityStore.Service.of({
    workspaceId,
    get: Effect.fn("ThreadActivities.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(ThreadActivity.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(and(inWorkspace, eq(threadActivities.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "get")),
    ),
    listByThread: Effect.fn("ThreadActivities.listByThread")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(and(inWorkspace, eq(threadActivities.threadId, id)))
            .orderBy(threadActivities.sequence),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "listByThread")),
    ),
    latest: Effect.fn("ThreadActivities.latest")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(and(inWorkspace, eq(threadActivities.threadId, id)))
            .orderBy(desc(threadActivities.sequence))
            .limit(1),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "latest")),
    ),
    readPage: Effect.fn("ThreadActivities.readPage")(
      function* (input, options) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        const request = yield* Schema.decodeEffect(ThreadActivityStore.ReadOptions)(options);
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(
              and(
                inWorkspace,
                eq(threadActivities.threadId, id),
                gt(threadActivities.sequence, sql`${request.afterSequence ?? 0}::bigint`),
              ),
            )
            .orderBy(threadActivities.sequence)
            .limit(request.limit),
        ).pipe(Effect.flatMap(decodeRows));
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
      const related = yield* guard(
        db
          .select({ id: threadMessages.id })
          .from(threadMessages)
          .where(
            and(
              eq(threadMessages.workspaceId, workspaceId),
              eq(threadMessages.id, record.messageId),
              eq(threadMessages.threadId, record.threadId),
            ),
          ),
        true,
      ).pipe(Effect.mapError(storeError(ThreadActivityStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });
      const sequenceRows = yield* guard(
        db
          .select({ next: sql<number>`coalesce(max(${threadActivities.sequence}),0)+1` })
          .from(threadActivities)
          .where(and(inWorkspace, eq(threadActivities.threadId, record.threadId))),
        true,
      ).pipe(Effect.mapError(storeError(ThreadActivityStore, "insert")));
      if (sequenceRows[0]?.next !== record.sequence)
        return yield* new ThreadActivityStore.Conflict({
          operation: "insert",
          message: "Activity must follow the current thread sequence",
        });

      yield* guard(
        db
          .insert(threadActivities)
          .values({ ...record, occurredAt: DateTime.toDate(record.occurredAt) }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadActivityStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadActivityStore.Service, make());
export * as ThreadActivities from "./thread-activities.ts";
