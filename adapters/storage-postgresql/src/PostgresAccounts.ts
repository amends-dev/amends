/**
 * The gateway's `Accounts.Accounts` over the `accounts` table, one of the few tables kept across
 * every workspace: a human ID for each lowercase address, which is unique. `PostgresStorage.layer`
 * provides it beside workspace storage. Storage failures are defects, as the contract has them.
 *
 * @since 0.1.0
 */

import { Accounts } from "@amends-dev/gateway"
import { inArray } from "drizzle-orm"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { accounts } from "./internal/schema.ts"
import * as PostgresDatabase from "./PostgresDatabase.ts"

const decodeAccounts = Schema.decodeUnknownEffect(Schema.Array(Accounts.Account))

/**
 * The host's accounts, in one table beside every workspace's. An address's first request inserts
 * its account, and every later one, or a concurrent one, returns the row already there.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const { db } = yield* PostgresDatabase.PostgresDatabase
  const crypto = yield* Crypto.Crypto
  const toAccounts = (rows: ReadonlyArray<typeof accounts.$inferSelect>) =>
    decodeAccounts(rows.map((row) => ({ id: row.humanId, email: row.email })))
  return Accounts.Accounts.of({
    findOrCreate: Effect.fn("PostgresAccounts.findOrCreate")(function* (email) {
      const humanId = yield* crypto.randomUUIDv4()
      // Updating the address to itself on conflict makes the statement return the existing row.
      const [account] = yield* db
        .insert(accounts)
        .values({ humanId, email })
        .onConflictDoUpdate({ target: accounts.email, set: { email } })
        .returning()
        .pipe(Effect.flatMap(toAccounts))
      if (account === undefined) return yield* Effect.die("The account insert returned no row.")
      return account
    }, Effect.orDie),
    findByIds: Effect.fn("PostgresAccounts.findByIds")(function* (ids) {
      if (ids.length === 0) return []
      return yield* db
        .select()
        .from(accounts)
        .where(inArray(accounts.humanId, [...ids]))
        .pipe(Effect.flatMap(toAccounts))
    }, Effect.orDie)
  })
})

/**
 * Provides `Accounts.Accounts` over the caller's `PostgresDatabase.PostgresDatabase`, with the
 * `Crypto.Crypto` that issues human IDs.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Accounts.Accounts, make)
