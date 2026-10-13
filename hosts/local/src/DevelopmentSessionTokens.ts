/**
 * Development session tokens: a bearer token is the human ID it asserts, as development sign-in
 * gives it for a session, and nothing is stored, so signing out cannot revoke one. They are built
 * synchronously and need no services.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import { SessionTokens } from "@amends-dev/gateway";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

/**
 * Construct development session tokens that trust a nonempty bearer token as a human ID. Such a
 * token cannot be revoked: signing out forgets it in the client alone.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = (): SessionTokens.SessionTokens["Service"] =>
  SessionTokens.SessionTokens.of({
    resolve: (token) =>
      Schema.decodeEffect(Identity.HumanId)(Redacted.value(token)).pipe(
        Effect.mapError(() => new SessionTokens.Rejected({ reason: "malformed" })),
        Effect.map((id) => Identity.Reference.cases.Human.make({ id })),
      ),
    revoke: () => Effect.void,
  });

/**
 * Provide the development session tokens as `SessionTokens.SessionTokens`, trusting any bearer
 * token that is a well-formed human ID.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.sync(SessionTokens.SessionTokens, make);
