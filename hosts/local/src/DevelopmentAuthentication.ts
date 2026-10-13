/**
 * Development authentication, which `AMENDS_SIGN_IN=development` chooses: `DevelopmentSignIn`,
 * with its codes in memory, and `DevelopmentSessionTokens`, which trust a bearer token as the human
 * ID it asserts, so tests and scripts act as anyone without signing in. Nothing verifies that a
 * person controls an address, so a host that uses it must not be exposed beyond the machine.
 *
 * @since 0.1.0
 */

import * as Layer from "effect/Layer"
import * as DevelopmentSessionTokens from "./DevelopmentSessionTokens.ts"
import * as DevelopmentSignIn from "./DevelopmentSignIn.ts"

/**
 * Compose development sign-in and session tokens over the caller's cryptography and accounts.
 * `deliver` sends each code, and logs it when omitted.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (deliver?: DevelopmentSignIn.DeliverCode) =>
  Layer.merge(DevelopmentSignIn.layer(deliver), DevelopmentSessionTokens.layer)
