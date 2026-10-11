import { Context, Schema } from "effect";
import type { Effect } from "effect";
import { Accounts } from "./accounts.ts";

export const Code = Schema.String.check(Schema.isPattern(/^\d{6}$/, { title: "six-digit code" }));
export type Code = typeof Code.Type;

/** A credential the host accepts, and the account it signs in as. */
export const Session = Schema.Struct({
  token: Schema.NonEmptyString,
  account: Accounts.Account,
}).annotate({ identifier: "SignInSession" });
export interface Session extends Schema.Schema.Type<typeof Session> {}

/** An identity provider a person can sign in with, such as Google: its ID and the name shown. */
export const Provider = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
}).annotate({ identifier: "SignInProvider" });
export interface Provider extends Schema.Schema.Type<typeof Provider> {}

/** The ways a host lets people sign in: a code emailed to them, and identity providers. */
export const Methods = Schema.Struct({
  emailCode: Schema.Boolean,
  providers: Schema.Array(Provider),
}).annotate({ identifier: "SignInMethods" });
export interface Methods extends Schema.Schema.Type<typeof Methods> {}

export class Rejected extends Schema.TaggedError<Rejected>()("SignIn.Rejected", {
  reason: Schema.Literals(["unknown", "mismatch", "expired"]),
}) {}

export interface Interface {
  /** The ways this host signs people in, which a sign-in page offers. */
  readonly methods: Methods;
  /**
   * Send a one-time code to the address. Unknown addresses are accepted: completing
   * sign-in finds or creates the address's account.
   */
  readonly start: (email: Accounts.Email) => Effect.Effect<void>;
  /** Exchange a delivered code for a session as the address's account. A code works once. */
  readonly complete: (email: Accounts.Email, code: Code) => Effect.Effect<Session, Rejected>;
}

/** The ingress that produces authenticated humans; hosts own delivery and token issuance. */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/gateway/sign-in/Service",
) {}

export * as SignIn from "./sign-in.ts";
