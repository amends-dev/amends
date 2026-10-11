import { Layer } from "effect";
import * as DevelopmentSessionTokens from "./DevelopmentSessionTokens.ts";
import * as DevelopmentSignIn from "./DevelopmentSignIn.ts";

/**
 * Compose development sign-in and session tokens over the caller's cryptography and accounts.
 *
 * @category layers
 */
export const layer = (deliver?: DevelopmentSignIn.DeliverCode) =>
  Layer.merge(DevelopmentSignIn.layer(deliver), DevelopmentSessionTokens.layer);
