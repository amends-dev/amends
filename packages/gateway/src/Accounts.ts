/**
 * The people a host knows across its workspaces. Core names a person by human ID alone; the host
 * keeps the address that ID belongs to here, so sign-in and invitations reach a person by address.
 * `EmailSignIn` finds or creates an account when sign-in completes, and the HTTP server reads
 * accounts to resolve invitation addresses and to show a workspace's addresses. Storage adapters
 * implement `Accounts`, `layerMemory` in process memory, and the HTTP contract imports its schemas
 * from `@amends-dev/gateway/Accounts`.
 *
 * @since 0.1.0
 */

import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"

/**
 * An email address as accounts hold it. Decoding trims and lowercases it, so one address is one
 * account however it was typed.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Email = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(
      Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { title: "email address" }),
      Schema.isLowercased()
    ),
    {
      decode: SchemaGetter.transform((address: string) => address.trim().toLowerCase()),
      encode: SchemaGetter.passthrough()
    }
  )
)
/**
 * @category schemas
 * @since 0.1.0
 */
export type Email = typeof Email.Type

/**
 * A person: the human ID that names them in every workspace, and the address they sign in with.
 * The ID is the host's own and says nothing about the person.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Account = Schema.Struct({ id: Identity.HumanId, email: Email }).annotate({
  identifier: "Account"
})
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Account extends Schema.Schema.Type<typeof Account> {}

/**
 * The people a host knows, across its workspaces. Core names a person by human ID only; the host
 * keeps who that is, and sign-in and invitations reach a person by address through it. Storage
 * failures are defects.
 *
 * @category services
 * @since 0.1.0
 */
export class Accounts extends Context.Service<
  Accounts,
  {
    /**
     * The account an address belongs to, created with a new human ID the first time the address
     * comes up: when its owner first signs in, or when a workspace first invites it.
     */
    readonly findOrCreate: (email: Email) => Effect.Effect<Account>
    /** The accounts among `ids`, leaving out an ID no account has. */
    readonly findByIds: (ids: ReadonlyArray<Identity.HumanId>) => Effect.Effect<ReadonlyArray<Account>>
  }
>()("@amends-dev/gateway/Accounts") {}

/** The host's accounts in a table of `MemoryDatabase`: each one's address by its human ID. */
const makeMemory = Effect.fn("Accounts.makeMemory")(function* () {
  const accounts = MemoryDatabase.table(yield* MemoryDatabase.MemoryDatabase, "accounts")
  const crypto = yield* Crypto.Crypto
  const accountOf = (id: string, email: string): Account => ({
    id: Identity.HumanId.make(id),
    email: Email.make(email)
  })
  return Accounts.of({
    findOrCreate: Effect.fn("Accounts.memory.findOrCreate")(function* (email) {
      const issued = yield* crypto.randomUUIDv4
      return yield* Effect.sync(() => {
        for (const [id, address] of accounts) if (address === email) return accountOf(id, address)
        accounts.set(issued, email)
        return accountOf(issued, email)
      })
    }, Effect.orDie),
    findByIds: (ids) =>
      Effect.sync(() =>
        ids.flatMap((id) => {
          const email = accounts.get(id)
          return email === undefined ? [] : [accountOf(id, email)]
        })
      )
  })
})

/**
 * Provide the host's accounts in process memory, over the `MemoryDatabase` and `Crypto.Crypto`
 * beneath: a table of addresses by human ID beside every workspace's state, so every host over the
 * same database sees one account per address. New human IDs are random UUIDs from the host's
 * cryptography.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(Accounts, makeMemory())
