/** How much of its model's context a turn may use, and whether its conversation needs a checkpoint. */
import type { ModelInference } from "@amends/connection/model-inference";
import { TurnLog } from "@amends/core/turn";
import type { TurnExecution } from "@amends/core/turn";
import type { ContextPolicy } from "./settings.ts";

/** The tokens a turn may use of a model with these limits, and what a checkpoint keeps. */
export const contextBudget = (limits: ModelInference.Limits, policy: ContextPolicy) => {
  const budget = Math.max(
    1,
    Math.floor(
      Math.min(
        policy.cap,
        limits.contextTokens * policy.share,
        limits.contextTokens - Math.min(limits.outputTokens ?? 0, policy.outputReserve),
      ),
    ),
  );
  return { budget, keep: Math.floor(budget * policy.keep) };
};

/**
 * The turn's budget with its model, and the checkpoint its conversation needs before the model
 * reads it, if any. `force` asks for one however the estimate stands, as when the context proved
 * full, and `shrink` halves what it keeps that many times.
 */
export const compactionFor = (
  plan: TurnExecution.Plan,
  model: ModelInference.Implementation,
  policy: ContextPolicy,
  options: { readonly force?: boolean; readonly shrink?: number } = {},
) => {
  const limits = contextBudget(
    model.limits(
      { settings: plan.connection.settings, credential: plan.connection.credential },
      { model: plan.selection.model },
    ),
    policy,
  );
  return {
    ...limits,
    compaction: TurnLog.proposeCompaction(plan.transcript, plan.waiting, {
      ...limits,
      keep: Math.floor(limits.keep / 2 ** (options.shrink ?? 0)),
      fixed: plan.fixed,
      measured: plan.measured,
      instructions: plan.instructions,
      current: plan.history.length,
      force: options.force,
    }),
  };
};

export * as ContextBudget from "./context-budget.ts";
