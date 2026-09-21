import { Group, GroupStore } from "@amends/core/group";
import { Store } from "@amends/core/journal";
import { and, eq } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { storeConflict, storeError, storeFailure } from "./errors.ts";
import { groups, members } from "./schema.ts";

const validateRecord = Schema.decodeEffect(Schema.toType(Group.Record));
const decode = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Group.Record.fields, createdAt: Schema.DateTimeUtcFromDate })),
);

/** Group records over the current workspace transaction. @category constructors */
export const make = Effect.fn("Groups.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  return GroupStore.Service.of({
    workspaceId,
    get: Effect.fn("Groups.get")(
      function* (input) {
        const id = yield* Schema.decodeEffect(Group.Id)(input);
        return yield* guard(
          db
            .select()
            .from(groups)
            .where(and(eq(groups.workspaceId, workspaceId), eq(groups.id, id))),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupStore, "get")),
    ),
    insert: Effect.fn("Groups.insert")(function* (input) {
      yield* Store.Transaction;
      const record = yield* validateRecord(input).pipe(
        Effect.mapError(storeConflict(GroupStore, "insert")),
      );
      if (record.workspaceId !== workspaceId)
        return yield* new GroupStore.Conflict({
          operation: "insert",
          message: "Expected a group in this workspace",
        });
      const creator = yield* guard(
        db
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.workspaceId, workspaceId), eq(members.id, record.createdBy))),
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "insert")));
      if (creator.length === 0)
        return yield* new GroupStore.Conflict({
          operation: "insert",
          message: "Creator membership is missing",
        });
      yield* guard(
        db.insert(groups).values({ ...record, createdAt: DateTime.toDate(record.createdAt) }),
        true,
      ).pipe(Effect.mapError(storeError(GroupStore, "insert")));
    }),
  });
});

/** Provide group storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupStore.Service, make());

export * as Groups from "./groups.ts";
