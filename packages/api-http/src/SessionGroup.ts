import * as Accounts from "@amends-dev/gateway/Accounts";
import * as SignIn from "@amends-dev/gateway/SignIn";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

/**
 * Signing in: the ways this host offers, then an email code to request and exchange for a session.
 * No credential is needed yet.
 */
export class SessionGroup extends HttpApiGroup.make("session")
  .add(
    HttpApiEndpoint.get("methods", "/methods", { success: SignIn.Methods }),
    HttpApiEndpoint.post("start", "/email", {
      payload: Schema.Struct({ email: Accounts.Email }),
      success: HttpApiSchema.Empty(202),
      error: [
        SignIn.Limited.pipe(HttpApiSchema.status(429)),
        SignIn.Unavailable.pipe(HttpApiSchema.status(503)),
      ],
    }),
    HttpApiEndpoint.post("complete", "/code", {
      payload: Schema.Struct({ email: Accounts.Email, code: SignIn.Code }),
      success: SignIn.Session,
      error: SignIn.Rejected.pipe(HttpApiSchema.status(403)),
    }),
  )
  .prefix("/session") {}
