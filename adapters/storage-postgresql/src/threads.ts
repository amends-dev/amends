import { Thread, ThreadStore, ThreadMessage } from "@amends/core/thread";
import { Group } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, desc, eq, isNotNull, lt, or, isNull, sql } from "drizzle-orm";
import { threads } from "./schema.ts";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(Thread.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Thread.Record.fields, createdAt: Schema.DateTimeUtcFromDate })),
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
  creator: Thread.Record["createdBy"],
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
/** Workspace-bound threads projection storage. @category constructors */
export const make = Effect.fn("Threads.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(threads.workspaceId, workspaceId);
  return ThreadStore.Service.of({
    get: Effect.fn("Threads.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threads)
            .where(and(inWorkspace, eq(threads.id, id))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(ThreadStore, "get")),
    ),
    listByGroup: Effect.fn("Threads.listByGroup")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* guard(
          db
            .select()
            .from(threads)
            .where(and(inWorkspace, eq(threads.groupId, id)))
            .orderBy(sql`${threads.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(ThreadStore, "listByGroup")),
    ),
    listByLatest: Effect.fn("Threads.listByLatest")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(Schema.toType(Thread.ListOptions))(input);
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
      Effect.mapError(storeFailure(ThreadStore, "listByLatest")),
    ),
    listByStart: Effect.fn("Threads.listByStart")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(Schema.toType(Thread.OpeningOptions))(input);
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
      Effect.mapError(storeFailure(ThreadStore, "listByStart")),
    ),
    getLatest: Effect.fn("Threads.getLatest")(
      function* (input) {
        const ids = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(input);
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
      Effect.mapError(storeFailure(ThreadStore, "getLatest")),
    ),
    recordLatest: Effect.fn("Threads.recordLatest")(function* (input) {
      yield* Store.Transaction;
      const latest = yield* Schema.decodeEffect(Schema.toType(Thread.Latest))(input).pipe(
        Effect.mapError(storeConflict(ThreadStore, "recordLatest")),
      );
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
      ).pipe(Effect.mapError(storeError(ThreadStore, "recordLatest")));
      if (advanced.length > 0) return;
      // Nothing advanced: an earlier position changes nothing, but the thread must exist.
      const found = yield* guard(
        db
          .select({ id: threads.id })
          .from(threads)
          .where(and(inWorkspace, eq(threads.id, latest.threadId))),
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "recordLatest")));
      if (found.length === 0)
        return yield* new ThreadStore.Conflict({
          operation: "recordLatest",
          message: "Thread is missing",
        });
    }),
    rename: Effect.fn("Threads.rename")(function* (input) {
      yield* Store.Transaction;
      const renamed = yield* Schema.decodeEffect(Schema.toType(Thread.Renamed))(input).pipe(
        Effect.mapError(storeConflict(ThreadStore, "rename")),
      );
      if (renamed.workspaceId !== workspaceId)
        return yield* new ThreadStore.Conflict({
          operation: "rename",
          message: "Expected a thread in this workspace",
        });
      const updated = yield* guard(
        db
          .update(threads)
          .set({ title: renamed.title })
          .where(and(inWorkspace, eq(threads.id, renamed.threadId)))
          .returning({ id: threads.id }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "rename")));
      if (updated.length === 0)
        return yield* new ThreadStore.Conflict({
          operation: "rename",
          message: "Thread is missing",
        });
    }),
    insert: Effect.fn("Threads.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(ThreadStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      const creator = record.createdBy;
      const { createdBy: _, ...fields } = record;
      yield* guard(
        db.insert(threads).values({
          ...fields,
          ...creatorColumns(creator),
          createdAt: DateTime.toDate(record.createdAt),
        }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadStore.Service, make());
export * as Threads from "./threads.ts";
