import { Accounts } from "@amends-dev/gateway/accounts";
import { SignIn } from "@amends-dev/gateway/sign-in";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";

/** Email sign-in: request a code, then exchange it for a session. No credential is needed yet. */
export class SessionGroup extends HttpApiGroup.make("session")
  .add(
    HttpApiEndpoint.post("start", "/email", {
      payload: Schema.Struct({ email: Accounts.Email }),
      success: HttpApiSchema.Empty(202),
    }),
    HttpApiEndpoint.post("complete", "/code", {
      payload: Schema.Struct({ email: Accounts.Email, code: SignIn.Code }),
      success: SignIn.Session,
      error: SignIn.Rejected.pipe(HttpApiSchema.status(403)),
    }),
  )
  .prefix("/session") {}
