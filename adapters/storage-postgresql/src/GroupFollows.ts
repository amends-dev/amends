/**
 * The PostgreSQL driver for `GroupFollowStore.GroupFollowStore`, over the `group_follows` table:
 * each follow, active or ended, with the group admission it belongs to. `GroupFollowStore.make`
 * checks every input before the driver sees it, so the driver keeps only what storage keeps: the
 * primary key refuses a reused ID and `active_group_follow` a second active follow for one
 * admission, each as the store's `Conflict`, and ending a follow is a conditional update that
 * conflicts unless it finds exactly the addressed follow active. Every statement is scoped to the
 * binding's workspace and runs under its `guard`, which lets a read join the caller's transaction
 * and requires one for a write.
 *
 * @since 0.1.0
 */
import { GroupFollow, GroupFollowStore } from "@amends-dev/core/group";
import { and, eq, sql } from "drizzle-orm";
import { Array, DateTime, Effect, Layer, Schema } from "effect";
import * as Binding from "./Binding.ts";
import { inIds } from "./internal/id-list.ts";
import { storeError, storeFailure } from "./internal/errors.ts";
import { groupFollows } from "./internal/schema.ts";

const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...GroupFollow.GroupFollow.fields,
      followedAt: Schema.DateTimeUtcFromDate,
      endedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    }),
  ),
);

/**
 * Builds the group follow store for the binding's workspace: this module's driver inside
 * `GroupFollowStore.make`, which checks every input first.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("GroupFollows.make")(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding;
  const { db } = database;
  const inWorkspace = eq(groupFollows.workspaceId, workspaceId);
  const driver: GroupFollowStore.GroupFollowStore["Service"] = {
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

/**
 * Provides `GroupFollowStore.GroupFollowStore` over the caller's `Binding.Binding`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(GroupFollowStore.GroupFollowStore, make());
