/**
 * One harness session for a running turn. It spawns the agent's environment with its model access,
 * prepares the harness with the conversation so far, gives it the input the turn has not taken in,
 * and records what it reports until it is idle. Then it closes the turn; when more input came for
 * the agent while it worked, the harness takes that in and works again, in the same session.
 */
import type { TurnExecution } from "@amends/core/turn";
import { Environment } from "@amends/environment";
import { HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import { Clock, Crypto, Duration, Effect, Layer, Pull, Result, Schema, Stream } from "effect";
import { ContextBudget } from "./context-budget.ts";
import { Drafts } from "./drafts.ts";
import { Ending } from "./ending.ts";
import type { NextStep } from "./next-step.ts";
import { durationInWords, type Settings } from "./settings.ts";
import type { TurnSteps } from "./turn-steps.ts";

/** The session cannot go on, for this reason, which fails the turn. */
class CannotRun extends Schema.TaggedError<CannotRun>()("Session.CannotRun", {
  reason: Schema.String,
}) {}

/** The session was prepared and is not released while the run works in it. */
const dieOnUnexpected = {
  "Harness.NotPrepared": Effect.die,
  "Environment.Released": Effect.die,
} as const;

/** Input the harness has not taken in, as `prepare` gives it. */
type PendingInput = NonNullable<TurnExecution.Plan["pending"]>;

/**
 * Run a harness session for the turn's work until the turn closes, its context is full, which
 * ends the session for a checkpoint, or it cannot go on.
 */
export const run = Effect.fnUntraced(
  function* (turnSteps: TurnSteps.Interface, settings: Settings, work: NextStep.Work) {
    const runningEnvironment = yield* spawnEnvironment(turnSteps, work);
    const awaitsResponse = yield* continueConversation(
      turnSteps,
      runningEnvironment,
      work.plan.transcript,
    );
    const { recordUntilIdle } = yield* makeEventRecorder(turnSteps, settings, runningEnvironment);

    // Work on the input the turn has not taken in, or answer what the conversation awaits.
    const { pending } = work.plan;
    if (pending !== undefined || awaitsResponse) {
      if (pending !== undefined) yield* submitInput(turnSteps, runningEnvironment, pending);
      else yield* runningEnvironment.resume.pipe(Effect.catchTags(dieOnUnexpected));
      if ((yield* recordUntilIdle) === "full") return Ending.again;
    }
    // Then close the turn, unless more input came for its agent: take that in and work again.
    for (;;) {
      const closing = yield* turnSteps.close;
      if (closing._tag !== "InputPending") return Ending.finished;
      const moreInput = yield* takeMoreInput(turnSteps, settings, work, runningEnvironment);
      if (moreInput !== "submitted") return moreInput;
      if ((yield* recordUntilIdle) === "full") return Ending.again;
    }
  },
  Effect.catchTag("Session.CannotRun", (cannot) =>
    Effect.succeed(Ending.unrunnable(cannot.reason)),
  ),
);

/** Spawn the agent's environment with the turn's model access, instructions, and budget. */
const spawnEnvironment = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  { plan, harness, model, budget }: NextStep.Work,
) {
  const modelAccess = yield* Layer.build(
    model.languageModel(
      { settings: plan.connection.settings, credential: plan.connection.credential },
      { model: plan.selection.model },
    ),
  );
  const crypto = yield* Crypto.Crypto;
  const sessionId = `session-${yield* Effect.orDie(crypto.randomUUIDv4)}`;
  const spawned = yield* Environment.spawn(
    { id: Environment.DefinitionId.make(plan.environment.id), harness },
    { sessionId, instructions: plan.instructions, contextLimit: budget, measured: plan.measured },
  ).pipe(Effect.provideContext(modelAccess), Effect.result);
  if (Result.isFailure(spawned)) {
    yield* Effect.logWarning("Turn environment did not start", {
      ...turnSteps.ids,
      failure: spawned.failure,
    });
    return yield* new CannotRun({ reason: "The agent's environment couldn't start." });
  }
  const runningEnvironment = spawned.success;
  yield* Effect.addFinalizer(() => Effect.ignore(runningEnvironment.release));
  return runningEnvironment;
});

/**
 * Prepare the harness with the conversation so far, read from the agent's log, and say whether it
 * awaits a response, as when the run that asked for one was cut short.
 */
const continueConversation = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  runningEnvironment: Environment.Running,
  transcript: TurnExecution.Plan["transcript"],
) {
  const cannotContinue = "The agent's conversation so far couldn't be continued.";
  const transcriptState = Transcript.summarize(transcript);
  if (Result.isFailure(transcriptState)) {
    yield* Effect.logWarning("Turn transcript is invalid", {
      ...turnSteps.ids,
      reason: transcriptState.failure,
    });
    return yield* new CannotRun({ reason: cannotContinue });
  }
  if (transcriptState.success.pending.length > 0)
    return yield* new CannotRun({
      reason: "The turn is waiting on tool calls, which can't run yet.",
    });
  const prepared = yield* Effect.result(runningEnvironment.prepare(transcript));
  if (Result.isFailure(prepared)) {
    yield* Effect.logWarning("Turn transcript was refused", {
      ...turnSteps.ids,
      failure: prepared.failure,
    });
    return yield* new CannotRun({ reason: cannotContinue });
  }
  return transcriptState.success.awaitsResponse;
});

/**
 * Give the harness input the turn accepted, recorded first so its taking in counts: the batch as
 * the log recorded it, which a restart submits again unchanged.
 */
const submitInput = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  runningEnvironment: Environment.Running,
  pending: PendingInput,
) {
  // The same range of input always gets the same batch, so submitting it again after a restart
  // records it once.
  const batchId = HarnessEvent.BatchId.make(
    `${turnSteps.ids.turnId}/after:${pending.afterSequence}/through:${pending.throughSequence}`,
  );
  const items = yield* turnSteps.recordSubmission({
    batchId,
    throughSequence: pending.throughSequence,
    items: pending.items,
  });
  yield* runningEnvironment.submit({ id: batchId, items }).pipe(Effect.catchTags(dieOnUnexpected));
});

/**
 * What the log keeps of what the environment and its harness report: everything except streaming
 * deltas, which only show readers a block while it streams.
 */
const withoutDeltas = (event: Environment.Event): ReadonlyArray<Environment.Event> =>
  event._tag === "Harness" &&
  (event.event._tag === "TextDelta" || event.event._tag === "ReasoningDelta")
    ? []
    : [event];

/**
 * Follow what the harness reports, to record it until it is idle or its context is full, showing
 * readers the text it writes as drafts. While it waits on the model, a silence longer than the
 * idle timeout fails the session as an interruption worth retrying, so a model that stops
 * answering does not hold the turn; time a tool call the harness started spends running does not
 * count. The environment ending first fails it the same way.
 */
const makeEventRecorder = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  settings: Settings,
  runningEnvironment: Environment.Running,
) {
  const pullEvents = yield* Stream.toPull(runningEnvironment.events);
  const drafts = Drafts.make(turnSteps);
  const modelSilent = new HarnessErrors.ExecutionFailed({
    reason: `The model sent nothing for ${durationInWords(settings.idleTimeout)}.`,
    retryable: true,
    problem: "model-silent",
  });
  const nextEvents = pullEvents.pipe(
    Pull.catchDone(() =>
      Effect.fail(
        new HarnessErrors.ExecutionFailed({
          reason: "The environment ended before the turn finished.",
          retryable: true,
          problem: "ended",
        }),
      ),
    ),
  );
  /** Calls the harness started that have no result yet: while one runs, silence is its. */
  const runningToolCalls = new Set<string>();
  const recordUntilIdle = Effect.gen(function* () {
    for (;;) {
      const chunk = yield* runningToolCalls.size > 0
        ? nextEvents
        : nextEvents.pipe(
            Effect.timeoutOrElse({
              duration: settings.idleTimeout,
              orElse: () => Effect.fail(modelSilent),
            }),
          );
      for (const item of chunk) {
        if (item._tag !== "Harness") continue;
        const event = item.event;
        if (event._tag === "ToolCallStarted") runningToolCalls.add(event.callId);
        else if (event._tag === "ToolCallCompleted") runningToolCalls.delete(event.result.callId);
        drafts.applyEvent(event);
      }
      yield* drafts.showWhenDue;
      const events = chunk.flatMap(withoutDeltas);
      if (events.length > 0) yield* turnSteps.recordEvents(events);
      if (events.some((item) => item._tag === "Harness" && item.event._tag === "ContextFull"))
        return "full" as const;
      const lastEvent = events.at(-1);
      if (lastEvent?._tag === "Harness" && lastEvent.event._tag === "Idle") return "idle" as const;
    }
  });
  return { recordUntilIdle };
});

/**
 * Closing found input still due to the agent: give the harness what the agent accepted. While the
 * agent is still accepting it, check every `checkInterval`, closing instead if the work went away,
 * for up to `inputWait` before failing the turn. Input that would take the conversation past its
 * budget ends the session instead, for a checkpoint first.
 */
const takeMoreInput = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  settings: Settings,
  work: NextStep.Work,
  runningEnvironment: Environment.Running,
) {
  const waitingSince = yield* Clock.currentTimeMillis;
  for (;;) {
    const preparation = yield* turnSteps.prepare;
    if (preparation._tag !== "Ready") return Ending.again;
    const { plan } = preparation;
    if (plan.pending !== undefined) {
      const { compaction } = ContextBudget.measureAgainstBudget(plan, work.model, settings.policy);
      if (compaction !== undefined) return Ending.again;
      yield* submitInput(turnSteps, runningEnvironment, plan.pending);
      return "submitted" as const;
    }
    if ((yield* Clock.currentTimeMillis) - waitingSince >= Duration.toMillis(settings.inputWait))
      return Ending.unrunnable("Input the agent accepted never arrived.");
    yield* Effect.sleep(settings.checkInterval);
    const closing = yield* turnSteps.close;
    if (closing._tag !== "InputPending") return Ending.finished;
  }
});

export * as Session from "./session.ts";
