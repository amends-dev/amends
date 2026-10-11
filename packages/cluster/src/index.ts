/**
 * Runs jobs, the work a commit asks for outside any request, on Effect Cluster: a turn job for each
 * agent in each thread, which runs the agent's turns there on its harness, and a delivery job for
 * each bound thread, which carries what the thread's contacts were told to its conversation. Each
 * kind of job is an entity whose requests commits store; `JobRequests` says how a request that
 * fails is tried again, and `JobPruning` removes handled ones. Jobs enter workspaces through the
 * gateway, and build harnesses, models, sandboxes, and transports from the integrations the host
 * installs.
 *
 * @since 0.1.0
 */

/**
 * The delivery job: the `amends/DeliveryJob` entity, its `Deliver` request, the requests commits
 * store, and the worker that handles them.
 *
 * @since 0.1.0
 */
export * as DeliveryJob from "./DeliveryJob.ts";

/**
 * A bound thread's deliveries, accepted and posted to its conversation one at a time.
 *
 * @since 0.1.0
 */
export * as DeliveryRunner from "./DeliveryRunner.ts";

/**
 * The hourly job that removes the requests Cluster handled once they are old enough.
 *
 * @since 0.1.0
 */
export * as JobPruning from "./JobPruning.ts";

/**
 * How every job handles a request that fails: tried again until it holds, or dropped.
 *
 * @since 0.1.0
 */
export * as JobRequests from "./JobRequests.ts";

/**
 * The turn job: the `amends/TurnJob` entity, its `Run` and `Stop` requests, the requests commits
 * store, and the worker that handles them.
 *
 * @since 0.1.0
 */
export * as TurnJob from "./TurnJob.ts";

/**
 * An agent's turns in one thread, run one at a time on its harness while the run writes the
 * participation's session log.
 *
 * @since 0.1.0
 */
export * as TurnRunner from "./TurnRunner.ts";
