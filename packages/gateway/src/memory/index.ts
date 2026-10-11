/**
 * The gateway's host contracts in process memory, over core's memory storage: workspace storage,
 * the workspace directory, accounts, and sign-in storage, which `MemoryStorage.layer` provides
 * together. The gateway's tests run over it, and the conformance suites check it as they check
 * every storage adapter.
 *
 * @since 0.1.0
 */

/**
 * The host's accounts, in a table beside every workspace's state.
 *
 * @since 0.1.0
 */
export * as MemoryAccounts from "./MemoryAccounts.ts";

/**
 * The workspace directory, read from every workspace's committed records.
 *
 * @since 0.1.0
 */
export * as MemoryDirectory from "./MemoryDirectory.ts";

/**
 * Email sign-in's pending codes and sessions.
 *
 * @since 0.1.0
 */
export * as MemorySignInStorage from "./MemorySignInStorage.ts";

/**
 * Every host contract the gateway needs from storage, in one layer.
 *
 * @since 0.1.0
 */
export * as MemoryStorage from "./MemoryStorage.ts";

/**
 * Each workspace's stores and signal hub, bound over one connection.
 *
 * @since 0.1.0
 */
export * as MemoryWorkspaceStorage from "./MemoryWorkspaceStorage.ts";
