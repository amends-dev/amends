/**
 * The bearer authentication every workspace endpoint requires, as middleware the contract declares
 * and both sides implement: a server, as `BearerAuthentication` does, by resolving the credential
 * to an identity, and a client by attaching one. For each request it provides `Principal`, the
 * authenticated human or agent a handler passes into the gateway, and `Credential`, the token
 * presented, for signing out. A request whose credential the host does not accept fails with
 * `Unauthorized`. The contract says nothing about how credentials are issued; `SessionGroup` asks
 * the host's sign-in for one.
 *
 * @since 0.1.0
 */
import type { Identity } from "@amends-dev/core/identity";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type * as Redacted from "effect/Redacted";
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware";
import * as HttpApiSecurity from "effect/http-api/HttpApiSecurity";

/**
 * The authenticated human or agent, supplied by middleware for each request.
 *
 * @category services
 * @since 0.1.0
 */
export class Principal extends Context.Service<Principal, Identity.MemberReference>()(
  "@amends-dev/http/Authentication/Principal",
) {}

/**
 * The credential the request presented, supplied by middleware with the principal, for an
 * endpoint that acts on the credential itself, as signing out does.
 *
 * @category services
 * @since 0.1.0
 */
export class Credential extends Context.Service<Credential, Redacted.Redacted<string>>()(
  "@amends-dev/http/Authentication/Credential",
) {}

/**
 * The request's credential authenticates nobody the host honors: a missing, malformed, unknown,
 * or expired token, or a session no account holds; 401, with why.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Authentication.Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/**
 * Bearer authentication. Hosts implement it by resolving the credential to an
 * identity; clients implement it by attaching the credential. The contract
 * says nothing about how tokens are issued.
 *
 * @category services
 * @since 0.1.0
 */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: Principal | Credential }
>()("@amends-dev/http/Authentication", {
  requiredForClient: true,
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}
