/**
 * opencode as an agent for the `@amends-dev/harness` contract, working in a sandbox behind its
 * bridge, which the agent's template installs there with opencode itself. opencode has two
 * versions, each with a session API of its own, and the package an agent for each: `OpencodeAgent`
 * runs opencode 1, which takes everything a turn gives, and `Opencode2Agent` runs opencode 2, which
 * records a session started on another agent as its own but does not answer in JSON yet.
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
