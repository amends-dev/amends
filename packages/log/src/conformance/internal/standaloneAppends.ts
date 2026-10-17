import { describe, expect, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Entry from "../../Entry.ts"
import * as Store from "../../Store.ts"
import type * as Fixture from "../Fixture.ts"

const execution = Entry.LogId.make("execution")
const byValue = (left: number | undefined, right: number | undefined) => (left ?? 0) - (right ?? 0)
const entry = (byte: number): Store.Content => ({ payload: new Uint8Array([byte]) })
const alone = (store: Store.Store["Service"], byte: number, options: Store.AppendOptions = {}) =>
  store.append(Object.assign({ logId: execution, entries: [entry(byte)] }, options))

/**
 * Hold a transaction open on the store until released, after it appends to the given logs; the
 * fiber ends with its commit or rollback.
 */
const holding = (store: Store.Store["Service"], logs: ReadonlyArray<Entry.LogId>, outcome: "commit" | "rollback") =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const fiber = yield* store
      .transaction(
        Effect.gen(function* () {
          const storeTransaction = yield* Store.Transaction
          for (const logId of logs) yield* storeTransaction.append({ logId, entries: [entry(0)] })
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(release)
          if (outcome === "rollback") return yield* Effect.fail("rolled back" as const)
        })
      )
      .pipe(Effect.exit, Effect.forkChild)
    yield* Deferred.await(entered)
    return { release: Deferred.succeed(release, undefined), done: Fiber.join(fiber) }
  })

/** Appends outside any transaction, which wait only for their log's other writers. */
export const standaloneAppends = (fixture: Fixture.Fixture) => {
  describe.skipIf(!fixture.available)(`${fixture.name}: standalone appends`, () => {
    it.effect("a standalone append commits while another host's transaction holds the store", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const writer = yield* storage.connect()
          const other = yield* storage.connect({ failFast: true })
          const held = yield* holding(writer, [Entry.LogId.make("background")], "commit")
          const [appended] = yield* alone(other, 1)
          expect(appended).toMatchObject({ logId: execution, position: 0, index: 0 })
          // The store itself is still busy for a transaction.
          expect(yield* Effect.flip(other.transaction(Effect.void))).toMatchObject({
            _tag: "StoreError",
            store: "Store",
            reason: { _tag: "Contended" }
          })
          yield* held.release
          expect((yield* held.done)._tag).toBe("Success")
          const [batch] = yield* writer.read(execution, { limit: 10 })
          expect(batch?.entries).toEqual([appended])
          expect(batch?.commit).toMatchObject({ id: appended?.commitId, entryCount: 1 })
        })
      )
    )

    it.effect("standalone appends from several hosts take consecutive positions, and none is lost", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const hosts = yield* Effect.forEach([1, 2, 3], () => storage.connect())
          const bytes = hosts.flatMap((_, host) => [0, 1, 2, 3, 4].map((n) => host * 10 + n))
          yield* Effect.forEach(
            bytes,
            (byte) => {
              const store = hosts[Math.floor(byte / 10)]
              return store === undefined ? Effect.die("Missing host") : alone(store, byte)
            },
            { concurrency: "unbounded" }
          )
          const [first] = hosts
          if (first === undefined) return yield* Effect.die("Missing host")
          const batches = yield* first.read(execution, { limit: 100 })
          expect(batches.map((batch) => batch.position)).toEqual(bytes.map((_, index) => index))
          expect(new Set(batches.map((batch) => batch.commit.id)).size).toBe(bytes.length)
          expect(batches.flatMap((batch) => batch.entries.map((e) => e.payload[0])).toSorted(byValue)).toEqual(
            bytes.toSorted(byValue)
          )
        })
      )
    )

    it.live("a transaction holding a log keeps its standalone appends waiting, and only those", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const writer = yield* storage.connect()
          const other = yield* storage.connect()
          for (const outcome of ["commit", "rollback"] as const) {
            const before = yield* writer.head(execution)
            const next = Option.match(before, { onNone: () => 0, onSome: (p) => p + 1 })
            const held = yield* holding(writer, [execution], outcome)
            const waiting = yield* Effect.forkChild(alone(other, 9))
            // Another log is not held, so its append goes ahead meanwhile.
            yield* other.append({
              logId: Entry.LogId.make("unrelated"),
              entries: [entry(1)]
            })
            yield* Effect.sleep("200 millis")
            expect(waiting.pollUnsafe()).toBeUndefined()
            yield* held.release
            yield* held.done
            const [appended] = yield* Fiber.join(waiting)
            // It follows the transaction's batch when that commits, or takes its place.
            expect(appended?.position).toBe(outcome === "commit" ? next + 1 : next)
          }
          const positions = (yield* writer.read(execution, { limit: 10 })).map((batch) => batch.position)
          expect(positions).toEqual([0, 1, 2])
        })
      )
    )

    it.live("a key a transaction looked up stays free until it commits, then answers the retry", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const writer = yield* storage.connect()
          const other = yield* storage.connect()
          const key = Store.IdempotencyKey.make("output")
          const looked = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const transaction = yield* writer
            .transaction(
              Effect.gen(function* () {
                expect(yield* writer.getAppend(execution, key)).toEqual(Option.none())
                yield* Deferred.succeed(looked, undefined)
                yield* Deferred.await(release)
                const storeTransaction = yield* Store.Transaction
                return yield* storeTransaction.append({
                  logId: execution,
                  entries: [entry(1)],
                  idempotencyKey: key
                })
              })
            )
            .pipe(Effect.forkChild)
          yield* Deferred.await(looked)
          // The same append from another host waits for the transaction that looked the key up.
          const retry = yield* Effect.forkChild(alone(other, 1, { idempotencyKey: key }))
          yield* Effect.sleep("200 millis")
          expect(retry.pollUnsafe()).toBeUndefined()
          yield* Deferred.succeed(release, undefined)
          const written = yield* Fiber.join(transaction)
          expect(yield* Fiber.join(retry)).toEqual(written)
          expect((yield* writer.read(execution, { limit: 10 })).length).toBe(1)
        })
      )
    )

    it.effect("keys and expected positions hold across standalone and transaction appends", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const writer = yield* storage.connect()
          const other = yield* storage.connect()
          const key = Store.IdempotencyKey.make("output-1")
          const original = yield* alone(other, 1, { idempotencyKey: key })
          expect(yield* alone(writer, 1, { idempotencyKey: key })).toEqual(original)
          expect(yield* Effect.flip(alone(writer, 2, { idempotencyKey: key }))).toMatchObject({
            _tag: "StoreError",
            store: "Store",
            reason: { _tag: "Rejected" }
          })
          expect(yield* Effect.flip(alone(writer, 2, { expectedAfter: Option.none() }))).toMatchObject({
            _tag: "StoreError",
            store: "Store",
            reason: { _tag: "Contended" }
          })
          // A transaction already open when another host appends still sees that append.
          const entered = yield* Deferred.make<void>()
          const appended = yield* Deferred.make<void>()
          const transaction = yield* writer
            .transaction(
              Effect.gen(function* () {
                yield* Deferred.succeed(entered, undefined)
                yield* Deferred.await(appended)
                const storeTransaction = yield* Store.Transaction
                const retried = yield* storeTransaction.append({
                  logId: execution,
                  entries: [entry(3)],
                  idempotencyKey: Store.IdempotencyKey.make("output-2")
                })
                const next = yield* storeTransaction.append({
                  logId: execution,
                  entries: [entry(4)],
                  expectedAfter: Option.some(Entry.Position.make(1))
                })
                return [retried, next] as const
              })
            )
            .pipe(Effect.forkChild)
          yield* Deferred.await(entered)
          const [second] = yield* alone(other, 3, {
            idempotencyKey: Store.IdempotencyKey.make("output-2"),
            expectedAfter: Option.some(Entry.Position.make(0))
          })
          yield* Deferred.succeed(appended, undefined)
          const [retried, next] = yield* Fiber.join(transaction)
          expect(retried).toEqual([second])
          expect(next[0]?.position).toBe(2)
          expect(
            yield* Effect.flip(
              writer.transaction(Effect.suspend(() => writer.append({ logId: execution, entries: [] })))
            )
          ).toMatchObject({ _tag: "StoreError", store: "Store", reason: { _tag: "Failed" } })
          expect((yield* writer.read(execution, { limit: 10 })).length).toBe(3)
        })
      )
    )
  })
}
