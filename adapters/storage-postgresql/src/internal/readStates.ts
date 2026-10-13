/**
 * The PostgreSQL driver for `ReadStateStore.ReadStateStore`, over `thread_read_positions` and
 * `group_read_times`: private read state, outside the journal, referencing no projection rows, so
 * rebuilds keep it. `ReadStateStore.make` checks every input before the driver sees it, so the
 * driver keeps only what storage keeps: each advance is one upsert that keeps the later of the
 * stored and requested value with `greatest`. Marking a thread read is one statement that also
 * marks the member's pending notifications from it seen, as `Notifications` does, so it is atomic
 * without a transaction. Every statement is scoped to the binding's workspace and runs under its
 * `guard`; a write joins the caller's transaction when there is one and otherwise commits on its
 * own, without the workspace's lock.
 */

import { StoreError } from "@amends-dev/core/journal"
import { ReadState, ReadStateStore } from "@amends-dev/core/read-state"
import { and, eq, sql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { inIds } from "./id-list.ts"
import { groupReadTimes, notificationSeen, threadReadPositions } from "./schema.ts"

const decodePositions = Schema.decodeUnknownEffect(Schema.Array(ReadState.ThreadPosition))
const decodeGroups = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...ReadState.GroupRead.fields, readAt: Schema.DateTimeUtcFromDate }))
)

/**
 * Private read state in plain columns. Writes are single upserts that keep the later value; they
 * join the caller's transaction when there is one and otherwise commit on their own, without the
 * workspace lock that orders journal commits.
 */
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
    markThreadRead: Effect.fn("ReadStates.markThreadRead")(function* (position, seenAt) {
      const { memberId, threadId, readThrough } = position
      const seen = sql.param(DateTime.toDate(seenAt), notificationSeen.seenAt)
      // The member's pending notifications from the thread up to the position become Seen, and
      // notification_seen keeps the first time through rebuilds, as Notifications.markSeen does;
      // the position keeps the later value. Every part of one statement commits together.
      yield* guard(
        db.execute(sql`
          WITH seen AS (
            UPDATE notifications SET state = 'Seen', seen_at = ${seen}::timestamptz
            WHERE workspace_id = ${workspaceId} AND recipient_kind = 'Human'
              AND coalesce(recipient_member_id, recipient_id, '') = ${memberId}
              AND thread_id = ${threadId} AND thread_sequence <= ${readThrough}
              AND state = 'Pending'
            RETURNING id, seen_at
          ), recorded AS (
            INSERT INTO notification_seen (workspace_id, notification_id, seen_at)
            SELECT ${workspaceId}::text, id, seen_at FROM seen
            ON CONFLICT DO NOTHING
          )
          INSERT INTO thread_read_positions (workspace_id, member_id, thread_id, read_through)
          VALUES (${workspaceId}, ${memberId}, ${threadId}, ${readThrough})
          ON CONFLICT (workspace_id, member_id, thread_id) DO UPDATE
            SET read_through = greatest(thread_read_positions.read_through, excluded.read_through)`)
      ).pipe(Effect.mapError(storeError("ReadStateStore", "markThreadRead")))
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
          })
      ).pipe(Effect.mapError(storeError("ReadStateStore", "advanceGroup")))
    })
  }
  return ReadStateStore.make(workspaceId, driver)
})

/**
 * Provides `ReadStateStore.ReadStateStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(ReadStateStore.ReadStateStore, make)
