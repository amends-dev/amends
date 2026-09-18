import { Identity } from "@amends/core/identity";
import { Context, Schema } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi";

/**
 * The authenticated human or agent, supplied by middleware for each request.
 *
 * @category services
 */
export class Principal extends Context.Service<Principal, Identity.Reference>()(
  "@amends/api-http/authentication/Principal",
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
  { provides: Principal }
>()("@amends/api-http/authentication/Authentication", {
  requiredForClient: true,
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}
