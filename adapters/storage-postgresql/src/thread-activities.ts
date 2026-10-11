import { ThreadActivity, ThreadActivityStore } from "@amends-dev/core/thread";

import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { threadActivities } from "./schema.ts";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeError, storeFailure } from "./errors.ts";
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
  const driver: ThreadActivityStore.Interface = {
    get: Effect.fn("ThreadActivities.get")(
      function* (id) {
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
      function* (id) {
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
      function* (id) {
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
    getFirst: Effect.fn("ThreadActivities.getFirst")(
      function* (ids) {
        if (ids.length === 0) return [];
        // Recording keeps each timeline contiguous from 1, so its first activity is at 1.
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(
              and(
                inWorkspace,
                inIds(threadActivities.threadId, ids),
                eq(threadActivities.sequence, 1),
              ),
            ),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "getFirst")),
    ),
    readPage: Effect.fn("ThreadActivities.readPage")(
      function* (id, request) {
        const newest = request.from === "newest";
        const rows = yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(
              and(
                inWorkspace,
                eq(threadActivities.threadId, id),
                gt(threadActivities.sequence, sql`${request.afterSequence ?? 0}::bigint`),
                request.beforeSequence === undefined
                  ? undefined
                  : lt(threadActivities.sequence, sql`${request.beforeSequence}::bigint`),
              ),
            )
            // The newest end is read backwards through the sequence index, then put in order.
            .orderBy(newest ? desc(threadActivities.sequence) : asc(threadActivities.sequence))
            .limit(request.limit),
        ).pipe(Effect.flatMap(decodeRows));
        return newest ? rows.toReversed() : rows;
      },
      Effect.mapError(storeFailure(ThreadActivityStore, "readPage")),
    ),
    insert: Effect.fn("ThreadActivities.insert")(function* (record) {
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

      const { occurredAt, ...fields } = record;
      yield* guard(
        db.insert(threadActivities).values({ ...fields, occurredAt: DateTime.toDate(occurredAt) }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadActivityStore, "insert")));
    }),
  };
  return ThreadActivityStore.make(workspaceId, driver);
});
/** @category layers */
export const layer = Layer.effect(ThreadActivityStore.Service, make());
export * as ThreadActivities from "./thread-activities.ts";
