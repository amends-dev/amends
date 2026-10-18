import { Identity } from "@amends-dev/core/identity"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as SyncStorage from "../../SyncStorage.ts"
import type * as Fixture from "../Fixture.ts"
import * as Support from "../Support.ts"

const alice = Identity.HumanId.make("human-alice")
const bob = Identity.HumanId.make("human-bob")
const publicKey = "0b9f3c1e-6d2a-4f57-9a8e-2c4b6d8f0a13"
const signingKey = (fill: number) => new Uint8Array(32).fill(fill)

/** Use the sync storage of a new host over `storage`. */
const onHost = <A, E>(
  storage: Fixture.Storage,
  use: (syncStorage: SyncStorage.SyncStorage["Service"]) => Effect.Effect<A, E>
) => Support.runHost(storage, Effect.flatMap(SyncStorage.SyncStorage, use))

/** One remote ID for every host, and one person and one signing key for each key. */
export const syncStorage = (fixture: Fixture.Fixture) => {
  describe.skipIf(!fixture.available)(`${fixture.name}: sync storage`, () => {
    it.effect("every host reads the one remote ID the storage was given", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const read = onHost(storage, (syncStorage) => syncStorage.remoteId)
          const [first, ...others] = yield* Effect.all([read, read, read, read], { concurrency: "unbounded" })
          expect(first?.byteLength).toBe(16)
          for (const other of others) expect(other).toEqual(first)
          expect(yield* read).toEqual(first)
        })
      )
    )

    it.effect("a key belongs to the person who registered it, until they remove it", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const personOf = onHost(storage, (syncStorage) => syncStorage.personOf(publicKey))
          expect(yield* personOf).toEqual(Option.none())
          yield* onHost(storage, (syncStorage) => syncStorage.registerKey(publicKey, alice))
          yield* onHost(storage, (syncStorage) => syncStorage.registerKey(publicKey, alice))
          const taken = yield* Effect.flip(onHost(storage, (syncStorage) => syncStorage.registerKey(publicKey, bob)))
          expect(taken).toEqual(new SyncStorage.KeyTaken())
          yield* onHost(storage, (syncStorage) => syncStorage.removeKey(publicKey, bob))
          expect(yield* personOf).toEqual(Option.some(alice))
          yield* onHost(storage, (syncStorage) => syncStorage.removeKey(publicKey, alice))
          expect(yield* personOf).toEqual(Option.none())
          yield* onHost(storage, (syncStorage) => syncStorage.removeKey(publicKey, alice))
        })
      )
    )

    it.effect("hosts registering one key at once for different people leave it with one of them", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const people = [alice, bob, alice, bob]
          const exits = yield* Effect.forEach(
            people,
            (humanId) => Effect.exit(onHost(storage, (syncStorage) => syncStorage.registerKey(publicKey, humanId))),
            { concurrency: "unbounded" }
          )
          const owner = yield* onHost(storage, (syncStorage) => syncStorage.personOf(publicKey))
          expect(Option.isSome(owner)).toBe(true)
          // Exactly the registrations for the owner succeed.
          expect(exits.map(Exit.isSuccess)).toEqual(people.map((humanId) => Option.contains(owner, humanId)))
        })
      )
    )

    it.effect("a key is bound to the first signing key any host binds, until it is removed", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const bind = (fill: number) =>
            onHost(storage, (syncStorage) => syncStorage.bindSigningKey(publicKey, signingKey(fill)))
          expect(yield* bind(1)).toEqual(Option.none())
          yield* onHost(storage, (syncStorage) => syncStorage.registerKey(publicKey, alice))
          const [first, ...others] = yield* Effect.all([bind(2), bind(3), bind(4), bind(5)], {
            concurrency: "unbounded"
          })
          expect(first !== undefined && Option.isSome(first)).toBe(true)
          for (const other of others) expect(other).toEqual(first)
          expect(yield* bind(6)).toEqual(first)
          yield* onHost(storage, (syncStorage) => syncStorage.removeKey(publicKey, alice))
          yield* onHost(storage, (syncStorage) => syncStorage.registerKey(publicKey, bob))
          expect(yield* bind(7)).toEqual(Option.some(signingKey(7)))
        })
      )
    )
  })
}
