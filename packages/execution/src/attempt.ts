/**
 * One attempt to get a running turn further: a harness session, or a checkpoint that summarizes its
 * older history. The attempt is recorded first, then runs until its work ends or the turn is no
 * longer running, as when someone asks it to stop. A harness or summary failure is recorded as the
 * turn's interruption, in words for its readers, and says what the run does next.
 */
import type { HarnessErrors } from "@amends/harness";
import { Effect } from "effect";
import { Checkpoint } from "./checkpoint.ts";
import type { Compaction } from "./compaction.ts";
import { Ending } from "./ending.ts";
import type { NextStep } from "./next-step.ts";
import { Session } from "./session.ts";
import { inWords, type Settings } from "./settings.ts";
import type { TurnSteps } from "./turn-steps.ts";

/** A step that runs the turn: summarizing its history, or working in a harness session. */
export type Step = Extract<NextStep.Step, { readonly _tag: "Summarize" | "Work" }>;

/** What a turn's readers know its model access by: the connection's name, and the model's. */
interface Named {
  readonly connection: string;
  readonly model: string;
}

/**
 * Why an attempt stopped, in words for the turn's readers: its problem, naming the connection and
 * model, never the provider's own message, which can name addresses they should not see.
 */
const describe = (problem: HarnessErrors.Problem, named: Named, idle: string): string => {
  switch (problem) {
    case "model-access":
      return `${named.connection} didn't accept its API key.`;
    case "model-quota":
      return `${named.connection} has no quota left for its API key.`;
    case "model-rate-limit":
      return `${named.connection} is limiting requests.`;
    case "model-unreachable":
      return `${named.connection} couldn't be reached.`;
    case "model-provider":
      return `${named.connection} had a problem on its side.`;
    case "model-content-policy":
      return `${named.connection} declined the request under its content policy.`;
    case "model-context":
      return `The conversation no longer fits in ${named.model}'s context window.`;
    case "model-request":
      return `${named.connection} rejected the request for ${named.model}.`;
    case "model-output":
      return `${named.model}'s response couldn't be used.`;
    case "model-silent":
      return `${named.model} sent nothing for ${idle}.`;
    case "ended":
      return "The agent's environment stopped before the turn finished.";
    case "unexpected":
      return "Something unexpected stopped the turn.";
  }
};

/** Ends once the turn is no longer running, as when someone asks it to stop. */
const whenStopped = (turn: TurnSteps.Interface, settings: Settings) =>
  Effect.gen(function* () {
    for (;;) {
      yield* Effect.sleep(settings.checkInterval);
      const current = yield* turn.get;
      if (current.status !== "running") return Ending.again;
    }
  });

/**
 * Record why the attempt stopped, in words and as a problem, and say what the run does next: a
 * full context goes on after a checkpoint, at once; a failure worth retrying rests first; any
 * other fails the turn. The detail goes to the logs only.
 */
const interrupt = Effect.fnUntraced(function* (
  turn: TurnSteps.Interface,
  step: Step,
  failure: HarnessErrors.ExecutionFailed | Compaction.Failed,
  text: string,
) {
  yield* turn.recordInterruption({
    reason: text,
    // A full context goes on after a checkpoint, however its provider classed it.
    retryable: failure.retryable || failure.problem === "model-context",
    problem: failure.problem,
  });
  const detail = {
    ...turn.ids,
    problem: failure.problem,
    reason: failure.reason,
    attempt: step.plan.attempts + 1,
  };
  if (failure.problem === "model-context") {
    yield* Effect.logWarning("Turn context full", detail);
    return Ending.again;
  }
  if (!failure.retryable) {
    yield* Effect.logWarning("Turn failed", detail);
    return Ending.unrunnable(text);
  }
  yield* Effect.logWarning("Turn interrupted", detail);
  return Ending.interrupted;
});

/** Run the step as the turn's next attempt, and say how it ended. */
export const run = Effect.fnUntraced(function* (
  turn: TurnSteps.Interface,
  settings: Settings,
  step: Step,
) {
  const named = { connection: step.plan.connection.name, model: step.plan.selection.model };
  const idle = inWords(settings.idleTimeout);
  yield* turn.recordAttempt(step._tag === "Summarize" ? "summary" : "session");
  type Work = ReturnType<typeof Checkpoint.record> | ReturnType<typeof Session.run>;
  const work = Effect.suspend(
    (): Effect.Effect<Effect.Success<Work>, Effect.Error<Work>, Effect.Services<Work>> =>
      step._tag === "Summarize"
        ? Checkpoint.record(turn, settings, step)
        : Session.run(turn, settings, step),
  );
  return yield* work.pipe(
    Effect.raceFirst(whenStopped(turn, settings)),
    Effect.scoped,
    Effect.catchTags({
      "Harness.ExecutionFailed": (failure) =>
        interrupt(turn, step, failure, describe(failure.problem, named, idle)),
      "Compaction.Failed": (failure) =>
        interrupt(
          turn,
          step,
          failure,
          `The earlier conversation couldn't be summarized. ${describe(failure.problem, named, idle)}`,
        ),
    }),
  );
});

export * as Attempt from "./attempt.ts";
