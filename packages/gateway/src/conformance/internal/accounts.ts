import { Identity } from "@amends-dev/core/identity"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Accounts from "../../Accounts.ts"
import type * as Fixture from "../Fixture.ts"
import * as Support from "../Support.ts"

const alice = Accounts.Email.make("alice@example.com")
const bob = Accounts.Email.make("bob@example.com")

const findOrCreate = (email: Accounts.Email) =>
  Effect.flatMap(Accounts.Accounts, (accounts) => accounts.findOrCreate(email))
const findByIds = (ids: ReadonlyArray<Identity.HumanId>) =>
  Effect.flatMap(Accounts.Accounts, (accounts) => accounts.findByIds(ids))

/** The host's accounts: one for each address, whichever host asks, found again by human ID. */
export const accounts = (fixture: Fixture.Fixture) => {
  describe.skipIf(!fixture.available)(`${fixture.name}: accounts`, () => {
    it.effect("an address has one account, which every host finds", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const created = yield* Support.runHost(storage, findOrCreate(alice))
          expect(created.email).toBe(alice)
          expect(created.id).not.toBe(alice)
          expect(yield* Support.runHost(storage, findOrCreate(alice))).toEqual(created)
          const other = yield* Support.runHost(storage, findOrCreate(bob))
          expect(other.id).not.toBe(created.id)
        })
      )
    )

    it.effect("an address typed with capitals or spaces is the same account", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const typed = yield* Schema.decodeEffect(Accounts.Email)(" Alice@Example.COM ")
          expect(typed).toBe(alice)
          const created = yield* Support.runHost(storage, findOrCreate(alice))
          expect(yield* Support.runHost(storage, findOrCreate(typed))).toEqual(created)
        })
      )
    )

    it.effect("hosts asking for a new address at once share one account", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const found = yield* Effect.all(
            Array.from({ length: 4 }, () => Support.runHost(storage, findOrCreate(alice))),
            { concurrency: "unbounded" }
          )
          expect(new Set(found.map((account) => account.id)).size).toBe(1)
        })
      )
    )

    it.effect("finding by IDs leaves out an ID no account has", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const first = yield* Support.runHost(storage, findOrCreate(alice))
          const second = yield* Support.runHost(storage, findOrCreate(bob))
          const unknown = Identity.HumanId.make("unknown")
          const found = yield* Support.runHost(storage, findByIds([second.id, unknown, first.id]))
          expect(found.toSorted((left, right) => left.email.localeCompare(right.email))).toEqual([first, second])
          expect(yield* Support.runHost(storage, findByIds([]))).toEqual([])
        })
      )
    )
  })
}
