import { describe, expect, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Entry from "../../Entry.ts"
import * as Store from "../../Store.ts"
import type * as Fixture from "../Fixture.ts"

const steps = Entry.LogId.make("steps")
const notes = Entry.LogId.make("notes")
const content = (byte: number, options: { readonly name?: string; readonly subject?: string } = {}): Store.Content =>
  Object.assign({ payload: new Uint8Array([byte]) }, options)
const bytesOf = (batches: ReadonlyArray<Store.Batch>) =>
  batches.map((batch) => batch.entries.map((entry) => entry.payload[0]))

/** What every store promises of its logs: positions, commits, keys, entry reads, and waiting. */
export const logs = (fixture: Fixture.Fixture) => {
  describe.skipIf(!fixture.available)(`${fixture.name}: logs`, () => {
    it.effect("a commit's appends to a log share its next position, and each log has positions of its own", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const store = yield* storage.connect()
          expect(yield* store.head(steps)).toEqual(Option.none())
          expect(yield* store.read(steps, { limit: 10 })).toEqual([])
          const written = yield* store.transaction(
            Effect.gen(function* () {
              const storeTransaction = yield* Store.Transaction
              const first = yield* storeTransaction.append({ logId: steps, entries: [content(1), content(2)] })
              const second = yield* storeTransaction.append({ logId: steps, entries: [content(3)] })
              const other = yield* storeTransaction.append({ logId: notes, entries: [content(9)] })
              return { commitId: storeTransaction.id, entries: [...first, ...second, ...other] }
            })
          )
          expect(written.entries.map(({ logId, position, index }) => [logId, position, index])).toEqual([
            [steps, 0, 0],
            [steps, 0, 1],
            [steps, 0, 2],
            [notes, 0, 0]
          ])
          expect(new Set(written.entries.map((entry) => entry.id)).size).toBe(4)
          yield* store.append({ logId: steps, entries: [content(4)] })

          const batches = yield* store.read(steps, { limit: 10 })
          expect(batches.map((batch) => batch.position)).toEqual([0, 1])
          expect(bytesOf(batches)).toEqual([[1, 2, 3], [4]])
          expect(batches[0]?.commit).toMatchObject({ id: written.commitId, entryCount: 4 })
          expect(yield* store.head(steps)).toEqual(Option.some(1))
          expect(yield* store.head(notes)).toEqual(Option.some(0))
          // A commit's batch in one log, by its ID, and one entry by its own.
          const batch = yield* store.get(steps, written.commitId)
          expect(Option.map(batch, (found) => found.entries)).toEqual(Option.some(written.entries.slice(0, 3)))
          expect(yield* store.get(notes, written.commitId)).toMatchObject(Option.some({ position: 0 }))
          const entry = written.entries[3]
          if (entry === undefined) return yield* Effect.die("Missing entry")
          expect(yield* store.getEntry(notes, entry.id)).toEqual(Option.some(entry))
          expect(yield* store.getEntry(steps, entry.id)).toEqual(Option.none())
        })
      )
    )

    it.effect("reads page complete batches after a position, and a transaction reads its own appends", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const store = yield* storage.connect()
          for (const byte of [1, 2, 3, 4]) yield* store.append({ logId: steps, entries: [content(byte)] })
          expect(bytesOf(yield* store.read(steps, { after: Entry.Position.make(0), limit: 2 }))).toEqual([[2], [3]])
          expect(bytesOf(yield* store.read(steps, { after: Entry.Position.make(3), limit: 2 }))).toEqual([])
          const seen = yield* store.transaction(
            Effect.gen(function* () {
              const storeTransaction = yield* Store.Transaction
              yield* storeTransaction.append({ logId: steps, entries: [content(5), content(6)] })
              return {
                head: yield* store.head(steps),
                last: bytesOf(yield* store.read(steps, { after: Entry.Position.make(3), limit: 10 }))
              }
            })
          )
          expect(seen).toEqual({ head: Option.some(4), last: [[5, 6]] })
        })
      )
    )

    it.effect("a rollback keeps nothing, and work after a commit runs once it commits, in order", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const store = yield* storage.connect()
          const ran: Array<string> = []
          const failed = yield* Effect.flip(
            store.transaction(
              Effect.gen(function* () {
                const storeTransaction = yield* Store.Transaction
                yield* storeTransaction.append({ logId: steps, entries: [content(1)] })
                yield* storeTransaction.afterCommit(Effect.sync(() => ran.push("rolled back")))
                return yield* Effect.fail("rolled back" as const)
              })
            )
          )
          expect(failed).toBe("rolled back")
          expect(yield* store.head(steps)).toEqual(Option.none())
          yield* store.transaction(
            Effect.gen(function* () {
              const storeTransaction = yield* Store.Transaction
              yield* storeTransaction.append({ logId: steps, entries: [content(2)] })
              yield* storeTransaction.afterCommit(Effect.sync(() => ran.push("first")))
              yield* storeTransaction.afterCommit(Effect.sync(() => ran.push("second")))
              expect(ran).toEqual([])
            })
          )
          expect(ran).toEqual(["first", "second"])
          expect(bytesOf(yield* store.read(steps, { limit: 10 }))).toEqual([[2]])
        })
      )
    )

    it.effect(
      "a key answers its retry with the original entries, refuses other content, and expected positions hold",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const store = yield* storage.connect()
            const key = Store.IdempotencyKey.make("step-1")
            expect(yield* store.getAppend(steps, key)).toEqual(Option.none())
            const original = yield* store.append({
              logId: steps,
              entries: [content(1, { name: "step" })],
              idempotencyKey: key
            })
            expect(
              yield* store.append({ logId: steps, entries: [content(1, { name: "step" })], idempotencyKey: key })
            ).toEqual(original)
            expect(yield* store.getAppend(steps, key)).toMatchObject(Option.some({ key, firstIndex: 0, entryCount: 1 }))
            // The same key in another log names another append.
            expect(yield* store.append({ logId: notes, entries: [content(2)], idempotencyKey: key })).toHaveLength(1)
            for (const other of [content(2, { name: "step" }), content(1, { name: "other" }), content(1)])
              expect(
                yield* Effect.flip(store.append({ logId: steps, entries: [other], idempotencyKey: key }))
              ).toMatchObject({ _tag: "StoreError", store: "Store", reason: { _tag: "Rejected" } })
            expect(
              yield* Effect.flip(store.append({ logId: steps, entries: [content(3)], expectedAfter: Option.none() }))
            ).toMatchObject({ _tag: "StoreError", store: "Store", reason: { _tag: "Contended" } })
            const [next] = yield* store.append({
              logId: steps,
              entries: [content(3)],
              expectedAfter: Option.some(Entry.Position.make(0))
            })
            expect(next?.position).toBe(1)
            expect(bytesOf(yield* store.read(steps, { limit: 10 }))).toEqual([[1], [3]])
          })
        )
    )

    it.effect("entries are selected by name or subject, and paged by position and index within a commit", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const store = yield* storage.connect()
          yield* store.append({
            logId: steps,
            entries: [
              content(1, { name: "started", subject: "task:a" }),
              content(2, { name: "noted", subject: "task:b" }),
              content(3, { name: "started", subject: "task:b" })
            ]
          })
          yield* store.append({
            logId: steps,
            entries: [content(4, { name: "started", subject: "task:a" }), content(5)]
          })
          const payloads = (entries: ReadonlyArray<Store.Entry>) => entries.map((entry) => entry.payload[0])
          expect(payloads(yield* store.readEntries(steps, { name: "started", limit: 10 }))).toEqual([1, 3, 4])
          expect(payloads(yield* store.readEntries(steps, { subject: "task:b", limit: 10 }))).toEqual([2, 3])
          expect(payloads(yield* store.readEntries(steps, { name: "started", subject: "task:a", limit: 10 }))).toEqual([
            1, 4
          ])
          // A page can end inside a commit; the next resumes after its last entry.
          const [first] = yield* store.readEntries(steps, { name: "started", limit: 1 })
          if (first === undefined) return yield* Effect.die("Missing entry")
          expect(first).toMatchObject({ name: "started", subject: "task:a", position: 0, index: 0 })
          expect(payloads(yield* store.readEntries(steps, { name: "started", after: first, limit: 10 }))).toEqual([
            3, 4
          ])
          expect(yield* store.readEntries(notes, { name: "started", limit: 10 })).toEqual([])
          expect(yield* Effect.flip(store.readEntries(steps, { limit: 10 }))).toMatchObject({ _tag: "StoreError" })
        })
      )
    )

    it.live("a reader waiting for an append past a position wakes once one commits, on any connection", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const writer = yield* storage.connect()
          const reader = yield* storage.connect()
          yield* writer.append({ logId: steps, entries: [content(1)] })
          // An append past the position is there already.
          yield* reader.waitForAppend(steps, Option.none())
          const waiting = yield* Effect.forkChild(reader.waitForAppend(steps, Option.some(Entry.Position.make(0))))
          // An append to another log does not wake it.
          yield* writer.append({ logId: notes, entries: [content(1)] })
          yield* Effect.sleep("100 millis")
          expect(waiting.pollUnsafe()).toBeUndefined()
          const committed = yield* Deferred.make<void>()
          yield* writer.transaction(
            Effect.gen(function* () {
              const storeTransaction = yield* Store.Transaction
              yield* storeTransaction.append({ logId: steps, entries: [content(2)] })
              yield* storeTransaction.afterCommit(Deferred.succeed(committed, undefined))
            })
          )
          yield* Deferred.await(committed)
          yield* Fiber.join(waiting).pipe(Effect.timeout("10 seconds"))
          expect(yield* Effect.flip(writer.transaction(writer.waitForAppend(steps, Option.none())))).toMatchObject({
            _tag: "StoreError"
          })
        })
      )
    )
  })
}
