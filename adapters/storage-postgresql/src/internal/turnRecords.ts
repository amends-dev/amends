/**
 * The PostgreSQL driver for `TurnStore.TurnStore`, over the `turns` table: one row per turn, with
 * the harness, model, and sandbox it started on as columns, set all together or not at all, and its
 * retry as a pair of columns. `TurnStore.make` checks every input before the driver sees it, so the
 * driver keeps only what storage keeps: the primary key refuses a reused ID and
 * `active_turn_by_agent_thread` a second active turn for one agent and thread, inserted or updated,
 * each rejected, and an update that finds no row is rejected. Every statement is scoped to the
 * binding's workspace and runs under its `guard`, which lets a read join the caller's transaction
 * and requires one for a write.
 */

import type { ThreadId } from "@amends-dev/core/thread"
import { Turn, TurnStore } from "@amends-dev/core/turn"
import type { MemberId } from "@amends-dev/core/workspace"
import { StoreError } from "@amends-dev/log"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Binding from "./binding.ts"
import { storeError } from "./errors.ts"
import { turns } from "./schema.ts"

const validateRecord = Schema.decodeEffect(Schema.toType(Turn.Turn))
const Instant = Schema.NullOr(Schema.DateTimeUtcFromDate)
const decodeRows = Schema.decodeUnknownEffect(
  Schema.Array(
    Schema.Struct({
      ...Turn.Turn.fields,
      createdAt: Schema.DateTimeUtcFromDate,
      startedAt: Instant,
      finishedAt: Instant
    })
  )
)
type Row = typeof turns.$inferSelect
/** The record a row stores, before its fields are checked. */
const toRecord = ({
  retryOf,
  retriedBy,
  harnessConnectionId,
  modelConnectionId,
  modelId,
  modelEffort,
  sandboxConnectionId,
  ...common
}: Row) => ({
  ...common,
  retry: retryOf === null || retriedBy === null ? null : { of: retryOf, by: retriedBy },
  selection:
    harnessConnectionId === null || modelConnectionId === null || modelId === null
      ? null
      : {
          harness: { connectionId: harnessConnectionId },
          model: {
            connectionId: modelConnectionId,
            id: modelId,
            ...(modelEffort === null ? {} : { effort: modelEffort })
          },
          sandbox: sandboxConnectionId === null ? null : { connectionId: sandboxConnectionId }
        }
})
const decode = (rows: ReadonlyArray<Row>) =>
  decodeRows(rows.map(toRecord)).pipe(
    Effect.flatMap((records) => Effect.forEach(records, (record) => validateRecord(record)))
  )
const instant = (value: DateTime.Utc | null) => (value === null ? null : DateTime.toDate(value))
const toRow = ({ selection, retry, ...record }: Turn.Turn): typeof turns.$inferInsert => ({
  workspaceId: record.workspaceId,
  id: record.id,
  groupId: record.groupId,
  threadId: record.threadId,
  agentId: record.agentId,
  memberId: record.memberId,
  participationId: record.participationId,
  retryOf: retry?.of ?? null,
  retriedBy: retry?.by ?? null,
  status: record.status,
  acceptedThroughSequence: record.acceptedThroughSequence,
  logAfter: record.logAfter,
  harnessConnectionId: selection?.harness.connectionId ?? null,
  modelConnectionId: selection?.model.connectionId ?? null,
  modelId: selection?.model.id ?? null,
  modelEffort: selection?.model.effort ?? null,
  sandboxConnectionId: selection?.sandbox?.connectionId ?? null,
  messageIds: [...record.messageIds],
  failure: record.failure,
  cancelReason: record.cancelReason,
  createdAt: DateTime.toDate(record.createdAt),
  startedAt: instant(record.startedAt),
  finishedAt: instant(record.finishedAt)
})
const activeStatuses = ["queued", "running", "cancelling"] as const

/**
 * Builds the turn store for the binding's workspace: this module's driver inside
 * `TurnStore.make`, which checks every input first.
 */
export const make = Effect.gen(function* () {
  const { workspaceId, database, guard } = yield* Binding.Binding
  const { db } = database
  const inWorkspace = eq(turns.workspaceId, workspaceId)
  const orderedId = sql`${turns.id} COLLATE "C"`
  const ofAgent = (memberId: MemberId.MemberId, threadId: ThreadId.ThreadId) =>
    and(inWorkspace, eq(turns.memberId, memberId), eq(turns.threadId, threadId))
  const driver: TurnStore.TurnStore["Service"] = {
    get: Effect.fn("TurnRecords.get")(
      function* (id) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(inWorkspace, eq(turns.id, id)))
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("TurnStore", "get"))
    ),
    findActive: Effect.fn("TurnRecords.findActive")(
      function* (memberId, threadId) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(ofAgent(memberId, threadId), inArray(turns.status, [...activeStatuses])))
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("TurnStore", "findActive"))
    ),
    findLatest: Effect.fn("TurnRecords.findLatest")(
      function* (memberId, threadId) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(ofAgent(memberId, threadId))
            .orderBy(desc(turns.createdAt), desc(turns.acceptedThroughSequence), desc(orderedId))
            .limit(1)
        ).pipe(Effect.flatMap(decode), Effect.map(Array.head))
      },
      Effect.mapError(StoreError.failed("TurnStore", "findLatest"))
    ),
    listActive: Effect.fn("TurnRecords.listActive")(
      function* (limit) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(inWorkspace, inArray(turns.status, [...activeStatuses])))
            .orderBy(asc(turns.createdAt), asc(turns.acceptedThroughSequence), asc(orderedId))
            .limit(limit)
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("TurnStore", "listActive"))
    ),
    listActiveByMember: Effect.fn("TurnRecords.listActiveByMember")(
      function* (memberId) {
        return yield* guard(
          db
            .select()
            .from(turns)
            .where(and(inWorkspace, eq(turns.memberId, memberId), inArray(turns.status, [...activeStatuses])))
            .orderBy(asc(turns.createdAt), asc(turns.acceptedThroughSequence), asc(orderedId))
        ).pipe(Effect.flatMap(decode))
      },
      Effect.mapError(StoreError.failed("TurnStore", "listActiveByMember"))
    ),
    insert: Effect.fn("TurnRecords.insert")(function* (record) {
      yield* guard(db.insert(turns).values(toRow(record)), true).pipe(
        Effect.mapError(storeError("TurnStore", "insert"))
      )
    }),
    update: Effect.fn("TurnRecords.update")(function* (record) {
      const updated = yield* guard(
        db
          .update(turns)
          .set(toRow(record))
          .where(and(inWorkspace, eq(turns.id, record.id)))
          .returning({ id: turns.id }),
        true
      ).pipe(Effect.mapError(storeError("TurnStore", "update")))
      if (updated.length === 0) return yield* StoreError.rejected("TurnStore", "update", "Expected a stored turn")
    })
  }
  return TurnStore.make(workspaceId, driver)
})

/**
 * Provides `TurnStore.TurnStore` over the caller's `Binding.Binding`.
 */
export const layer = Layer.effect(TurnStore.TurnStore, make)
