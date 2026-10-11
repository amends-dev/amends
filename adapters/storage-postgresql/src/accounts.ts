import { Accounts } from "@amends-dev/gateway";
import { inArray } from "drizzle-orm";
import { Crypto, Effect, Layer, Schema } from "effect";
import { PostgresDatabase } from "./database.ts";
import { accounts } from "./schema.ts";

const decodeAccounts = Schema.decodeUnknownEffect(Schema.Array(Accounts.Account));

/**
 * The host's accounts, in one table beside every workspace's. An address's first request inserts
 * its account, and every later one, or a concurrent one, returns the row already there.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresAccounts.make")(function* () {
  const { db } = yield* PostgresDatabase.Service;
  const crypto = yield* Crypto.Crypto;
  const toAccounts = (rows: ReadonlyArray<typeof accounts.$inferSelect>) =>
    decodeAccounts(rows.map((row) => ({ id: row.humanId, email: row.email })));
  return Accounts.Service.of({
    findOrCreate: Effect.fn("PostgresAccounts.findOrCreate")(function* (email) {
      const humanId = yield* crypto.randomUUIDv4;
      // Updating the address to itself on conflict makes the statement return the existing row.
      const [account] = yield* db
        .insert(accounts)
        .values({ humanId, email })
        .onConflictDoUpdate({ target: accounts.email, set: { email } })
        .returning()
        .pipe(Effect.flatMap(toAccounts));
      if (account === undefined) return yield* Effect.die("The account insert returned no row.");
      return account;
    }, Effect.orDie),
    findByIds: Effect.fn("PostgresAccounts.findByIds")(function* (ids) {
      if (ids.length === 0) return [];
      return yield* db
        .select()
        .from(accounts)
        .where(inArray(accounts.humanId, [...ids]))
        .pipe(Effect.flatMap(toAccounts));
    }, Effect.orDie),
  });
});

/**
 * Provide Accounts.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Accounts.Service, make());

export * as PostgresAccounts from "./accounts.ts";
