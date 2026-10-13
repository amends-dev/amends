/**
 * The `session` endpoint group: signing in, before the caller holds a credential. Its endpoints
 * call the host's `SignIn` service from the gateway: `methods` lists the ways the host signs people
 * in, `start` asks it to email a one-time code to an address, and `complete` exchanges that code
 * for a `SignIn.Session`, a token and the account it signs in as. Anyone may call them, so the
 * group declares no `Authentication`. `SessionHandlers` implements it.
 *
 * @since 0.1.0
 */

import * as Accounts from "@amends-dev/gateway/Accounts"
import * as SignIn from "@amends-dev/gateway/SignIn"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as Schema from "effect/Schema"

/**
 * Signing in: the ways this host offers, then an email code to request and exchange for a session.
 * No credential is needed yet.
 *
 * @category models
 * @since 0.1.0
 */
export class SessionGroup extends HttpApiGroup.make("session")
  .add(
    HttpApiEndpoint.get("methods", "/methods", { success: SignIn.Methods }),
    HttpApiEndpoint.post("start", "/email", {
      payload: Schema.Struct({ email: Accounts.Email }),
      success: HttpApiSchema.Empty(202),
      error: [SignIn.Limited.pipe(HttpApiSchema.status(429)), SignIn.Unavailable.pipe(HttpApiSchema.status(503))]
    }),
    HttpApiEndpoint.post("complete", "/code", {
      payload: Schema.Struct({ email: Accounts.Email, code: SignIn.Code }),
      success: SignIn.Session,
      error: SignIn.Rejected.pipe(HttpApiSchema.status(403))
    })
  )
  .prefix("/session") {}
