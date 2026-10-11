/**
 * Agents: workspace members that work, as their instructions say, on a harness and a model, and
 * in a sandbox when they need one, each given by one of the workspace's connections. `Agent` is
 * the record, its setup, and the view readers see; `AgentService` the operations an actor calls;
 * `AgentQuery` the reads turns share; `AgentReadiness` whether an agent can run as it is set up;
 * and `AgentStore` the contract every storage adapter implements.
 *
 * @since 0.1.0
 */

/**
 * An agent's record, the parts of its setup, the inputs that create, configure, and rename one,
 * and the view readers see.
 *
 * @since 0.1.0
 */
export * as Agent from "./Agent.ts";

/**
 * The facts recorded about an agent: its creation and each replacement of its setup.
 *
 * @since 0.1.0
 */
export * as AgentFacts from "./AgentFacts.ts";

/**
 * The actions on agents that need a grant: creating, reading, configuring, and using one.
 *
 * @since 0.1.0
 */
export * as AgentPermissions from "./AgentPermissions.ts";

/**
 * The projection that keeps the agent read model.
 *
 * @since 0.1.0
 */
export * as AgentProjection from "./AgentProjection.ts";

/**
 * The reads of agents that turns share: what a turn runs on, and the agent ready to run on it.
 *
 * @since 0.1.0
 */
export * as AgentQuery from "./AgentQuery.ts";

/**
 * The storage contract for agents.
 *
 * @since 0.1.0
 */
export * as AgentStore from "./AgentStore.ts";

/**
 * The outcomes `AgentService` reports that a caller can act on.
 *
 * @since 0.1.0
 */
export * as AgentErrors from "./AgentErrors.ts";

/**
 * Whether an agent can run as it is set up, and which harnesses `Auto` has to choose from.
 *
 * @since 0.1.0
 */
export * as AgentReadiness from "./AgentReadiness.ts";

/**
 * The operations on agents an actor calls: listing, reading, creating, configuring, and renaming
 * them.
 *
 * @since 0.1.0
 */
export * as AgentService from "./AgentService.ts";
