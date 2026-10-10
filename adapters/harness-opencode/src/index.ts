/**
 * opencode as an agent for the `@amends/harness` contract, working in a sandbox behind its bridge,
 * which the agent's template installs there with opencode itself. opencode has two session APIs,
 * and the package an agent for each: `OpencodeAgent` drives opencode 1's, which takes everything a
 * turn gives, and `Opencode2Agent` drives opencode 2's, which keeps a session's events numbered
 * but does not take all of a turn yet.
 *
 * @since 0.1.0
 */

/**
 * The agent over opencode 1's session API, what it is made with, and its sessions, each an
 * opencode session in the sandbox.
 *
 * @since 0.1.0
 */
export * as OpencodeAgent from "./OpencodeAgent.ts";

/**
 * The agent over opencode 2's session API, what it is made with, and its sessions, each an
 * opencode session in the sandbox.
 *
 * @since 0.1.0
 */
export * as Opencode2Agent from "./Opencode2Agent.ts";
