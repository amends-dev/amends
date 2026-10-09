/**
 * Runs an agent, such as opencode, Codex, Claude Code, or one in the host's own process over an
 * Effect AI `LanguageModel`, and streams every agent's turns in one format. `Harness` is what
 * callers run an agent through, `Agent` is what an adapter implements, and `Bridge`,
 * `BridgeServer`, and `BridgeClient` reach an agent that works in a sandbox.
 *
 * @since 0.1.0
 */

/**
 * What an adapter implements for its agent: how the agent is named and installed, and how its
 * sessions start.
 *
 * @since 0.1.0
 */
export * as Agent from "./Agent.ts";

/**
 * The bridge through which hosts reach an agent in a sandbox: what an adapter implements to drive
 * the agent there, and the protocol between a host and the bridge.
 *
 * @since 0.1.0
 */
export * as Bridge from "./Bridge.ts";

/**
 * The host's side of a bridge: the sessions of an adapter's agent that works behind one.
 *
 * @since 0.1.0
 */
export * as BridgeClient from "./BridgeClient.ts";

/**
 * The bridge's side, which runs in the sandbox and serves a driver's sessions to hosts.
 *
 * @since 0.1.0
 */
export * as BridgeServer from "./BridgeServer.ts";

/**
 * A whole turn, as `generate` and `generateObject` return it.
 *
 * @since 0.1.0
 */
export * as GenerateResult from "./GenerateResult.ts";

/**
 * The service callers run an agent through, made from an agent's adapter.
 *
 * @since 0.1.0
 */
export * as Harness from "./Harness.ts";

/**
 * The error every harness operation fails with, and its reasons.
 *
 * @since 0.1.0
 */
export * as HarnessError from "./HarnessError.ts";

/**
 * An MCP server in the sandbox through which an agent there calls the host's tools.
 *
 * @since 0.1.0
 */
export * as HostToolRelay from "./HostToolRelay.ts";

/**
 * How an agent reaches a model: its API, where it is, its key, and how hard it works.
 *
 * @since 0.1.0
 */
export * as ModelEndpoint from "./ModelEndpoint.ts";

/**
 * One conversation with an agent, run a turn at a time, and the state it is saved and resumed from.
 *
 * @since 0.1.0
 */
export * as Session from "./Session.ts";

/**
 * The parts a harness streams for a turn, and the steps they add up to.
 *
 * @since 0.1.0
 */
export * as StreamPart from "./StreamPart.ts";
