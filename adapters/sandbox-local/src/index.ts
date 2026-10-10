/**
 * Sandboxes as directories on this machine, for the `@amends-dev/sandbox` contract. Nothing is
 * isolated, so they suit development, tests, and agents you would trust on this machine anyway.
 *
 * @since 0.1.0
 */

/**
 * The provider that keeps each sandbox in a directory on this machine and runs its processes as
 * this machine's processes.
 *
 * @since 0.1.0
 */
export * as LocalSandboxProvider from "./LocalSandboxProvider.ts";
