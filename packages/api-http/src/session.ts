import { SignIn } from "@amends/gateway/sign-in";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";

/** Email sign-in: request a code, then exchange it for a session. No credential is needed yet. */
export class SessionGroup extends HttpApiGroup.make("session")
  .add(
    HttpApiEndpoint.post("start", "/email", {
      payload: Schema.Struct({ email: SignIn.Email }),
      success: HttpApiSchema.Empty(202),
    }),
    HttpApiEndpoint.post("complete", "/code", {
      payload: Schema.Struct({ email: SignIn.Email, code: SignIn.Code }),
      success: SignIn.Session,
      error: SignIn.Rejected.pipe(HttpApiSchema.status(403)),
    }),
  )
  .prefix("/session") {}
