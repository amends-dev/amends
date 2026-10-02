/**
 * One attempt to get a running turn further: a harness session, or a checkpoint that summarizes its
 * older history. The attempt is recorded first, then runs until its work ends or the turn is no
 * longer running, as when someone asks it to stop. A harness or summary failure is recorded as the
 * turn's interruption, in words for its readers, and says what the run does next.
 */
import type { HarnessErrors } from "@amends/harness";
import { Effect } from "effect";
import type { Checkpoint } from "./checkpoint.ts";
import type { Compaction } from "./compaction.ts";
import { Ending } from "./ending.ts";
import { NextStep } from "./next-step.ts";
import type { Session } from "./session.ts";
import { durationInWords, type Settings } from "./settings.ts";
import type { TurnSteps } from "./turn-steps.ts";

/** A step that runs the turn: summarizing its history, or working in a harness session. */
export type Step = Extract<NextStep.Step, { readonly _tag: "Summarize" | "Work" }>;

type Attempted = ReturnType<typeof Checkpoint.record> | ReturnType<typeof Session.run>;

/** What a turn's readers know its model access by: the connection's name, and the model's. */
interface ModelAccessNames {
  readonly connection: string;
  readonly model: string;
}

/**
 * Why an attempt stopped, in words for the turn's readers: its problem, naming the connection and
 * model, never the provider's own message, which can name addresses they should not see.
 */
const describeProblem = (
  problem: HarnessErrors.Problem,
  names: ModelAccessNames,
  idleTimeoutInWords: string,
): string => {
  switch (problem) {
    case "model-access":
      return `${names.connection} didn't accept its API key.`;
    case "model-quota":
      return `${names.connection} has no quota left for its API key.`;
    case "model-rate-limit":
      return `${names.connection} is limiting requests.`;
    case "model-unreachable":
      return `${names.connection} couldn't be reached.`;
    case "model-provider":
      return `${names.connection} had a problem on its side.`;
    case "model-content-policy":
      return `${names.connection} declined the request under its content policy.`;
    case "model-context":
      return `The conversation no longer fits in ${names.model}'s context window.`;
    case "model-request":
      return `${names.connection} rejected the request for ${names.model}.`;
    case "model-output":
      return `${names.model}'s response couldn't be used.`;
    case "model-silent":
      return `${names.model} sent nothing for ${idleTimeoutInWords}.`;
    case "ended":
      return "The agent's environment stopped before the turn finished.";
    case "unexpected":
      return "Something unexpected stopped the turn.";
  }
};

/** Ends once the turn is no longer running, as when someone asks it to stop. */
const waitUntilStopped = (turnSteps: TurnSteps.Interface, settings: Settings) =>
  Effect.gen(function* () {
    for (;;) {
      yield* Effect.sleep(settings.checkInterval);
      const current = yield* turnSteps.get;
      if (current.status !== "running") return Ending.Again();
    }
  });

/**
 * Record why the attempt stopped, in words and as a problem, and say what the run does next: a
 * full context goes on after a checkpoint, at once; a failure worth retrying rests first; any
 * other fails the turn. The detail goes to the logs only.
 */
const endAfterFailure = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  step: Step,
  failure: HarnessErrors.ExecutionFailed | Compaction.Failed,
  text: string,
) {
  yield* turnSteps.recordInterruption({
    reason: text,
    // A full context goes on after a checkpoint, however its provider classed it.
    retryable: failure.retryable || failure.problem === "model-context",
    problem: failure.problem,
  });
  const logFields = {
    ...turnSteps.ids,
    problem: failure.problem,
    reason: failure.reason,
    attempt: step.plan.attempts + 1,
  };
  if (failure.problem === "model-context") {
    yield* Effect.logWarning("Turn context full", logFields);
    return Ending.Again();
  }
  if (!failure.retryable) {
    yield* Effect.logWarning("Turn failed", logFields);
    return Ending.Unrunnable({ reason: text });
  }
  yield* Effect.logWarning("Turn interrupted", logFields);
  return Ending.Interrupted();
});

/**
 * Run `attempt`, the work of the step, as the turn's next attempt, and say how it ended: a summary
 * for a checkpoint, or a harness session.
 */
export const run = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  settings: Settings,
  step: Step,
  attempt: Effect.Effect<
    Effect.Success<Attempted>,
    Effect.Error<Attempted>,
    Effect.Services<Attempted>
  >,
) {
  const names = { connection: step.plan.connection.name, model: step.plan.selection.model };
  const idleTimeoutInWords = durationInWords(settings.idleTimeout);
  yield* turnSteps.recordAttempt(NextStep.Step.$is("Summarize")(step) ? "summary" : "session");
  return yield* attempt.pipe(
    Effect.raceFirst(waitUntilStopped(turnSteps, settings)),
    Effect.scoped,
    Effect.catchTags({
      "Harness.ExecutionFailed": (failure) =>
        endAfterFailure(
          turnSteps,
          step,
          failure,
          describeProblem(failure.problem, names, idleTimeoutInWords),
        ),
      "Compaction.Failed": (failure) =>
        endAfterFailure(
          turnSteps,
          step,
          failure,
          `The earlier conversation couldn't be summarized. ${describeProblem(failure.problem, names, idleTimeoutInWords)}`,
        ),
    }),
  );
});

export * as Attempt from "./attempt.ts";
