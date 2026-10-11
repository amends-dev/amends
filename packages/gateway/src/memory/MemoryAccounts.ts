/**
 * The host's accounts in process memory, the reference implementation of `Accounts.Accounts`: a
 * table of addresses by human ID in `MemoryDatabase`, beside every workspace's state, so every
 * host over the same database sees one account per address. New human IDs are random UUIDs from
 * the host's cryptography.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import { MemoryDatabase } from "@amends-dev/core/memory";
import { Crypto, Effect, Layer } from "effect";
import * as Accounts from "../Accounts.ts";

/**
 * The host's accounts, in a table beside every workspace's state: each one's address by its human
 * ID.
 *
 * @category constructors
 * @since 0.1.0
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
 * Provide `Accounts.Accounts` over the `MemoryDatabase` and `Crypto.Crypto` beneath it.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Accounts.Accounts, make());
