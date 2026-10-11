import { GroupFollow, GroupFollowStore } from "@amends-dev/core/group";
import { and, eq, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import { Binding } from "./binding.ts";
import { inIds } from "./id-list.ts";
import { storeError, storeFailure } from "./errors.ts";
import { groupFollows } from "./schema.ts";

const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...GroupFollow.Record.fields,
      followedAt: Schema.DateTimeUtcFromDate,
      endedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    }),
  ),
);

/** Group follows, active and ended; one active follow per group admission. @category constructors */
export const make = Effect.fn("GroupFollows.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Service;
  const { db } = database;
  const inWorkspace = eq(groupFollows.workspaceId, workspaceId);
  const driver: GroupFollowStore.Interface = {
    get: Effect.fn("GroupFollows.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(and(inWorkspace, eq(groupFollows.id, id))),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "get")),
    ),
    findActive: Effect.fn("GroupFollows.findActive")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(
              and(
                inWorkspace,
                eq(groupFollows.groupMembershipId, id),
                eq(groupFollows.status, "active"),
              ),
            ),
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActive")),
    ),
    findActiveMany: Effect.fn("GroupFollows.findActiveMany")(
      function* (ids) {
        if (ids.length === 0) return [];
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(
              and(
                inWorkspace,
                inIds(groupFollows.groupMembershipId, ids),
                eq(groupFollows.status, "active"),
              ),
            ),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "findActiveMany")),
    ),
    listActiveByGroup: Effect.fn("GroupFollows.listActiveByGroup")(
      function* (groupId) {
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(
              and(
                inWorkspace,
                eq(groupFollows.groupId, groupId),
                eq(groupFollows.status, "active"),
              ),
            )
            .orderBy(sql`${groupFollows.id} COLLATE "C"`),
        ).pipe(Effect.flatMap(decode));
      },
      Effect.mapError(storeFailure(GroupFollowStore, "listActiveByGroup")),
    ),
    insert: Effect.fn("GroupFollows.insert")(function* (record) {
      const { followedAt, ...fields } = record;
      yield* guard(
        db.insert(groupFollows).values({
          ...fields,
          followedAt: DateTime.toDate(followedAt),
          endedAt: null,
        }),
        true,
      ).pipe(Effect.mapError(storeError(GroupFollowStore, "insert")));
    }),
    end: Effect.fn("GroupFollows.end")(function* (ending, endedAt) {
      const rows = yield* guard(
        db
          .update(groupFollows)
          .set({ status: "ended", endedAt: DateTime.toDate(endedAt) })
          .where(
            and(
              inWorkspace,
              eq(groupFollows.id, ending.followId),
              eq(groupFollows.groupId, ending.groupId),
              eq(groupFollows.memberId, ending.memberId),
              eq(groupFollows.status, "active"),
            ),
          )
          .returning({ id: groupFollows.id }),
        true,
      ).pipe(Effect.mapError(storeError(GroupFollowStore, "end")));
      if (rows.length !== 1)
        return yield* new GroupFollowStore.Conflict({
          operation: "end",
          message: "Follow is missing, mismatched, or already ended",
        });
    }),
  };
  return GroupFollowStore.make(workspaceId, driver);
});

/** Provide group follow storage over the caller's binding. @category layers */
export const layer = Layer.effect(GroupFollowStore.Service, make());

export * as GroupFollows from "./group-follows.ts";
