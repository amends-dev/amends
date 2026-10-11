import { Identity } from "@amends-dev/core/identity";
import { MemoryDatabase } from "@amends-dev/core/memory";
import { Crypto, Effect, Layer } from "effect";
import * as Accounts from "../accounts.ts";

/**
 * The host's accounts, in a table beside every workspace's state: each one's address by its human
 * ID.
 *
 * @category constructors
 */
export const make = Effect.fn("MemoryAccounts.make")(function* () {
  const accounts = MemoryDatabase.table(yield* MemoryDatabase.MemoryDatabase, "accounts");
  const crypto = yield* Crypto.Crypto;
  const accountOf = (id: string, email: string): Accounts.Account => ({
    id: Identity.HumanId.make(id),
    email: Accounts.Email.make(email),
  });
  return Accounts.Accounts.of({
    findOrCreate: Effect.fn("MemoryAccounts.findOrCreate")(function* (email) {
      const issued = yield* crypto.randomUUIDv4;
      return yield* Effect.sync(() => {
        for (const [id, address] of accounts) if (address === email) return accountOf(id, address);
        accounts.set(issued, email);
        return accountOf(issued, email);
      });
    }, Effect.orDie),
    findByIds: (ids) =>
      Effect.sync(() =>
        ids.flatMap((id) => {
          const email = accounts.get(id);
          return email === undefined ? [] : [accountOf(id, email)];
        }),
      ),
  });
});

/**
 * Provide Accounts.Accounts using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = Layer.effect(Accounts.Accounts, make());
