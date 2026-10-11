import { Task, TaskStore } from "@amends-dev/core/task";
import { ThreadMessage } from "@amends-dev/core/thread";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { tasks } from "./schema.ts";
import * as Binding from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeError, storeFailure } from "./errors.ts";
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Task.Record.fields, createdAt: Schema.DateTimeUtcFromDate })),
);
type Row = typeof tasks.$inferSelect;
type Insert = typeof tasks.$inferInsert;
/** Each creator kind reads only its own column; the table constraint rejects mixed rows. */
const toRecord = ({ createdByKind, createdByMemberId, createdByContactId, ...row }: Row) => ({
  ...row,
  createdBy:
    createdByKind === "Member"
      ? { _tag: createdByKind, memberId: createdByMemberId }
      : { _tag: createdByKind, contactId: createdByContactId },
});
const creatorColumns = (
  creator: Task.Record["createdBy"],
): Pick<Insert, "createdByKind" | "createdByMemberId" | "createdByContactId"> =>
  ThreadMessage.Author.isAnyOf(["Member"])(creator)
    ? { createdByKind: "Member", createdByMemberId: creator.memberId, createdByContactId: null }
    : { createdByKind: "Contact", createdByMemberId: null, createdByContactId: creator.contactId };
const toRecords = (rows: ReadonlyArray<Row>) => decodeRows(rows.map(toRecord));
/** The column a change writes, what it writes there, and the row it expects to find. */
const changeColumns = (
  change: Task.Change,
): { readonly set: Partial<Insert>; readonly where: SQL } => {
  switch (change._tag) {
    case "Status":
      return { set: { status: change.to }, where: eq(tasks.status, change.from) };
    case "Priority":
      return { set: { priority: change.to }, where: eq(tasks.priority, change.from) };
    case "Assignee":
      return {
        set: { assignee: change.to },
        where: change.from === null ? isNull(tasks.assignee) : eq(tasks.assignee, change.from),
      };
  }
};
/** Tasks by thread, over one workspace's binding. @category constructors */
export const make = Effect.fn("Tasks.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(tasks.workspaceId, workspaceId);
  const driver: TaskStore.TaskStore["Service"] = {
    get: (threadId) =>
      guard(
        db
          .select()
          .from(tasks)
          .where(and(inWorkspace, eq(tasks.threadId, threadId))),
      ).pipe(
        Effect.flatMap(toRecords),
        Effect.map(Array.head),
        Effect.mapError(storeFailure(TaskStore, "get")),
      ),
    getMany: (threadIds) =>
      threadIds.length === 0
        ? Effect.succeed([])
        : guard(
            db
              .select()
              .from(tasks)
              .where(and(inWorkspace, inIds(tasks.threadId, threadIds))),
          ).pipe(Effect.flatMap(toRecords), Effect.mapError(storeFailure(TaskStore, "getMany"))),
    listByGroup: (groupId, options) => {
      const orderedId = sql`${tasks.threadId} COLLATE "C"`;
      return guard(
        db
          .select()
          .from(tasks)
          .where(
            and(
              inWorkspace,
              eq(tasks.groupId, groupId),
              options.status === undefined ? undefined : eq(tasks.status, options.status),
              options.before === undefined
                ? undefined
                : sql`(${tasks.createdAt}, ${orderedId}) < (${sql.param(DateTime.toDate(options.before.createdAt), tasks.createdAt)}, ${options.before.threadId})`,
            ),
          )
          .orderBy(desc(tasks.createdAt), desc(orderedId))
          .limit(options.limit),
      ).pipe(Effect.flatMap(toRecords), Effect.mapError(storeFailure(TaskStore, "listByGroup")));
    },
    insert: (record) =>
      guard(
        db.insert(tasks).values({
          workspaceId: record.workspaceId,
          threadId: record.threadId,
          groupId: record.groupId,
          status: record.status,
          priority: record.priority,
          assignee: record.assignee,
          ...creatorColumns(record.createdBy),
          createdAt: DateTime.toDate(record.createdAt),
        }),
        true,
      ).pipe(Effect.asVoid, Effect.mapError(storeError(TaskStore, "insert"))),
    apply: Effect.fn("Tasks.apply")(function* (threadId, change) {
      const columns = changeColumns(change);
      const updated = yield* guard(
        db
          .update(tasks)
          .set(columns.set)
          .where(and(inWorkspace, eq(tasks.threadId, threadId), columns.where))
          .returning({ threadId: tasks.threadId }),
        true,
      ).pipe(Effect.mapError(storeError(TaskStore, "apply")));
      if (updated.length === 0)
        return yield* new TaskStore.Conflict({
          operation: "apply",
          message: "Expected a task holding the value the change replaces",
        });
    }),
  };
  return TaskStore.make(workspaceId, driver);
});
/** @category layers */
export const layer = Layer.effect(TaskStore.TaskStore, make());
