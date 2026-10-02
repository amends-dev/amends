import { Layer } from "effect";
import { DevelopmentSessionTokens } from "./session-tokens.ts";
import { DevelopmentSignIn } from "./sign-in.ts";

/**
 * Compose development sign-in and session tokens over the caller's cryptography.
 *
 * @category layers
 */
export const layer = (deliver?: DevelopmentSignIn.DeliverCode) =>
  Layer.merge(DevelopmentSignIn.layer(deliver), DevelopmentSessionTokens.layer);

export * as DevelopmentAuthentication from "./authentication.ts";
