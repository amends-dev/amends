/**
 * The PostgreSQL driver for `ThreadActivityStore.ThreadActivityStore`, over the `thread_activities`
 * table: every kind of activity in one shape, its position, kind, subject, and occurrence key in
 * columns and the kind's details as JSON, so a new kind needs no migration.
 * `ThreadActivityStore.make` checks every input before the driver sees it, so the driver keeps only
 * what storage keeps: an insert is rejected unless it takes the thread's next position, and the
 * primary key refuses a reused ID and `thread_activity_occurrence` a second activity with one
 * occurrence key, each rejected. Every statement is scoped to the binding's workspace and runs
 * under its `guard`, which lets a read join the caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */

import { StoreError } from "@amends-dev/core/journal"
import { ThreadActivity, ThreadActivityStore } from "@amends-dev/core/thread"
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./Binding.ts"
import { storeError } from "./internal/errors.ts"
import { inIds } from "./internal/id-list.ts"
import { threadActivities } from "./internal/schema.ts"
const validate = Schema.decodeEffect(Schema.toType(ThreadActivity.ThreadActivity))
const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...ThreadActivity.ThreadActivity.fields,
      occurredAt: Schema.DateTimeUtcFromDate
    })
  )
)
const decodeRows = (rows: ReadonlyArray<typeof threadActivities.$inferSelect>) =>
  decode(rows).pipe(Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))))
/**
 * Builds the activity store for the binding's workspace: this module's driver inside
 * `ThreadActivityStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(threadActivities.workspaceId, workspaceId)
  const driver: ThreadActivityStore.ThreadActivityStore["Service"] = {
    get: Effect.fn("ThreadActivities.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(and(inWorkspace, eq(threadActivities.id, id)))
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "get"))
    ),
    listByThread: Effect.fn("ThreadActivities.listByThread")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(and(inWorkspace, eq(threadActivities.threadId, id)))
            .orderBy(threadActivities.sequence)
        ).pipe(Effect.flatMap(decodeRows))
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "listByThread"))
    ),
    latest: Effect.fn("ThreadActivities.latest")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(and(inWorkspace, eq(threadActivities.threadId, id)))
            .orderBy(desc(threadActivities.sequence))
            .limit(1)
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "latest"))
    ),
    getFirst: Effect.fn("ThreadActivities.getFirst")(
      function* (ids) {
        if (ids.length === 0) return []
        // Recording keeps each timeline contiguous from 1, so its first activity is at 1.
        return yield* guard(
          db
            .select()
            .from(threadActivities)
            .where(and(inWorkspace, inIds(threadActivities.threadId, ids), eq(threadActivities.sequence, 1)))
        ).pipe(Effect.flatMap(decodeRows))
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "getFirst"))
    ),
    readPage: Effect.fn("ThreadActivities.readPage")(
      function* (id, request) {
        const newest = request.from === "newest"
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
                  : lt(threadActivities.sequence, sql`${request.beforeSequence}::bigint`)
              )
            )
            // The newest end is read backwards through the sequence index, then put in order.
            .orderBy(newest ? desc(threadActivities.sequence) : asc(threadActivities.sequence))
            .limit(request.limit)
        ).pipe(Effect.flatMap(decodeRows))
        return newest ? rows.toReversed() : rows
      },
      Effect.mapError(StoreError.failed("ThreadActivityStore", "readPage"))
    ),
    insert: Effect.fn("ThreadActivities.insert")(function* (record) {
      const sequenceRows = yield* guard(
        db
          .select({ next: sql<number>`coalesce(max(${threadActivities.sequence}),0)+1` })
          .from(threadActivities)
          .where(and(inWorkspace, eq(threadActivities.threadId, record.threadId))),
        true
      ).pipe(Effect.mapError(storeError("ThreadActivityStore", "insert")))
      if (sequenceRows[0]?.next !== record.sequence)
        return yield* StoreError.rejected(
          "ThreadActivityStore",
          "insert",
          "Activity must follow the current thread sequence"
        )

      const { occurredAt, ...fields } = record
      yield* guard(
        db.insert(threadActivities).values({ ...fields, occurredAt: DateTime.toDate(occurredAt) }),
        true
      ).pipe(Effect.mapError(storeError("ThreadActivityStore", "insert")))
    })
  }
  return ThreadActivityStore.make(workspaceId, driver)
})
/**
 * Provides `ThreadActivityStore.ThreadActivityStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadActivityStore.ThreadActivityStore, make)
