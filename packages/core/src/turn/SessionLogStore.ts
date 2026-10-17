/**
 * The storage contract for session logs, which every storage adapter implements and a turn's job
 * writes: one append-only log for each participation in the workspace, whose entries
 * `SessionLog.Entry` describes. Logs take part in no commit, so a host may keep them apart from
 * its other stores, in one built for appending, and nothing here needs a transaction. A log's
 * first entry is at position 1, and each next one follows it.
 *
 * @since 0.1.0
 */

import * as StoreError from "@amends-dev/log/StoreError"
import * as StoreInput from "@amends-dev/log/StoreInput"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as MemoryBinding from "../journal/MemoryBinding.ts"
import * as MemoryDatabase from "../journal/MemoryDatabase.ts"
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts"
import * as SessionLog from "./SessionLog.ts"

/**
 * The log holds an entry past where its writer read it to: someone else wrote there meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Overtaken extends Schema.TaggedError<Overtaken>()("SessionLogStore.Overtaken", {
  participationId: Schema.String,
  after: Schema.Int
}) {}

/**
 * A page of a log: its entries past `after`, at most `limit` of them.
 *
 * @category options
 * @since 0.1.0
 */
export const ReadOptions = Schema.Struct({
  after: Schema.Natural,
  limit: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category options
 * @since 0.1.0
 */
export interface ReadOptions extends Schema.Schema.Type<typeof ReadOptions> {}

/**
 * The session log store, bound to one workspace by the host: what a storage adapter implements
 * for session logs.
 *
 * `make` builds the store over a driver of the same shape. It checks every input against its
 * schema before the driver sees it, so a driver keeps only what storage keeps.
 *
 * @category services
 * @since 0.1.0
 */
export class SessionLogStore extends Context.Service<
  SessionLogStore,
  {
    /** The position of the log's latest entry, or 0 while it has none. */
    readonly head: (
      participationId: ThreadParticipationId.ThreadParticipationId
    ) => Effect.Effect<number, StoreError.StoreError>
    /**
     * Append `entries` in order after the entry at `after`, the log's latest as the writer read it,
     * or 0 for an empty log. A log that holds an entry past `after` takes none of them and fails
     * with Overtaken, so a writer that fell behind, as one another replaced has, cannot write past
     * it.
     */
    readonly append: (
      participationId: ThreadParticipationId.ThreadParticipationId,
      entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>,
      after: number
    ) => Effect.Effect<Array.NonEmptyReadonlyArray<SessionLog.Recorded>, StoreError.StoreError | Overtaken>
    /** The log's entries past `after`, oldest first, at most `limit` of them. */
    readonly read: (
      participationId: ThreadParticipationId.ThreadParticipationId,
      options: ReadOptions
    ) => Effect.Effect<ReadonlyArray<SessionLog.Recorded>, StoreError.StoreError>
    /** Completes once the log holds an entry past `after`. */
    readonly waitForAppend: (
      participationId: ThreadParticipationId.ThreadParticipationId,
      after: number
    ) => Effect.Effect<void, StoreError.StoreError>
  }
>()("@amends-dev/core/turn/SessionLogStore") {}

/**
 * The store over a driver: each input is checked against its schema before the driver sees it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (driver: SessionLogStore["Service"]): SessionLogStore["Service"] => {
  const read = StoreInput.read("SessionLogStore")
  return {
    head: (participationId) =>
      Effect.flatMap(read("head", ThreadParticipationId.ThreadParticipationId, participationId), driver.head),
    append: Effect.fn("SessionLogStore.append")(function* (participationId, entries, after) {
      return yield* driver.append(
        yield* read("append", ThreadParticipationId.ThreadParticipationId, participationId),
        yield* read("append", Schema.NonEmptyArray(SessionLog.Entry), entries),
        yield* read("append", Schema.Natural, after)
      )
    }),
    read: Effect.fn("SessionLogStore.read")(function* (participationId, options) {
      return yield* driver.read(
        yield* read("read", ThreadParticipationId.ThreadParticipationId, participationId),
        yield* read("read", ReadOptions, options)
      )
    }),
    waitForAppend: Effect.fn("SessionLogStore.waitForAppend")(function* (participationId, after) {
      return yield* driver.waitForAppend(
        yield* read("waitForAppend", ThreadParticipationId.ThreadParticipationId, participationId),
        yield* read("waitForAppend", Schema.Natural, after)
      )
    })
  }
}

/** An entry as JSON, where and when its log recorded it. */
const rows = MemoryDatabase.makeRows(Schema.fromJsonString(Schema.toCodecJson(SessionLog.Recorded)))

/**
 * Each participation's session log in memory, beside the workspace's transactional state: an
 * append takes part in no transaction and is kept at once.
 */
const makeMemory = Effect.fn("SessionLogStore.makeMemory")(function* () {
  const { workspaceId, connection } = yield* MemoryBinding.MemoryBinding
  const { database } = connection
  const logKeyOf = (participationId: string) => MemoryDatabase.keyOf(workspaceId, participationId)
  const logOf = (participationId: string) => database.sessionLogs.get(logKeyOf(participationId)) ?? []
  const driver: SessionLogStore["Service"] = {
    head: (participationId) => Effect.sync(() => logOf(participationId).length),
    append: Effect.fn("SessionLogStore.memory.append")(function* (participationId, entries, after) {
      const log = logOf(participationId)
      if (log.length !== after) return yield* new Overtaken({ participationId, after })
      const recordedAt = yield* DateTime.now
      const recorded = Array.map(entries, (entry, index) => ({
        position: after + index + 1,
        recordedAt,
        entry
      }))
      // Overtaken passes as it is; only the encoding fails as the store.
      const encoded = yield* Effect.forEach(recorded, (entry) => rows.encode(entry)).pipe(
        Effect.mapError(StoreError.failed("SessionLogStore", "append"))
      )
      database.sessionLogs.set(logKeyOf(participationId), [...log, ...encoded])
      MemoryDatabase.wakeAppendReaders(database)
      return recorded
    }),
    read: Effect.fn("SessionLogStore.memory.read")(
      function* (participationId, { after, limit }) {
        const page = logOf(participationId).slice(Math.max(after, 0), Math.max(after, 0) + limit)
        return yield* Effect.forEach(page, (row) => rows.decode(row))
      },
      Effect.mapError(StoreError.failed("SessionLogStore", "read"))
    ),
    waitForAppend: Effect.fn("SessionLogStore.memory.waitForAppend")(function* (participationId, after) {
      while (true) {
        // Take the signal before checking the log, so no append falls between the two.
        const appended = database.appended
        if (logOf(participationId).length > after) return
        yield* Deferred.await(appended)
      }
    })
  }
  return make(driver)
})

/**
 * Provide `SessionLogStore` in process memory, over the workspace's `MemoryBinding.MemoryBinding`: each
 * participation's session log, kept in `MemoryDatabase` beside the workspaces' state. An append
 * takes part in no transaction: it is kept at once and wakes waiting readers. It keeps what the
 * contract leaves to storage: an append is rejected unless the log ends where its writer read it
 * to. `make` checks every input first.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(SessionLogStore, makeMemory())
