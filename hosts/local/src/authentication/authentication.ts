import { Layer } from "effect";
import { DevelopmentCredentials } from "./credentials.ts";
import { DevelopmentSignIn } from "./sign-in.ts";

/**
 * Compose development sign-in and credential resolution over the caller's cryptography.
 *
 * @category layers
 */
export const layer = (deliver?: DevelopmentSignIn.DeliverCode) =>
  Layer.merge(DevelopmentSignIn.layer(deliver), DevelopmentCredentials.layer);

export * as DevelopmentAuthentication from "./authentication.ts";
