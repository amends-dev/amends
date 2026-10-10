/**
 * An agent in the host's own process for the `@amends-dev/harness` contract: a loop over an Effect
 * AI `LanguageModel`, with tools for the files and the shell of a sandbox.
 *
 * @since 0.1.0
 */

/**
 * The agent, what it is made with, and its sessions.
 *
 * @since 0.1.0
 */
export * as AmendsAgent from "./AmendsAgent.ts";

/**
 * The language models the agent runs on, made from model endpoints with the model providers'
 * clients.
 *
 * @since 0.1.0
 */
export * as Models from "./Models.ts";

/**
 * The tools the agent works with in a sandbox: reading, writing, and editing files, and running
 * shell commands.
 *
 * @since 0.1.0
 */
export * as Tools from "./Tools.ts";
