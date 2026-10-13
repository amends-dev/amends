import { Role, RoleFacts } from "@amends-dev/core/authorization"
import { Entry, Journal, Log, Occurrence, Publication, Store } from "@amends-dev/core/journal"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import type * as Fixture from "../Fixture.ts"
import * as Support from "../Support.ts"

const key = Occurrence.Key.make("occurrence/one")
const executionId = Entry.LogId.make("execution")
const options = { idempotencyKey: key }

/** Keyed appends: durable identity, validation, rollback, and concurrent attempts. */
export const idempotency = (fixture: Fixture.Fixture) => {
  const { core, initialized } = Support
  describe.skipIf(!fixture.available)(`${fixture.name}: idempotency`, () => {
    it.effect("one commit keeps every keyed append past the parameters a statement can bind", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* Support.forWorkspace(yield* storage.connect(), Support.workspaceId)
          yield* initialized(bound)
          yield* Effect.gen(function* () {
            const journal = yield* Journal.Journal
            const log = (yield* Log.Log).open({ id: executionId, schema: Schema.String })
            const keyOf = (index: number) => Occurrence.Key.make(`output/${index}`)
            const count = 6_000
            yield* journal.commit(
              Effect.gen(function* () {
                for (let index = 0; index < count; index += 1)
                  yield* log.append(`output ${index}`, { idempotencyKey: keyOf(index) })
              })
            )
            const [batch] = yield* log.read({ limit: 1 })
            expect(batch?.entries).toHaveLength(count)
            expect(yield* log.getAppend(keyOf(count - 1))).toEqual(Option.some([batch?.entries.at(-1)]))
          }).pipe(Effect.provide(core(bound)))
        })
      )
    )

    it.effect("keyed publications and append slices survive reopening with their original identities", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const original = yield* Effect.scoped(
            Effect.gen(function* () {
              const bound = yield* Support.forWorkspace(yield* storage.connect(), Support.workspaceId)
              yield* initialized(bound)
              return yield* Effect.gen(function* () {
                const journal = yield* Journal.Journal
                const payload = {
                  workspaceId: Support.workspaceId,
                  roleId: Role.Id.make("keyed-role"),
                  name: "Keyed",
                  permissions: []
                }
                const first = yield* journal.publish(RoleFacts.Created, payload)
                expect(
                  yield* journal.publish(RoleFacts.Created, payload, {
                    expectedAfter: Option.none()
                  })
                ).toEqual(first)
                expect(yield* bound.roles.get(payload.roleId)).toMatchObject({
                  _tag: "Some",
                  value: { id: payload.roleId, name: "Keyed" }
                })
                const log = (yield* Log.Log).open({
                  id: executionId,
                  schema: Schema.String
                })
                const batch = yield* journal.commit(
                  Effect.gen(function* () {
                    yield* log.append("before")
                    const entries = yield* log.appendAll(["one", "two"], options)
                    yield* log.append("after")
                    expect(yield* log.appendAll(["one", "two"], options)).toEqual(entries)
                    return entries
                  })
                )
                expect(batch.map((entry) => entry.index)).toEqual([1, 2])
                return { first, batch, payload }
              }).pipe(
                Effect.provideService(Publication.Publication, Support.testProvenance(Support.workspaceId)),
                Effect.provide(core(bound))
              )
            })
          )
          const host = yield* storage.connect()
          const bound = yield* Support.forWorkspace(host, Support.workspaceId)
          yield* Effect.gen(function* () {
            const journal = yield* Journal.Journal
            expect(yield* journal.publish(RoleFacts.Created, original.payload)).toEqual(original.first)
            const log = (yield* Log.Log).open({ id: executionId, schema: Schema.String })
            expect(yield* log.getAppend(key)).toEqual(Option.some(original.batch))
            expect(yield* log.appendAll(["one", "two"], { ...options, expectedAfter: Option.none() })).toEqual(
              original.batch
            )
            expect((yield* log.read({ limit: 10 })).flatMap((batch) => batch.entries)).toHaveLength(4)
            for (const payloads of [["one"], ["two", "one"], ["changed", "two"]])
              expect(yield* Effect.flip(log.appendAll(payloads, options))).toMatchObject({
                _tag: "StoreError",
                reason: { _tag: "Rejected" }
              })
            expect(
              yield* Effect.flip(journal.publish(RoleFacts.Created, { ...original.payload, name: "Changed" }))
            ).toMatchObject({ _tag: "StoreError", reason: { _tag: "Rejected" } })
          }).pipe(
            Effect.provideService(Publication.Publication, Support.testProvenance(Support.workspaceId)),
            Effect.provide(core(bound))
          )
          const other = yield* Support.forWorkspace(host, Support.otherWorkspaceId)
          yield* Effect.gen(function* () {
            const log = (yield* Log.Log).open({ id: executionId, schema: Schema.String })
            expect(yield* log.getAppend(key)).toEqual(Option.none())
            yield* log.append("other workspace", options)
          }).pipe(Effect.provide(core(other)))
        })
      )
    )

    it.effect(
      "native keyed append validates content, rolls its receipt back, and preserves returned byte ownership",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* Support.forWorkspace(yield* storage.connect(), Support.workspaceId)
            const append = (payloads: ReadonlyArray<Uint8Array>, idempotencyKey = key) =>
              Effect.flatMap(Store.Transaction, (storeTransaction) =>
                storeTransaction.append({
                  logId: executionId,
                  entries: payloads.map((payload) => ({ payload })),
                  idempotencyKey
                })
              )
            const input = [new Uint8Array([1, 2]), new Uint8Array([3])]
            const failed = yield* Effect.flip(
              bound.store.transaction(
                Effect.gen(function* () {
                  yield* append(input)
                  expect(Option.isSome(yield* bound.store.getAppend(executionId, key))).toBe(true)
                  return yield* Effect.fail("rollback")
                })
              )
            )
            expect(failed).toBe("rollback")
            expect(yield* bound.store.getAppend(executionId, key)).toEqual(Option.none())
            const first = yield* bound.store.transaction(append(input))
            const replay = yield* bound.store.transaction(append(input))
            expect(replay).toEqual(first)
            if (replay[0] === undefined) return yield* Effect.die("Missing append")
            replay[0].payload[0] = 99
            const receipt = yield* bound.store.getAppend(executionId, key)
            expect(Option.isSome(receipt) && receipt.value.entries[0].payload[0]).toBe(1)
            for (const payloads of [[new Uint8Array([1, 2])], [new Uint8Array([3]), new Uint8Array([1, 2])]])
              expect(yield* Effect.flip(bound.store.transaction(append(payloads)))).toMatchObject({
                _tag: "StoreError",
                reason: { _tag: "Rejected" }
              })
            expect(yield* Effect.flip(bound.store.transaction(append([], Occurrence.Key.make("empty"))))).toMatchObject(
              { _tag: "StoreError", reason: { _tag: "Rejected" } }
            )
            const invalid: Store.AppendInput = {
              logId: executionId,
              entries: input.map((payload) => ({ payload })),
              idempotencyKey: Occurrence.Key.make("valid")
            }
            Reflect.set(invalid, "idempotencyKey", " ")
            expect(
              yield* Effect.flip(
                bound.store.transaction(
                  Effect.flatMap(Store.Transaction, (storeTransaction) => storeTransaction.append(invalid))
                )
              )
            ).toMatchObject({ _tag: "StoreError", reason: { _tag: "Rejected" } })
          })
        )
    )

    it.effect("independent hosts converge concurrent keyed attempts on one durable append", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const a = yield* Support.forWorkspace(yield* storage.connect(), Support.workspaceId)
          const b = yield* Support.forWorkspace(yield* storage.connect(), Support.workspaceId)
          const append = Effect.flatMap(Store.Transaction, (storeTransaction) =>
            storeTransaction.append({
              logId: executionId,
              entries: [{ payload: new Uint8Array([7]) }],
              idempotencyKey: key
            })
          )
          const attempts = yield* Effect.all(
            [a.store.transaction(append).pipe(Effect.result), b.store.transaction(append).pipe(Effect.result)],
            { concurrency: "unbounded" }
          )
          const successes = attempts.filter((result) => Result.isSuccess(result))
          expect(successes.length).toBeGreaterThan(0)
          for (const result of attempts)
            if (Result.isFailure(result))
              expect(result.failure).toMatchObject({
                _tag: "StoreError",
                reason: { _tag: "Rejected" }
              })
          const first = yield* a.store.transaction(append)
          const second = yield* b.store.transaction(append)
          expect(second).toEqual(first)
          expect((yield* a.store.read(executionId, { limit: 10 })).flatMap((batch) => batch.entries)).toHaveLength(1)
        })
      )
    )
  })
}
