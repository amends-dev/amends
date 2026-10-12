/**
 * The PostgreSQL driver for `ThreadStore.ThreadStore`, over the `threads` table: one row per
 * thread, its creator's kind beside that kind's own ID column, and its latest content activity in
 * `latest_sequence` and `latest_activity_at`. A group's threads page newest first through
 * `threads_by_latest` and `threads_by_start`, from an exclusive row cursor. `ThreadStore.make`
 * checks every input before the driver sees it, so the driver keeps only what storage keeps: the
 * primary key rejects a reused ID, the latest activity only moves
 * forward, and renaming or recording activity of a missing thread is rejected. Every statement is
 * scoped to the binding's workspace and runs under its `guard`, which lets a read join the
 * caller's transaction and requires one for a write.
 *
 * @since 0.1.0
 */
import { Thread, ThreadStore, ThreadMessage } from "@amends-dev/core/thread";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, desc, eq, isNotNull, lt, or, isNull, sql } from "drizzle-orm";
import { threads } from "./internal/schema.ts";
import * as Binding from "./Binding.ts";
import { inIds } from "./internal/id-list.ts";
import { storeError } from "./internal/errors.ts";
import { StoreError } from "@amends-dev/core/journal";
const validate = Schema.decodeEffect(Schema.toType(Thread.Thread));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Thread.Thread.fields, createdAt: Schema.DateTimeUtcFromDate })),
);
type Row = typeof threads.$inferSelect;
/** Each creator kind reads only its own column; the table constraint rejects mixed rows. */
const toRecord = ({
  createdByKind,
  createdByMemberId,
  createdByContactId,
  latestSequence: _sequence,
  latestActivityAt: _at,
  ...row
}: Row) => ({
  ...row,
  createdBy:
    createdByKind === "Member"
      ? { _tag: createdByKind, memberId: createdByMemberId }
      : { _tag: createdByKind, contactId: createdByContactId },
});
const creatorColumns = (
  creator: Thread.Thread["createdBy"],
): Pick<
  typeof threads.$inferInsert,
  "createdByKind" | "createdByMemberId" | "createdByContactId"
> =>
  ThreadMessage.Author.isAnyOf(["Member"])(creator)
    ? { createdByKind: "Member", createdByMemberId: creator.memberId, createdByContactId: null }
    : { createdByKind: "Contact", createdByMemberId: null, createdByContactId: creator.contactId };
const decodeLatest = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Thread.Latest.fields, occurredAt: Schema.DateTimeUtcFromDate })),
);
const decodeRows = (rows: ReadonlyArray<Row>) =>
  decode(rows.map(toRecord)).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))),
  );
/**
 * Builds the thread store for the binding's workspace: this module's driver inside
 * `ThreadStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Threads.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(threads.workspaceId, workspaceId);
  const driver: ThreadStore.ThreadStore["Service"] = {
    get: Effect.fn("Threads.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threads)
            .where(and(inWorkspace, eq(threads.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(StoreError.failed("ThreadStore", "get")),
    ),
    getMany: Effect.fn("Threads.getMany")(
      function* (ids) {
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(threads)
            .where(and(inWorkspace, inIds(threads.id, ids))),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(StoreError.failed("ThreadStore", "getMany")),
    ),
    listByGroup: Effect.fn("Threads.listByGroup")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(threads)
            .where(and(inWorkspace, eq(threads.groupId, id)))
            .orderBy(sql`${threads.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(StoreError.failed("ThreadStore", "listByGroup")),
    ),
    listByLatest: Effect.fn("Threads.listByLatest")(
      function* (groupId, options) {
        const orderedId = sql`${threads.id} COLLATE "C"`;
        return yield* guard(
          db
            .select()
            .from(threads)
            .where(
              and(
                inWorkspace,
                eq(threads.groupId, groupId),
                isNotNull(threads.latestActivityAt),
                // A row comparison bounds the index scan; the equivalent OR form only filters it.
                options.before === undefined
                  ? undefined
                  : sql`(${threads.latestActivityAt}, ${orderedId}) < (${sql.param(DateTime.toDate(options.before.latestActivityAt), threads.latestActivityAt)}, ${options.before.threadId})`,
              ),
            )
            .orderBy(desc(threads.latestActivityAt), desc(orderedId))
            .limit(options.limit),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(StoreError.failed("ThreadStore", "listByLatest")),
    ),
    listByStart: Effect.fn("Threads.listByStart")(
      function* (groupId, options) {
        const orderedId = sql`${threads.id} COLLATE "C"`;
        return yield* guard(
          db
            .select()
            .from(threads)
            .where(
              and(
                inWorkspace,
                eq(threads.groupId, groupId),
                options.before === undefined
                  ? undefined
                  : sql`(${threads.createdAt}, ${orderedId}) < (${sql.param(DateTime.toDate(options.before.createdAt), threads.createdAt)}, ${options.before.threadId})`,
              ),
            )
            .orderBy(desc(threads.createdAt), desc(orderedId))
            .limit(options.limit),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(StoreError.failed("ThreadStore", "listByStart")),
    ),
    getLatest: Effect.fn("Threads.getLatest")(
      function* (ids) {
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select({
              threadId: threads.id,
              sequence: threads.latestSequence,
              occurredAt: threads.latestActivityAt,
            })
            .from(threads)
            .where(and(inWorkspace, inIds(threads.id, ids), isNotNull(threads.latestSequence))),
        ).pipe(Effect.flatMap(decodeLatest));
      },
      Effect.mapError(StoreError.failed("ThreadStore", "getLatest")),
    ),
    recordLatest: Effect.fn("Threads.recordLatest")(function* (latest) {
      const advanced = yield* guard(
        db
          .update(threads)
          .set({
            latestSequence: latest.sequence,
            latestActivityAt: DateTime.toDate(latest.occurredAt),
          })
          .where(
            and(
              inWorkspace,
              eq(threads.id, latest.threadId),
              or(isNull(threads.latestSequence), lt(threads.latestSequence, latest.sequence)),
            ),
          )
          .returning({ id: threads.id }),
        true,
      ).pipe(Effect.mapError(storeError("ThreadStore", "recordLatest")));
      if (advanced.length > 0) return;
      // Nothing advanced: an earlier position changes nothing, but the thread must exist.
      const found = yield* guard(
        db
          .select({ id: threads.id })
          .from(threads)
          .where(and(inWorkspace, eq(threads.id, latest.threadId))),
        true,
      ).pipe(Effect.mapError(storeError("ThreadStore", "recordLatest")));
      if (found.length === 0)
        return yield* StoreError.rejected("ThreadStore", "recordLatest", "Thread is missing");
    }),
    rename: Effect.fn("Threads.rename")(function* (renamed) {
      const updated = yield* guard(
        db
          .update(threads)
          .set({ title: renamed.title })
          .where(and(inWorkspace, eq(threads.id, renamed.threadId)))
          .returning({ id: threads.id }),
        true,
      ).pipe(Effect.mapError(storeError("ThreadStore", "rename")));
      if (updated.length === 0)
        return yield* StoreError.rejected("ThreadStore", "rename", "Thread is missing");
    }),
    insert: Effect.fn("Threads.insert")(function* (record) {
      const creator = record.createdBy;
      const { createdBy: _, ...fields } = record;
      yield* guard(
        db.insert(threads).values({
          ...fields,
          ...creatorColumns(creator),
          createdAt: DateTime.toDate(record.createdAt),
        }),
        true,
      ).pipe(Effect.mapError(storeError("ThreadStore", "insert")));
    }),
  };
  return ThreadStore.make(workspaceId, driver);
});
/**
 * Provides `ThreadStore.ThreadStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ThreadStore.ThreadStore, make());
