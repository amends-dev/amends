import { Group } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Task, TaskStore } from "@amends/core/task";
import { Thread, ThreadMessage } from "@amends/core/thread";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { tasks } from "./schema.ts";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(Task.Record));
const decode = Schema.decodeUnknownEffect(
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
const decodeRows = (rows: ReadonlyArray<Row>) =>
  decode(rows.map(toRecord)).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))),
  );
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
/** Workspace-bound tasks projection storage, keyed by thread. @category constructors */
export const make = Effect.fn("Tasks.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(tasks.workspaceId, workspaceId);
  return TaskStore.Service.of({
    get: Effect.fn("Tasks.get")(
      function* (input) {
        const threadId = yield* Schema.decodeEffect(Thread.Id)(input);
        return yield* guard(
          db
            .select()
            .from(tasks)
            .where(and(inWorkspace, eq(tasks.threadId, threadId))),
        ).pipe(Effect.flatMap(decodeRows), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(TaskStore, "get")),
    ),
    getMany: Effect.fn("Tasks.getMany")(
      function* (input) {
        const threadIds = yield* Schema.decodeEffect(Schema.Array(Thread.Id))(input);
        if (threadIds.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(tasks)
            .where(and(inWorkspace, inIds(tasks.threadId, threadIds))),
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(TaskStore, "getMany")),
    ),
    listByGroup: Effect.fn("Tasks.listByGroup")(
      function* (groupInput, input) {
        const groupId = yield* Schema.decodeEffect(Group.Id)(groupInput);
        const options = yield* Schema.decodeEffect(Schema.toType(Task.ListOptions))(input);
        const orderedId = sql`${tasks.threadId} COLLATE "C"`;
        return yield* guard(
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
        ).pipe(Effect.flatMap(decodeRows));
      },
      Effect.mapError(storeFailure(TaskStore, "listByGroup")),
    ),
    insert: Effect.fn("Tasks.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validate(input).pipe(
        Effect.mapError(storeConflict(TaskStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new TaskStore.Conflict({
          operation: "insert",
          message: "Invalid initial record or workspace",
        });
      yield* guard(
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
      ).pipe(Effect.mapError(storeError(TaskStore, "insert")));
    }),
    apply: Effect.fn("Tasks.apply")(function* (threadInput, changeInput) {
      yield* Store.Transaction;
      const threadId = yield* Schema.decodeEffect(Thread.Id)(threadInput).pipe(
        Effect.mapError(storeConflict(TaskStore, "apply")),
      );
      const change = yield* Schema.decodeEffect(Schema.toType(Task.Change))(changeInput).pipe(
        Effect.mapError(storeConflict(TaskStore, "apply")),
      );
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
  });
});
/** @category layers */
export const layer = Layer.effect(TaskStore.Service, make());
export * as Tasks from "./tasks.ts";
