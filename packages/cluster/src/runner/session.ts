/**
 * One harness session for a running turn. It starts a session in the turn's running environment
 * with the agent's model access, prepares it with the conversation so far, gives it the input the
 * turn has not taken in, and records what it reports until it is idle. Then it closes the turn;
 * when more input came for the agent while it worked, the harness takes that in and works again,
 * in the same session.
 */
import { TurnExecution } from "@amends/core/turn";
import type { Environment } from "@amends/environment";
import { HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import type { Harness } from "@amends/harness";
import { Clock, Duration, Effect, Pull, Result, Schema, Stream } from "effect";
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

/** The session was prepared before the run works in it. */
const dieOnUnexpected = { "Harness.NotPrepared": Effect.die } as const;

/** Input the harness has not taken in, as `prepare` gives it. */
type PendingInput = NonNullable<TurnExecution.Plan["pending"]>;

/**
 * Run a harness session for the turn's work until the turn closes, its context is full, which
 * ends the session for a checkpoint, or it cannot go on.
 */
export const run = Effect.fnUntraced(
  function* (
    turnSteps: TurnSteps.Interface,
    settings: Settings,
    work: NextStep.Work,
    environment: Environment.Running,
  ) {
    const { plan, model, budget } = work;
    const session = yield* environment.startSession({
      model: {
        inference: model,
        access: { settings: plan.connection.settings, credential: plan.connection.credential },
        selection: { model: plan.selection.model },
      },
      instructions: plan.instructions,
      contextLimit: budget,
      measured: plan.measured,
    });
    const awaitsResponse = yield* continueConversation(turnSteps, session, plan.transcript);
    const { recordUntilIdle } = yield* makeEventRecorder(turnSteps, settings, session);

    // Work on the input the turn has not taken in, or answer what the conversation awaits.
    const { pending } = plan;
    if (pending !== undefined || awaitsResponse) {
      if (pending !== undefined) yield* submitInput(turnSteps, session, pending);
      else yield* session.resume.pipe(Effect.catchTags(dieOnUnexpected));
      if ((yield* recordUntilIdle) === "full") return Ending.Again();
    }
    // Then close the turn, unless more input came for its agent: take that in and work again.
    for (;;) {
      const closing = yield* turnSteps.close;
      if (!TurnExecution.Closing.$is("InputPending")(closing)) return Ending.Finished();
      const moreInput = yield* takeMoreInput(turnSteps, settings, work, session);
      if (moreInput !== "submitted") return moreInput;
      if ((yield* recordUntilIdle) === "full") return Ending.Again();
    }
  },
  Effect.catchTag("Session.CannotRun", (cannot) =>
    Effect.succeed(Ending.Unrunnable({ reason: cannot.reason })),
  ),
);

/**
 * Prepare the harness with the conversation so far, read from the agent's log, and say whether it
 * awaits a response, as when the run that asked for one was cut short.
 */
const continueConversation = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  session: Harness.Session,
  transcript: TurnExecution.Plan["transcript"],
) {
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
  // A harness that refuses the transcript can't continue it; one that failed may on a retry.
  yield* session.prepare(transcript).pipe(
    Effect.catchTags({
      "Harness.AlreadyPrepared": Effect.die,
      "Harness.InvalidTranscript": (refusal) => refuseTranscript(turnSteps, refusal),
      "Harness.Unsupported": (refusal) => refuseTranscript(turnSteps, refusal),
    }),
  );
  return transcriptState.success.awaitsResponse;
});

const cannotContinue = "The agent's conversation so far couldn't be continued.";

/** The harness refused the conversation so far, which fails the turn. */
const refuseTranscript = (
  turnSteps: TurnSteps.Interface,
  refusal: HarnessErrors.InvalidTranscript | HarnessErrors.Unsupported,
) =>
  Effect.logWarning("Turn transcript was refused", { ...turnSteps.ids, failure: refusal }).pipe(
    Effect.andThen(Effect.fail(new CannotRun({ reason: cannotContinue }))),
  );

/**
 * Give the harness input the turn accepted, recorded first so its taking in counts: the batch as
 * the log recorded it, which a restart submits again unchanged.
 */
const submitInput = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  session: Harness.Session,
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
  yield* session.submit({ id: batchId, items }).pipe(Effect.catchTags(dieOnUnexpected));
});

/** Streaming deltas only show readers a block while it streams; the log keeps the rest. */
const isDelta = HarnessEvent.Event.isAnyOf(["TextDelta", "ReasoningDelta"]);

/**
 * Follow what the harness reports, to record it until it is idle or its context is full, showing
 * readers the text it writes as drafts. While it waits on the model, a silence longer than the
 * idle timeout fails the session as an interruption worth retrying, so a model that stops
 * answering does not hold the turn; time a tool call the harness started spends running does not
 * count. The session ending first fails it the same way.
 */
const makeEventRecorder = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  settings: Settings,
  session: Harness.Session,
) {
  const pullEvents = yield* Stream.toPull(session.events);
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
          reason: "The harness session ended before the turn finished.",
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
      for (const event of chunk) {
        if (HarnessEvent.Event.isAnyOf(["ToolCallStarted"])(event))
          runningToolCalls.add(event.callId);
        else if (HarnessEvent.Event.isAnyOf(["ToolCallCompleted"])(event))
          runningToolCalls.delete(event.result.callId);
        drafts.applyEvent(event);
      }
      yield* drafts.showWhenDue;
      const events = chunk.filter((event) => !isDelta(event));
      if (events.length > 0) yield* turnSteps.recordEvents(events);
      if (events.some(HarnessEvent.Event.isAnyOf(["ContextFull"]))) return "full" as const;
      const lastEvent = events.at(-1);
      if (lastEvent !== undefined && HarnessEvent.Event.isAnyOf(["Idle"])(lastEvent))
        return "idle" as const;
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
  session: Harness.Session,
) {
  const waitingSince = yield* Clock.currentTimeMillis;
  for (;;) {
    const preparation = yield* turnSteps.prepare;
    if (!TurnExecution.Preparation.$is("Ready")(preparation)) return Ending.Again();
    const { plan } = preparation;
    if (plan.pending !== undefined) {
      const { compaction } = ContextBudget.measureAgainstBudget(plan, work.model, settings.policy);
      if (compaction !== undefined) return Ending.Again();
      yield* submitInput(turnSteps, session, plan.pending);
      return "submitted" as const;
    }
    if ((yield* Clock.currentTimeMillis) - waitingSince >= Duration.toMillis(settings.inputWait))
      return Ending.Unrunnable({ reason: "Input the agent accepted never arrived." });
    yield* Effect.sleep(settings.checkInterval);
    const closing = yield* turnSteps.close;
    if (!TurnExecution.Closing.$is("InputPending")(closing)) return Ending.Finished();
  }
});

export * as Session from "./session.ts";
