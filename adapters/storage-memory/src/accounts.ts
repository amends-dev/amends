import { Identity } from "@amends-dev/core/identity";
import { Accounts } from "@amends-dev/gateway";
import { Crypto, Effect, Layer } from "effect";
import { MemoryConnection } from "./connection.ts";

/**
 * The host's accounts, beside every workspace's state: each one's address by its human ID.
 *
 * @category constructors
 */
export const make = Effect.fn("MemoryAccounts.make")(function* () {
  const { database } = yield* MemoryConnection.Service;
  const crypto = yield* Crypto.Crypto;
  const accountOf = (id: string, email: string): Accounts.Account => ({
    id: Identity.HumanId.make(id),
    email: Accounts.Email.make(email),
  });
  return Accounts.Service.of({
    findOrCreate: Effect.fn("MemoryAccounts.findOrCreate")(function* (email) {
      const issued = yield* crypto.randomUUIDv4;
      return yield* Effect.sync(() => {
        for (const [id, address] of database.accounts)
          if (address === email) return accountOf(id, address);
        database.accounts.set(issued, email);
        return accountOf(issued, email);
      });
    }, Effect.orDie),
    findByIds: (ids) =>
      Effect.sync(() =>
        ids.flatMap((id) => {
          const email = database.accounts.get(id);
          return email === undefined ? [] : [accountOf(id, email)];
        }),
      ),
  });
});

/**
 * Provide Accounts.Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Accounts.Service, make());

export * as MemoryAccounts from "./accounts.ts";
