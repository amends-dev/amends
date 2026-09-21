import { Thread, ThreadStore } from "@amends/core/thread";
import { Group } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { and, eq, sql } from "drizzle-orm";
import { threads, groups, members } from "./schema.ts";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
const validate = Schema.decodeEffect(Schema.toType(Thread.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Thread.Record.fields, createdAt: Schema.DateTimeUtcFromDate })),
);
const decodeRows = (rows: ReadonlyArray<typeof threads.$inferSelect>) =>
  decode(rows).pipe(
    Effect.flatMap((values) => Effect.forEach(values, (record) => validate(record))),
  );
/** Workspace-bound threads projection storage. @category constructors */
export const make = Effect.fn("Threads.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(threads.workspaceId, workspaceId);
  return ThreadStore.Service.of({
    workspaceId,
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
      const related = yield* guard(
        db
          .select({ id: groups.id })
          .from(groups)
          .innerJoin(members, eq(members.workspaceId, groups.workspaceId))
          .where(
            and(
              eq(groups.workspaceId, workspaceId),
              eq(groups.id, record.groupId),
              eq(members.id, record.createdBy),
            ),
          ),
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "insert")));
      if (related.length === 0)
        return yield* new ThreadStore.Conflict({
          operation: "insert",
          message: "Missing or inconsistent references",
        });

      yield* guard(
        db.insert(threads).values({ ...record, createdAt: DateTime.toDate(record.createdAt) }),
        true,
      ).pipe(Effect.mapError(storeError(ThreadStore, "insert")));
    }),
  });
});
/** @category layers */
export const layer = Layer.effect(ThreadStore.Service, make());
export * as Threads from "./threads.ts";
