/**
 * A checkpoint before working: the turn's model summarizes the older history and any input the
 * summary covers, in passes that each fit a request, each reading the summary so far. A summary that
 * fails or stays silent past the idle timeout fails the attempt as an interruption, which is retried
 * like any other, so nothing is left out for want of a summary.
 */
import { Transcript } from "@amends/harness";
import { Effect } from "effect";
import { Compaction } from "./compaction.ts";
import { Ending } from "./ending.ts";
import type { NextStep } from "./next-step.ts";
import type { Settings } from "./settings.ts";
import type { TurnSteps } from "./turn-steps.ts";

/**
 * How many characters of conversation one summary request reads at most: less when the model's
 * budget is smaller, so each request fits its model.
 */
const summaryPass = 200_000;

/** Summarize the history the step's compaction covers, and record it as the turn's checkpoint. */
export const record = Effect.fnUntraced(function* (
  turn: TurnSteps.Interface,
  settings: Settings,
  { plan, model, budget, compaction }: NextStep.Work & { readonly compaction: NextStep.Compaction },
) {
  const summary = yield* Compaction.summarize(compaction.summarize, {
    passSize: Math.min(summaryPass, budget * Transcript.charactersPerToken),
    timeout: settings.idleTimeout,
  }).pipe(
    Effect.provide(
      model.languageModel(
        { settings: plan.connection.settings, credential: plan.connection.credential },
        { model: plan.selection.model },
      ),
    ),
  );
  yield* turn.recordCheckpoint({
    summary,
    kept: compaction.kept,
    through: compaction.through,
  });
  return Ending.again;
});

export * as Checkpoint from "./checkpoint.ts";
