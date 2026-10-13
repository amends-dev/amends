import { Entry, Store } from "@amends-dev/core/journal"
import { WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Clock, Context, DateTime, Deferred, Duration, Effect, Exit, Fiber, Layer, Option } from "effect"
import { SqlClient, SqlError } from "effect/sql"
import * as Binding from "../src/Binding.ts"
import { PostgresDatabase, PostgresWorkspaceStorage } from "../src/index.ts"
import type { Bound } from "./support.ts"
import { database, initialized, inDatabase, setup, views, workspaceId } from "./support.ts"

const { available, withDatabase } = setup()
const execution = Entry.LogId.make("execution")
const first = WorkspaceId.WorkspaceId.make("workspace-first")
const second = WorkspaceId.WorkspaceId.make("workspace-second")

/** One process: a pool of `size` connections, and views of workspaces over it. */
const process = Effect.fnUntraced(function* (
  url: string,
  size: number,
  options: PostgresWorkspaceStorage.Options = {}
) {
  const pool = yield* Layer.build(database(url, size))
  const storage = yield* views(options).pipe(Effect.provide(pool))
  return { pool, forWorkspace: storage.forWorkspace }
})

/** Append one entry to the workspace's execution log, then run `then` before committing. */
const append = <E>(bound: Bound, then: Effect.Effect<void, E> = Effect.void) =>
  bound.store.transaction(
    Effect.flatMap(Store.Transaction, (storeTransaction) =>
      storeTransaction.append({ logId: execution, entries: [{ payload: new Uint8Array([1]) }] })
    ).pipe(Effect.andThen(then))
  )

/** A writer holding the workspace until released, once it has its lock. */
const holding = Effect.fnUntraced(function* (bound: Bound) {
  const held = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const fiber = yield* Effect.forkChild(
    append(bound, Deferred.succeed(held, undefined).pipe(Effect.andThen(Deferred.await(release))))
  )
  yield* Deferred.await(held)
  return { fiber, release: Deferred.succeed(release, undefined) }
})

describe.skipIf(!available)("PostgreSQL", () => {
  it.live("writers queued for one workspace leave the pool's connections to other workspaces", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const host = yield* process(url, 2)
        const busy = yield* host.forWorkspace(first)
        const other = yield* host.forWorkspace(second)
        const holder = yield* holding(busy)
        // They wait for their turn in memory, not each on a connection of their own.
        const queued = yield* Effect.forkChild(
          Effect.all(
            Array.from({ length: 10 }, () => append(busy)),
            { concurrency: "unbounded" }
          )
        )
        yield* Effect.sleep("100 millis")
        yield* append(other).pipe(Effect.timeout("2 seconds"))
        yield* holder.release
        yield* Fiber.join(holder.fiber)
        expect(yield* Fiber.join(queued)).toHaveLength(10)
      }).pipe(Effect.scoped)
    )
  )

  it.live("a writer that waits past the lock timeout reports contention, in this process or for a connection", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const host = yield* process(url, 1, { lockTimeout: "200 millis" })
        const busy = yield* host.forWorkspace(first)
        const holder = yield* holding(busy)
        expect(yield* Effect.flip(append(busy))).toMatchObject({
          _tag: "StoreError",
          store: "Store",
          reason: {
            _tag: "Contended",
            description: expect.stringContaining("this process's other writers to the workspace")
          }
        })
        // The holder has the pool's one connection, so another workspace finds none free.
        expect(yield* Effect.flip(append(yield* host.forWorkspace(second)))).toMatchObject({
          _tag: "StoreError",
          store: "Store",
          reason: {
            _tag: "Contended",
            description: expect.stringContaining("a database connection")
          }
        })
        yield* holder.release
        yield* Fiber.join(holder.fiber)
        yield* append(busy)
      }).pipe(Effect.scoped)
    )
  )

  it.live("a program that runs past the transaction timeout rolls back and frees the workspace", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const host = yield* process(url, 2, { transactionTimeout: "200 millis" })
        const bound = yield* host.forWorkspace(first)
        const failure = yield* Effect.flip(append(bound, Effect.sleep("2 seconds")))
        expect(failure).toMatchObject({
          _tag: "StoreError",
          store: "Store",
          reason: { _tag: "Failed", cause: expect.stringContaining("ran longer than") }
        })
        expect(yield* bound.store.head(execution)).toEqual(Option.none())
        yield* append(bound)
        expect(Option.isSome(yield* bound.store.head(execution))).toBe(true)
      }).pipe(Effect.scoped)
    )
  )

  // The test clock never advances, so the stalled writer's own deadline never ends it: only
  // PostgreSQL's idle timeout can, as for a process that stopped responding.
  it.effect("a stalled process's session ends, releasing the workspace to other processes", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const stalled = yield* process(url, 2, { transactionTimeout: "300 millis" })
        yield* holding(yield* stalled.forWorkspace(first))
        const other = yield* process(url, 2)
        yield* append(yield* other.forWorkspace(first))
      }).pipe(Effect.scoped)
    )
  )

  it.effect("timeouts apply to the transaction's session only while it runs", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const host = yield* process(url, 1)
        const bound = yield* host.forWorkspace(first)
        const settings = Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql<{ readonly statement: string; readonly idle: string }>`
            SELECT current_setting('statement_timeout') AS statement,
              current_setting('idle_in_transaction_session_timeout') AS idle`
        ).pipe(Effect.provide(host.pool), Effect.orDie)
        expect(yield* bound.store.transaction(settings)).toEqual([{ statement: "10s", idle: "1min" }])
        expect(yield* settings).toEqual([{ statement: "0", idle: "0" }])
      }).pipe(Effect.scoped)
    )
  )

  it.live("a writer that waited records when it wrote, not when it began waiting", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const host = yield* process(url, 2)
        const bound = yield* host.forWorkspace(first)
        const holder = yield* holding(bound)
        const waiting = yield* Effect.forkChild(append(bound))
        yield* Effect.sleep("300 millis")
        yield* holder.release
        yield* Fiber.join(holder.fiber)
        yield* Fiber.join(waiting)
        const [earlier, later] = yield* bound.store.read(execution, { limit: 2 })
        if (earlier === undefined || later === undefined) return expect.fail("Expected two commits")
        const waited = DateTime.distance(earlier.commit.recordedAt, later.commit.recordedAt)
        expect(Duration.toMillis(waited)).toBeGreaterThanOrEqual(250)
      }).pipe(Effect.scoped)
    )
  )

  it.live("one workspace's reads use at most their share of the pool, leaving the rest to others", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const pool = yield* Layer.build(database(url))
        const { sql } = Context.get(pool, PostgresDatabase.PostgresDatabase)
        const binding = (id: WorkspaceId.WorkspaceId) =>
          Binding.make(id, { readConnections: 2 }).pipe(Effect.provide(pool))
        const busy = yield* binding(first)
        const other = yield* binding(second)
        const sleeping = yield* Effect.forkChild(
          Effect.all(
            Array.from({ length: 6 }, () => busy.guard(sql`SELECT pg_sleep(0.5)`)),
            { concurrency: "unbounded" }
          )
        )
        yield* Effect.sleep("150 millis")
        const asked = yield* Clock.currentTimeMillis
        const [running] = yield* other.guard(
          sql<{ readonly count: number }>`
            SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE state = 'active' AND query LIKE 'SELECT pg_sleep%'`
        )
        // The busy workspace holds two connections, so the other found one free at once, long
        // before any of the busy workspace's reads ended.
        expect((yield* Clock.currentTimeMillis) - asked).toBeLessThan(250)
        expect(running?.count).toBe(2)
        yield* Fiber.join(sleeping)
      }).pipe(Effect.scoped)
    )
  )

  it.effect("durations PostgreSQL would read as no limit stop the storage from starting", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          for (const [options, expected] of [
            [{ lockTimeout: 0 }, "lockTimeout must be a finite duration"],
            [{ transactionTimeout: "Infinity" }, "transactionTimeout must be a finite duration"],
            [
              { lockTimeout: "2 seconds", statementTimeout: "1 second" },
              "statementTimeout must be at least lockTimeout"
            ]
          ] as const) {
            const exit = yield* Effect.exit(PostgresWorkspaceStorage.make(options))
            if (Exit.isSuccess(exit)) return expect.fail("Expected the storage not to start")
            expect(Cause.hasDies(exit.cause)).toBe(true)
            expect(String(Cause.squash(exit.cause))).toContain(expected)
          }
        })
      )
    )
  )

  it.effect("commit failure reports an uncertain outcome with its commit ID and never retries the operation", () =>
    withDatabase((url) =>
      inDatabase(
        url,
        Effect.gen(function* () {
          const real = yield* PostgresDatabase.PostgresDatabase
          let commits = 0
          const failing = new Proxy(real.sql, {
            get(target, key, receiver) {
              if (key === "reserve")
                return Effect.map(
                  real.sql.reserve,
                  (connection) =>
                    new Proxy(connection, {
                      get(inner, method, innerReceiver) {
                        if (method === "executeRaw")
                          return (statement: string, params: ReadonlyArray<unknown>) =>
                            statement === "COMMIT" && commits++ === 0
                              ? Effect.fail(
                                  new SqlError.SqlError({
                                    reason: new SqlError.ConnectionError({
                                      cause: "test failure",
                                      message: "lost commit response"
                                    })
                                  })
                                )
                              : connection.executeRaw(statement, params)
                        return Reflect.get(inner, method, innerReceiver)
                      }
                    })
                )
              return Reflect.get(target, key, receiver)
            }
          })
          const storage = yield* views().pipe(
            Effect.provideService(PostgresDatabase.PostgresDatabase, {
              db: real.db,
              sql: failing,
              notices: real.notices,
              turns: real.turns,
              reads: real.reads
            })
          )
          const bound = yield* storage.forWorkspace(workspaceId)
          const failure = yield* Effect.flip(initialized(bound))
          expect(failure).toMatchObject({
            _tag: "Store.CommitUncertain",
            commitId: expect.any(String)
          })
          expect(commits).toBe(1)
          expect(yield* bound.workspace.get).toEqual(Option.none())
          yield* initialized(bound)
        })
      )
    )
  )
})
