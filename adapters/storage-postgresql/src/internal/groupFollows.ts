/**
 * The PostgreSQL driver for `GroupFollowStore.GroupFollowStore`, over the `group_follows` table:
 * each follow, active or ended, with the group admission it belongs to. `GroupFollowStore.make`
 * checks every input before the driver sees it, so the driver keeps only what storage keeps: the
 * primary key refuses a reused ID and `active_group_follow` a second active follow for one
 * admission, each rejected, and ending a follow is a conditional update rejected unless it finds
 * exactly the addressed follow active. Every statement is scoped to the binding's workspace and
 * runs under its `guard`, which lets a read join the caller's transaction and requires one for a
 * write.
 */

import { GroupFollow, GroupFollowStore } from "@amends-dev/core/group"
import { StoreError } from "@amends-dev/core/journal"
import { and, eq, sql } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { inIds } from "./id-list.ts"
import { groupFollows } from "./schema.ts"

const decode = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...GroupFollow.GroupFollow.fields,
      followedAt: Schema.DateTimeUtcFromDate,
      endedAt: Schema.NullOr(Schema.DateTimeUtcFromDate)
    })
  )
)

/**
 * Builds the group follow store for the binding's workspace: this module's driver inside
 * `GroupFollowStore.make`, which checks every input first.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(groupFollows.workspaceId, workspaceId)
  const driver: GroupFollowStore.GroupFollowStore["Service"] = {
    get: Effect.fn("GroupFollows.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(and(inWorkspace, eq(groupFollows.id, id)))
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "get"))
    ),
    findActive: Effect.fn("GroupFollows.findActive")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(and(inWorkspace, eq(groupFollows.groupMembershipId, id), eq(groupFollows.status, "active")))
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "findActive"))
    ),
    findActiveMany: Effect.fn("GroupFollows.findActiveMany")(
      function* (ids) {
        if (ids.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(and(inWorkspace, inIds(groupFollows.groupMembershipId, ids), eq(groupFollows.status, "active")))
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "findActiveMany"))
    ),
    listActiveByGroup: Effect.fn("GroupFollows.listActiveByGroup")(
      function* (groupId) {
        return yield* guard(
          db
            .select()
            .from(groupFollows)
            .where(and(inWorkspace, eq(groupFollows.groupId, groupId), eq(groupFollows.status, "active")))
            .orderBy(sql`${groupFollows.id} COLLATE "C"`)
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("GroupFollowStore", "listActiveByGroup"))
    ),
    insert: Effect.fn("GroupFollows.insert")(function* (record) {
      const { followedAt, ...fields } = record
      yield* guard(
        db.insert(groupFollows).values({
          ...fields,
          followedAt: DateTime.toDate(followedAt),
          endedAt: null
        }),
        true
      ).pipe(Effect.mapError(storeError("GroupFollowStore", "insert")))
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
              eq(groupFollows.status, "active")
            )
          )
          .returning({ id: groupFollows.id }),
        true
      ).pipe(Effect.mapError(storeError("GroupFollowStore", "end")))
      if (rows.length !== 1)
        return yield* StoreError.rejected("GroupFollowStore", "end", "Follow is missing, mismatched, or already ended")
    })
  }
  return GroupFollowStore.make(workspaceId, driver)
})

/**
 * Provides `GroupFollowStore.GroupFollowStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(GroupFollowStore.GroupFollowStore, make)
