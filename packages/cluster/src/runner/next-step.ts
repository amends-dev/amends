/**
 * What a run does next with a turn, decided from what `prepare` read and nothing else, so a run cut
 * short decides the same again after a restart. The runner performs the step and prepares again.
 */
import type { ModelInference } from "@amends/connection/model-inference";
import { TurnExecution, type Turn, type TurnLog } from "@amends/core/turn";
import type { Harness, HarnessErrors } from "@amends/harness";
import { Data, Duration } from "effect";
import { ContextBudget } from "./context-budget.ts";
import type { ModelAccess, Settings } from "./settings.ts";

/** The checkpoint a conversation needs before its model reads it. */
export type Compaction = TurnLog.Compaction;

/** The turn's work with what runs it: its plan, harness, model, and token budget. */
export interface Work {
  readonly plan: TurnExecution.Plan;
  readonly harness: Harness.Interface<ModelAccess>;
  readonly model: ModelInference.Implementation;
  readonly budget: number;
}

export type Step = Data.TaggedEnum<{
  /** Nothing: the turn finished. */
  Done: {};
  /** Confirm the turn stopped, as it was asked to. */
  ConfirmStop: {};
  /** Fail the turn: it cannot run here, or no longer fits its model. */
  Fail: { readonly reason: string };
  /** Fail a turn whose attempts keep stopping without getting further. */
  GiveUp: {
    readonly reason: string;
    readonly attempts: number;
    readonly problem: HarnessErrors.Problem | undefined;
  };
  /** Take a queued turn to run, with the model access and environment it prepared with. */
  Start: { readonly selection: Turn.Selection };
  /** Wait before the next attempt. */
  Rest: { readonly delay: Duration.Duration };
  /** Summarize older history first, as a checkpoint, since the conversation is too long. */
  Summarize: Work & { readonly compaction: Compaction };
  /** Run a harness session. */
  Work: Work;
}>;
export const Step = Data.taggedEnum<Step>();

/**
 * How long a turn rests before its next attempt after `attempts` that got nowhere: 2, 4, then 8
 * seconds. Apart from Cluster's retry of a run that failed, which `TurnJob` asks for.
 */
export const interruptionDelay = (attempts: number) => Duration.seconds(2 ** Math.min(attempts, 6));

/**
 * Decide the next step. `restBeforeAttempt` says whether to wait first, as after an interruption
 * worth retrying; before the run's first attempt it is undefined, and the turn rests when its log
 * shows an attempt that died, as when its process did.
 */
export const decide = (
  preparation: TurnExecution.Preparation,
  settings: Settings,
  restBeforeAttempt: boolean | undefined,
): Step => {
  if (TurnExecution.Preparation.$is("Finished")(preparation)) return Step.Done();
  if (TurnExecution.Preparation.$is("Stopping")(preparation)) return Step.ConfirmStop();
  if (TurnExecution.Preparation.$is("Unrunnable")(preparation))
    return Step.Fail({ reason: preparation.reason });
  const plan = preparation.plan;
  if (plan.environment.sandbox !== null)
    return Step.Fail({ reason: "Environments with a sandbox can't run turns yet." });
  const harness = settings.harnesses.get(plan.environment.harnessId);
  if (harness === undefined)
    return Step.Fail({
      reason: `The ${plan.environment.harnessId} harness doesn't run on this server.`,
    });
  const model = settings.models.get(plan.connection.implementationId);
  if (model === undefined)
    return Step.Fail({ reason: `${plan.connection.name}'s models can't run on this server.` });
  // Starting may record the thread's history in the agent's log, so the run prepares again after;
  // a turn stopped before it started is then found finished.
  if (plan.turn.status === "queued") return Step.Start({ selection: plan.selection });
  if (plan.attempts > settings.retries)
    return Step.GiveUp({
      reason: plan.interruption?.reason ?? "The turn kept stopping before it got anywhere.",
      attempts: plan.attempts,
      problem: plan.interruption?.problem,
    });
  if (restBeforeAttempt ?? plan.diedLast)
    return Step.Rest({ delay: interruptionDelay(plan.attempts) });
  // A context that proved full owes a checkpoint however the estimate stands, which keeps less
  // each time it proves full again before the model answers; past that, or when a checkpoint
  // would free nothing, even a summary does not make it fit.
  const tooLongReason = `The conversation no longer fits in ${plan.selection.model}'s context window, even summarized.`;
  const { overflow } = plan;
  if (overflow.pending && overflow.count > settings.policy.shrinks)
    return Step.Fail({ reason: tooLongReason });
  const { compaction, budget } = ContextBudget.measureAgainstBudget(plan, model, settings.policy, {
    force: overflow.pending,
    shrink: overflow.pending ? overflow.count - 1 : 0,
  });
  if (overflow.pending && compaction === undefined) return Step.Fail({ reason: tooLongReason });
  const work = { plan, harness, model, budget };
  return compaction === undefined ? Step.Work(work) : Step.Summarize({ ...work, compaction });
};

export * as NextStep from "./next-step.ts";
