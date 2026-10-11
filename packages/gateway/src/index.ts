/**
 * How a host enters core: `Gateway` creates workspaces and runs programs in them, as a member or
 * without an actor, and `GatewayErrors` names what those programs may fail with. The other modules
 * are the contracts a host implements beside it, for storage, accounts, sign-in, session tokens,
 * email, and the workspace directory; `EmailSignIn` implements sign-in and session tokens over
 * three of them. `@amends-dev/gateway/memory` implements the contracts in process memory, and
 * `@amends-dev/gateway/conformance` holds the suites every storage adapter runs against itself.
 *
 * @since 0.1.0
 */

/**
 * The people a host knows across its workspaces, each an address and the human ID core names them
 * by.
 *
 * @since 0.1.0
 */
export * as Accounts from "./Accounts.ts";

/**
 * How a host hands email, such as sign-in codes, to its provider.
 *
 * @since 0.1.0
 */
export * as EmailSender from "./EmailSender.ts";

/**
 * Sign-in with codes sent by email, and the session tokens it issues, over the host's
 * sign-in storage, accounts, and email sender.
 *
 * @since 0.1.0
 */
export * as EmailSignIn from "./EmailSignIn.ts";

/**
 * How a host resolves a session token into the identity that holds it, and stops honoring one.
 *
 * @since 0.1.0
 */
export * as SessionTokens from "./SessionTokens.ts";

/**
 * One identity's memberships and pending invitations across a host's workspaces.
 *
 * @since 0.1.0
 */
export * as WorkspaceDirectory from "./WorkspaceDirectory.ts";

/**
 * The outcomes a program run through the gateway may fail with, which a caller can act on.
 *
 * @since 0.1.0
 */
export * as GatewayErrors from "./GatewayErrors.ts";

/**
 * The gateway itself: workspace creation, and entry as a member or without an actor.
 *
 * @since 0.1.0
 */
export * as Gateway from "./Gateway.ts";

/**
 * How a host signs people in: the ways it offers, and the email-code flow that ends in a
 * session.
 *
 * @since 0.1.0
 */
export * as SignIn from "./SignIn.ts";

/**
 * Where email sign-in keeps its pending codes and sessions, across every host over the storage.
 *
 * @since 0.1.0
 */
export * as SignInStorage from "./SignInStorage.ts";

/**
 * The storage a host binds to each workspace: its stores and its signal hub.
 *
 * @since 0.1.0
 */
export * as WorkspaceStorage from "./WorkspaceStorage.ts";
