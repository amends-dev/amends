/**
 * Turns: agents' attempts in threads, one harness turn each, and their session logs. `Turn` is the
 * record and what readers see of it; `TurnService` the operations an actor calls on turns;
 * `TurnExecution` what each agent's turn job, `TurnJobs`, asks of the workspace to run them;
 * `TurnCommand` the writes the two share; `TurnPrompt` what an agent is told; `SessionLog` the
 * record of an agent's conversation in a thread; and the stores the contracts every storage
 * adapter implements.
 *
 * @since 0.1.0
 */

/**
 * A turn's record, what a reader sees of it, and the items and messages by which a reader follows
 * its session log.
 *
 * @since 0.1.0
 */
export * as Turn from "./Turn.ts";

/**
 * The kinds of activity a turn records in its thread's timeline.
 *
 * @since 0.1.0
 */
export * as TurnActivity from "./TurnActivity.ts";

/**
 * The operations on turns an actor calls: reading them, following their logs, stopping them, and
 * retrying them.
 *
 * @since 0.1.0
 */
export * as TurnService from "./TurnService.ts";

/**
 * The writes to turns that operations and execution share, run inside the caller's commit.
 *
 * @since 0.1.0
 */
export * as TurnCommand from "./TurnCommand.ts";

/**
 * Turn jobs, one for each agent in each thread, and the facts that request them.
 *
 * @since 0.1.0
 */
export * as TurnJobs from "./TurnJobs.ts";

/**
 * The outcomes turn operations report that a caller can act on.
 *
 * @since 0.1.0
 */
export * as TurnErrors from "./TurnErrors.ts";

/**
 * What a turn's job asks of the workspace: accepting work into a turn, starting it, and ending it.
 *
 * @since 0.1.0
 */
export * as TurnExecution from "./TurnExecution.ts";

/**
 * The facts recorded about turns.
 *
 * @since 0.1.0
 */
export * as TurnFacts from "./TurnFacts.ts";

/**
 * The identity of a turn.
 *
 * @since 0.1.0
 */
export * as TurnId from "./TurnId.ts";

/**
 * The projection that keeps the turn read model.
 *
 * @since 0.1.0
 */
export * as TurnProjection from "./TurnProjection.ts";

/**
 * What an agent is told of its thread: a turn's prompt, and the conversation it joins.
 *
 * @since 0.1.0
 */
export * as TurnPrompt from "./TurnPrompt.ts";

/**
 * An agent's session log in a thread: its entries, the conversation rebuilt from them, and how
 * readers see a turn's part of it.
 *
 * @since 0.1.0
 */
export * as SessionLog from "./SessionLog.ts";

/**
 * The storage contract for session logs.
 *
 * @since 0.1.0
 */
export * as SessionLogStore from "./SessionLogStore.ts";

/**
 * The storage contract for what each participation's harness session resumes from.
 *
 * @since 0.1.0
 */
export * as SessionStateStore from "./SessionStateStore.ts";

/**
 * The storage contract for turns.
 *
 * @since 0.1.0
 */
export * as TurnStore from "./TurnStore.ts";

/**
 * How turns appear in a timeline.
 *
 * @since 0.1.0
 */
export * as TurnTimeline from "./TurnTimeline.ts";
