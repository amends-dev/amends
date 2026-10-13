/**
 * The PostgreSQL driver for `TaskStore.TaskStore`, over the `tasks` table: one row per task, keyed
 * by its thread, with its creator's kind in a column beside that kind's own ID column. A group's
 * tasks page newest first through `tasks_by_group`, from an exclusive row cursor.
 * `TaskStore.make` checks every input before the driver sees it, so the driver keeps only what
 * storage keeps: the primary key rejects a thread that has a task, and
 * applying a change is a conditional update rejected unless the task holds the value the
 * change replaces. Every statement is scoped to the binding's workspace and runs under its
 * `guard`, which lets a read join the caller's transaction and requires one for a write.
 */

import { StoreError } from "@amends-dev/core/journal"
import { Task, TaskStore } from "@amends-dev/core/task"
import { ThreadMessage } from "@amends-dev/core/thread"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { inIds } from "./idList.ts"
import { tasks } from "./schema.ts"
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Task.Task.fields, createdAt: Schema.DateTimeUtcFromDate }))
)
type Row = typeof tasks.$inferSelect
type Insert = typeof tasks.$inferInsert
/** Each creator kind reads only its own column; the table constraint rejects mixed rows. */
const toRecord = ({ createdByKind, createdByMemberId, createdByContactId, ...row }: Row) => ({
  ...row,
  createdBy:
    createdByKind === "Member"
      ? { _tag: createdByKind, memberId: createdByMemberId }
      : { _tag: createdByKind, contactId: createdByContactId }
})
const creatorColumns = (
  creator: Task.Task["createdBy"]
): Pick<Insert, "createdByKind" | "createdByMemberId" | "createdByContactId"> =>
  ThreadMessage.Author.isAnyOf(["Member"])(creator)
    ? { createdByKind: "Member", createdByMemberId: creator.memberId, createdByContactId: null }
    : { createdByKind: "Contact", createdByMemberId: null, createdByContactId: creator.contactId }
const toRecords = (rows: ReadonlyArray<Row>) => decodeRows(rows.map(toRecord))
/** The column a change writes, what it writes there, and the row it expects to find. */
const changeColumns = Task.Change.match<{ readonly set: Partial<Insert>; readonly where: SQL }>({
  Status: ({ from, to }) => ({ set: { status: to }, where: eq(tasks.status, from) }),
  Priority: ({ from, to }) => ({ set: { priority: to }, where: eq(tasks.priority, from) }),
  Assignee: ({ from, to }) => ({
    set: { assignee: to },
    where: from === null ? isNull(tasks.assignee) : eq(tasks.assignee, from)
  })
})
/**
 * Builds the task store for the binding's workspace: this module's driver inside
 * `TaskStore.make`, which checks every input first.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(tasks.workspaceId, workspaceId)
  const driver: TaskStore.TaskStore["Service"] = {
    get: (threadId) =>
      guard(
        db
          .select()
          .from(tasks)
          .where(and(inWorkspace, eq(tasks.threadId, threadId)))
      ).pipe(Effect.flatMap(toRecords), Effect.map(Array.head), Effect.mapError(StoreError.failed("TaskStore", "get"))),
    getMany: (threadIds) =>
      threadIds.length === 0
        ? Effect.succeed([])
        : guard(
            db
              .select()
              .from(tasks)
              .where(and(inWorkspace, inIds(tasks.threadId, threadIds)))
          ).pipe(Effect.flatMap(toRecords), Effect.mapError(StoreError.failed("TaskStore", "getMany"))),
    listByGroup: (groupId, options) => {
      const orderedId = sql`${tasks.threadId} COLLATE "C"`
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
                : sql`(${tasks.createdAt}, ${orderedId}) < (${sql.param(DateTime.toDate(options.before.createdAt), tasks.createdAt)}, ${options.before.threadId})`
            )
          )
          .orderBy(desc(tasks.createdAt), desc(orderedId))
          .limit(options.limit)
      ).pipe(Effect.flatMap(toRecords), Effect.mapError(StoreError.failed("TaskStore", "listByGroup")))
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
          createdAt: DateTime.toDate(record.createdAt)
        }),
        true
      ).pipe(Effect.asVoid, Effect.mapError(storeError("TaskStore", "insert"))),
    apply: Effect.fn("Tasks.apply")(function* (threadId, change) {
      const columns = changeColumns(change)
      const updated = yield* guard(
        db
          .update(tasks)
          .set(columns.set)
          .where(and(inWorkspace, eq(tasks.threadId, threadId), columns.where))
          .returning({ threadId: tasks.threadId }),
        true
      ).pipe(Effect.mapError(storeError("TaskStore", "apply")))
      if (updated.length === 0)
        return yield* StoreError.rejected("TaskStore", "apply", "Expected a task holding the value the change replaces")
    })
  }
  return TaskStore.make(workspaceId, driver)
})
/**
 * Provides `TaskStore.TaskStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(TaskStore.TaskStore, make)
