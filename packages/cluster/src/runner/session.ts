/**
 * One harness session for a running turn. It attaches to the session the turn last started when a
 * run cut short left it at work, recording what it reported meanwhile; otherwise it starts one in
 * the turn's running environment with the agent's model access, prepares it with the conversation
 * so far, and gives it the input the turn has not taken in. It records what the session reports
 * until it is idle, then closes the turn; when more input came for the agent while it worked, the
 * harness takes that in and works again, in the same session.
 */
import { TurnExecution } from "@amends/core/turn";
import type { Environment, HarnessServer } from "@amends/environment";
import { HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import type { Harness } from "@amends/harness";
import { Clock, Crypto, Duration, Effect, Pull, Result, Schema, Stream } from "effect";
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
    const attached = yield* attachLeftSession(turnSteps, work.plan, environment);
    if (attached === "replan") return Ending.Again();
    const session = attached?.session ?? (yield* startSession(turnSteps, work, environment));
    // A new session takes up the conversation so far; one attached to has it, and works on.
    const working =
      attached === undefined
        ? yield* giveWork(turnSteps, session, work.plan)
        : attached.state === "working";
    const { recordUntilIdle } = yield* makeEventRecorder(turnSteps, settings, session);
    if (working && (yield* recordUntilIdle) === "full") return Ending.Again();
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
 * What a run does with the session it attached to: go on in it; start another, since it stopped;
 * or read the log again first, since what it reported changed what the turn continues from and
 * it does no more, as when its context is full.
 */
export const afterAttaching = (attached: HarnessServer.Attachment) =>
  attached.missed.some(HarnessEvent.Event.isAnyOf(["ContextFull"]))
    ? ("replan" as const)
    : attached.state !== "stopped"
      ? ("continue" as const)
      : attached.missed.length > 0
        ? ("replan" as const)
        : ("start" as const);

/**
 * The session the turn last started, if a run cut short left it at work in the environment, after
 * recording what it reported meanwhile; `replan` when the run must read the log again first.
 */
const attachLeftSession = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  plan: TurnExecution.Plan,
  environment: Environment.Running,
) {
  if (plan.session === undefined) return undefined;
  const attached = yield* environment.attachSession(plan.session);
  if (attached === undefined) return undefined;
  if (attached.missed.length > 0) yield* turnSteps.recordEvents(attached.missed);
  const next = afterAttaching(attached);
  yield* Effect.logInfo("Turn attached to its harness session", {
    ...turnSteps.ids,
    sessionId: plan.session.sessionId,
    missed: attached.missed.length,
    state: attached.state,
  });
  return next === "continue" ? attached : next === "replan" ? next : undefined;
});

/**
 * Start a session in the environment with the agent's model access, the instructions the turn
 * started with, and the turn's budget as its context limit, recording its ID first.
 */
const startSession = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  work: NextStep.Work,
  environment: Environment.Running,
) {
  const { plan, model, budget } = work;
  const crypto = yield* Crypto.Crypto;
  const sessionId = `session-${yield* Effect.orDie(crypto.randomUUIDv4)}`;
  yield* turnSteps.recordSession(sessionId);
  return yield* environment.startSession({
    sessionId,
    model: {
      inference: model,
      access: { settings: plan.connection.settings, credential: plan.connection.credential },
      selection: { model: plan.selection.model },
    },
    instructions: plan.instructions,
    contextLimit: budget,
    measured: plan.measured,
  });
});

/**
 * Prepare a new session with the conversation so far, then give it the input the turn has not
 * taken in, or ask it to answer what the conversation awaits; say whether it has work.
 */
const giveWork = Effect.fnUntraced(function* (
  turnSteps: TurnSteps.Interface,
  session: Harness.Session,
  plan: TurnExecution.Plan,
) {
  const awaitsResponse = yield* continueConversation(turnSteps, session, plan.transcript);
  if (plan.pending !== undefined) yield* submitInput(turnSteps, session, plan.pending);
  else if (awaitsResponse) yield* session.resume.pipe(Effect.catchTags(dieOnUnexpected));
  return plan.pending !== undefined || awaitsResponse;
});

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
  const { batchId } = pending;
  const items = yield* turnSteps.recordSubmission({
    batchId,
    throughSequence: pending.throughSequence,
    items: pending.items,
  });
  yield* session.submit({ id: batchId, items }).pipe(Effect.catchTags(dieOnUnexpected));
});

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
      const events = chunk.filter((event) => !HarnessEvent.isDelta(event));
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
