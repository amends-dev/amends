/**
 * The PostgreSQL driver for `ReadStateStore.ReadStateStore`, over `thread_read_positions` and
 * `group_read_times`, which `ReadStateProjection` keeps. `ReadStateStore.make` checks every input
 * before the driver sees it, so the driver keeps only what storage keeps: each advance is one
 * upsert that keeps the later of the stored and requested value with `greatest`. Every statement
 * is scoped to the binding's workspace and runs under its `guard`, which lets a read join the
 * caller's transaction and requires one for a write.
 */

import { ReadState, ReadStateStore } from "@amends-dev/core/read-state"
import { StoreError } from "@amends-dev/log"
import { and, eq, sql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { inIds } from "./idList.ts"
import { groupReadTimes, threadReadPositions } from "./schema.ts"

const decodePositions = Schema.decodeUnknownEffect(Schema.Array(ReadState.ThreadPosition))
const decodeGroups = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...ReadState.GroupRead.fields, readAt: Schema.DateTimeUtcFromDate }))
)

/** Read state in plain columns. Writes are single upserts that keep the later value. */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const driver: ReadStateStore.ReadStateStore["Service"] = {
    getThreadPositions: Effect.fn("ReadStates.getThreadPositions")(
      function* (memberId, threadIds) {
        if (threadIds.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(threadReadPositions)
            .where(
              and(
                eq(threadReadPositions.workspaceId, workspaceId),
                eq(threadReadPositions.memberId, memberId),
                inIds(threadReadPositions.threadId, threadIds)
              )
            )
        ).pipe(Effect.flatMap(decodePositions))
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "getThreadPositions"))
    ),
    advanceThread: Effect.fn("ReadStates.advanceThread")(function* (position) {
      yield* guard(
        db
          .insert(threadReadPositions)
          .values(position)
          .onConflictDoUpdate({
            target: [threadReadPositions.workspaceId, threadReadPositions.memberId, threadReadPositions.threadId],
            set: { readThrough: sql`greatest(${threadReadPositions.readThrough}, excluded.read_through)` }
          }),
        true
      ).pipe(Effect.mapError(storeError("ReadStateStore", "advanceThread")))
    }),
    getGroupReads: Effect.fn("ReadStates.getGroupReads")(
      function* (memberId, groupIds) {
        if (groupIds.length === 0) return []
        return yield* guard(
          db
            .select()
            .from(groupReadTimes)
            .where(
              and(
                eq(groupReadTimes.workspaceId, workspaceId),
                eq(groupReadTimes.memberId, memberId),
                inIds(groupReadTimes.groupId, groupIds)
              )
            )
        ).pipe(Effect.flatMap(decodeGroups))
      },
      Effect.mapError(StoreError.failed("ReadStateStore", "getGroupReads"))
    ),
    advanceGroup: Effect.fn("ReadStates.advanceGroup")(function* (groupRead) {
      const { readAt, ...fields } = groupRead
      yield* guard(
        db
          .insert(groupReadTimes)
          .values({ ...fields, readAt: DateTime.toDate(readAt) })
          .onConflictDoUpdate({
            target: [groupReadTimes.workspaceId, groupReadTimes.memberId, groupReadTimes.groupId],
            set: {
              readAt: sql`greatest(${groupReadTimes.readAt}, excluded.read_at)`
            }
          }),
        true
      ).pipe(Effect.mapError(storeError("ReadStateStore", "advanceGroup")))
    })
  }
  return ReadStateStore.make(workspaceId, driver)
})

/**
 * Provides `ReadStateStore.ReadStateStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(ReadStateStore.ReadStateStore, make)
