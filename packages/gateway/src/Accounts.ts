import { Identity } from "@amends-dev/core/identity";
import { Context, Schema, SchemaGetter } from "effect";
import type { Effect } from "effect";

/**
 * An email address as accounts hold it. Decoding trims and lowercases it, so one address is one
 * account however it was typed.
 */
export const Email = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String.check(
      Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { title: "email address" }),
      Schema.isLowercased(),
    ),
    {
      decode: SchemaGetter.transform((address: string) => address.trim().toLowerCase()),
      encode: SchemaGetter.passthrough(),
    },
  ),
);
export type Email = typeof Email.Type;

/**
 * A person: the human ID that names them in every workspace, and the address they sign in with.
 * The ID is the host's own and says nothing about the person.
 */
export const Account = Schema.Struct({ id: Identity.HumanId, email: Email }).annotate({
  identifier: "Account",
});
export interface Account extends Schema.Schema.Type<typeof Account> {}

/**
 * The people a host knows, across its workspaces. Core names a person by human ID only; the host
 * keeps who that is, and sign-in and invitations reach a person by address through it. Storage
 * failures are defects.
 */
export class Accounts extends Context.Service<
  Accounts,
  {
    /**
     * The account an address belongs to, created with a new human ID the first time the address
     * comes up: when its owner first signs in, or when a workspace first invites it.
     */
    readonly findOrCreate: (email: Email) => Effect.Effect<Account>;
    /** The accounts among `ids`, leaving out an ID no account has. */
    readonly findByIds: (
      ids: ReadonlyArray<Identity.HumanId>,
    ) => Effect.Effect<ReadonlyArray<Account>>;
  }
>()("@amends-dev/gateway/accounts/Service") {}
