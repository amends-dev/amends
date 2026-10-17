/**
 * How a host enters core: `Gateway` creates workspaces and runs programs in them, as a member or
 * without an actor, and those programs fail with what core's operations report. The other modules
 * are the contracts a host implements beside it, for storage, accounts, sign-in, session tokens,
 * email, and the workspace directory; `EmailSignIn` implements sign-in and session tokens over
 * three of them. Each storage contract's `layerMemory` implements it in process memory, and
 * `@amends-dev/gateway/conformance` holds the suites every storage adapter runs against itself.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as Accounts from "./Accounts.ts"

/**
 * @since 0.1.0
 */
export * as EmailSender from "./EmailSender.ts"

/**
 * @since 0.1.0
 */
export * as EmailSignIn from "./EmailSignIn.ts"

/**
 * @since 0.1.0
 */
export * as Gateway from "./Gateway.ts"

/**
 * @since 0.1.0
 */
export * as SessionTokens from "./SessionTokens.ts"

/**
 * @since 0.1.0
 */
export * as SignIn from "./SignIn.ts"

/**
 * @since 0.1.0
 */
export * as SignInStorage from "./SignInStorage.ts"

/**
 * @since 0.1.0
 */
export * as WorkspaceDirectory from "./WorkspaceDirectory.ts"

/**
 * @since 0.1.0
 */
export * as WorkspaceStorage from "./WorkspaceStorage.ts"
