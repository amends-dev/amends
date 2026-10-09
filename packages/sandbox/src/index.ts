/**
 * Sandboxes that agents work in: the contract every sandbox provider implements, with Effect's own
 * file system and processes inside. `SandboxProvider` creates and resumes sandboxes on one
 * platform, `Sandbox` is one of them, `Template` prepares new ones, `Network` is what a sandbox
 * exposes and may reach, and `SandboxError` is what operations on a sandbox fail with.
 *
 * @since 0.1.0
 */

/**
 * What a sandbox exposes to the network and what it may reach: ports and how to reach them, the
 * outbound network policy, and request transformations.
 *
 * @since 0.1.0
 */
export * as Network from "./Network.ts";

/**
 * One sandbox: its files, processes, ports, network, and lifecycle, and `layerServices`, which
 * provides its files and processes to Effect code.
 *
 * @since 0.1.0
 */
export * as Sandbox from "./Sandbox.ts";

/**
 * The error every operation on a sandbox fails with, and its reasons.
 *
 * @since 0.1.0
 */
export * as SandboxError from "./SandboxError.ts";

/**
 * The service that creates sandboxes on one platform and resumes them by id.
 *
 * @since 0.1.0
 */
export * as SandboxProvider from "./SandboxProvider.ts";

/**
 * What prepares a new sandbox, such as by installing an agent, once per version where a provider
 * snapshots.
 *
 * @since 0.1.0
 */
export * as Template from "./Template.ts";
