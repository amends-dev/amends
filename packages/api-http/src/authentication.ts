import { Identity } from "@amends-dev/core/identity";
import { Context, Schema } from "effect";
import type { Redacted } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/http-api";

/**
 * The authenticated human or agent, supplied by middleware for each request.
 *
 * @category services
 */
export class Principal extends Context.Service<Principal, Identity.MemberReference>()(
  "@amends-dev/api-http/authentication/Principal",
) {}

/**
 * The credential the request presented, supplied by middleware with the principal, for an
 * endpoint that acts on the credential itself, as signing out does.
 *
 * @category services
 */
export class Credential extends Context.Service<Credential, Redacted.Redacted<string>>()(
  "@amends-dev/api-http/authentication/Credential",
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Api.Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/**
 * Bearer authentication. Hosts implement it by resolving the credential to an
 * identity; clients implement it by attaching the credential. The contract
 * says nothing about how tokens are issued.
 *
 * @category services
 */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: Principal | Credential }
>()("@amends-dev/api-http/authentication/Authentication", {
  requiredForClient: true,
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}
