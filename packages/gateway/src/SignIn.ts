/**
 * How a host signs people in: the ways it offers, and the email-code flow that ends in a session.
 * server-http's session routes call it, and `SessionTokens` resolves the token a session carries
 * on every later request. `EmailSignIn` implements both; the local host's development sign-in
 * implements this one for tests and scripts. The HTTP contract imports its schemas from
 * `@amends-dev/gateway/SignIn`.
 *
 * @since 0.1.0
 */
import { Context, Schema } from "effect";
import type { Effect } from "effect";
import * as Accounts from "./Accounts.ts";

/**
 * A one-time sign-in code as a person enters it: six digits, leading zeros included.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Code = Schema.String.check(Schema.isPattern(/^\d{6}$/, { title: "six-digit code" }));
/**
 * @category schemas
 * @since 0.1.0
 */
export type Code = typeof Code.Type;

/**
 * A credential the host accepts, and the account it signs in as.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Session = Schema.Struct({
  token: Schema.NonEmptyString,
  account: Accounts.Account,
}).annotate({ identifier: "SignInSession" });
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Session extends Schema.Schema.Type<typeof Session> {}

/**
 * An identity provider a person can sign in with, such as Google: its ID and the name shown.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Provider = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
}).annotate({ identifier: "SignInProvider" });
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Provider extends Schema.Schema.Type<typeof Provider> {}

/**
 * The ways a host lets people sign in: a code emailed to them, and identity providers.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Methods = Schema.Struct({
  emailCode: Schema.Boolean,
  providers: Schema.Array(Provider),
}).annotate({ identifier: "SignInMethods" });
/**
 * @category schemas
 * @since 0.1.0
 */
export interface Methods extends Schema.Schema.Type<typeof Methods> {}

/**
 * The code signs in to nothing: no code is pending for the address (`unknown`), it is not the one
 * sent (`mismatch`), or it has expired or was voided by wrong tries (`expired`).
 *
 * @category errors
 * @since 0.1.0
 */
export class Rejected extends Schema.TaggedError<Rejected>()("SignIn.Rejected", {
  reason: Schema.Literals(["unknown", "mismatch", "expired"]),
}) {}

/**
 * Too many codes were asked for lately, for the address or from the client; try again later.
 *
 * @category errors
 * @since 0.1.0
 */
export class Limited extends Schema.TaggedError<Limited>()("SignIn.Limited", {}) {}

/**
 * The host could not send the code now; asking again may work.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()("SignIn.Unavailable", {}) {}

/**
 * The ingress that produces authenticated humans; hosts own delivery and token issuance.
 *
 * @category services
 * @since 0.1.0
 */
export class SignIn extends Context.Service<
  SignIn,
  {
    /** The ways this host signs people in, which a sign-in page offers. */
    readonly methods: Methods;
    /**
     * Send a one-time code to the address, for a client at `remoteAddress`, the network address
     * the request came from when the host knows it. Unknown addresses are accepted: completing
     * sign-in finds or creates the address's account.
     */
    readonly start: (
      email: Accounts.Email,
      remoteAddress: string | undefined,
    ) => Effect.Effect<void, Limited | Unavailable>;
    /** Exchange a delivered code for a session as the address's account. A code works once. */
    readonly complete: (email: Accounts.Email, code: Code) => Effect.Effect<Session, Rejected>;
  }
>()("@amends-dev/gateway/sign-in/Service") {}
