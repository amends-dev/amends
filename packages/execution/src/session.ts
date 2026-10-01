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
import { inWords, type Settings } from "./settings.ts";
import type { TurnSteps } from "./turn-steps.ts";

/** The session cannot go on, for this reason, which fails the turn. */
class CannotRun extends Schema.TaggedError<CannotRun>()("Session.CannotRun", {
  reason: Schema.String,
}) {}

/** The session was prepared and is not released while the run works in it. */
const unexpected = {
  "Harness.NotPrepared": Effect.die,
  "Environment.Released": Effect.die,
} as const;

/** Input the harness has not taken in, as `prepare` gives it. */
type Pending = NonNullable<TurnExecution.Plan["pending"]>;

/**
 * Run a harness session for the turn's work until the turn closes, its context is full, which
 * ends the session for a checkpoint, or it cannot go on.
 */
export const run = Effect.fnUntraced(
  function* (turn: TurnSteps.Interface, settings: Settings, work: NextStep.Work) {
    const running = yield* spawnEnvironment(turn, work);
    const awaitsResponse = yield* continueConversation(turn, running, work.plan.transcript);
    const { recordUntilIdle } = yield* recorder(turn, settings, running);
    const submit = (pending: Pending) => submitInput(turn, running, pending);

    // Work on the input the turn has not taken in, or answer what the conversation awaits.
    const { pending } = work.plan;
    if (pending !== undefined || awaitsResponse) {
      if (pending !== undefined) yield* submit(pending);
      else yield* running.resume.pipe(Effect.catchTags(unexpected));
      if ((yield* recordUntilIdle) === "full") return Ending.again;
    }
    // Then close the turn, unless more input came for its agent: take that in and work again.
    for (;;) {
      const closing = yield* turn.close;
      if (closing._tag !== "InputPending") return Ending.finished;
      const more = yield* takeMoreInput(turn, settings, work, submit);
      if (more !== "submitted") return more;
      if ((yield* recordUntilIdle) === "full") return Ending.again;
    }
  },
  Effect.catchTag("Session.CannotRun", (cannot) =>
    Effect.succeed(Ending.unrunnable(cannot.reason)),
  ),
);

/** Spawn the agent's environment with the turn's model access, instructions, and budget. */
const spawnEnvironment = Effect.fnUntraced(function* (
  turn: TurnSteps.Interface,
  { plan, harness, model, budget }: NextStep.Work,
) {
  const access = yield* Layer.build(
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
  ).pipe(Effect.provideContext(access), Effect.result);
  if (Result.isFailure(spawned)) {
    yield* Effect.logWarning("Turn environment did not start", {
      ...turn.ids,
      failure: spawned.failure,
    });
    return yield* new CannotRun({ reason: "The agent's environment couldn't start." });
  }
  const running = spawned.success;
  yield* Effect.addFinalizer(() => Effect.ignore(running.release));
  return running;
});

/**
 * Prepare the harness with the conversation so far, read from the agent's log, and say whether it
 * awaits a response, as when the run that asked for one was cut short.
 */
const continueConversation = Effect.fnUntraced(function* (
  turn: TurnSteps.Interface,
  running: Environment.Running,
  transcript: TurnExecution.Plan["transcript"],
) {
  const cannotContinue = "The agent's conversation so far couldn't be continued.";
  const summary = Transcript.summarize(transcript);
  if (Result.isFailure(summary)) {
    yield* Effect.logWarning("Turn transcript is invalid", {
      ...turn.ids,
      reason: summary.failure,
    });
    return yield* new CannotRun({ reason: cannotContinue });
  }
  if (summary.success.pending.length > 0)
    return yield* new CannotRun({
      reason: "The turn is waiting on tool calls, which can't run yet.",
    });
  const prepared = yield* Effect.result(running.prepare(transcript));
  if (Result.isFailure(prepared)) {
    yield* Effect.logWarning("Turn transcript was refused", {
      ...turn.ids,
      failure: prepared.failure,
    });
    return yield* new CannotRun({ reason: cannotContinue });
  }
  return summary.success.awaitsResponse;
});

/**
 * Give the harness input the turn accepted, recorded first so its taking in counts: the batch as
 * the log recorded it, which a restart submits again unchanged.
 */
const submitInput = Effect.fnUntraced(function* (
  turn: TurnSteps.Interface,
  running: Environment.Running,
  pending: Pending,
) {
  // The same range of input always gets the same batch, so submitting it again after a restart
  // records it once.
  const batchId = HarnessEvent.BatchId.make(
    `${turn.ids.turnId}/after:${pending.afterSequence}/through:${pending.throughSequence}`,
  );
  const items = yield* turn.recordSubmission({
    batchId,
    throughSequence: pending.throughSequence,
    items: pending.items,
  });
  yield* running.submit({ id: batchId, items }).pipe(Effect.catchTags(unexpected));
});

/**
 * What the log records: everything the environment and its harness report except streaming
 * deltas, which only show readers a block while it streams.
 */
const recorded = (event: Environment.Event): ReadonlyArray<Environment.Event> =>
  event._tag === "Harness" &&
  (event.event._tag === "TextDelta" || event.event._tag === "ReasoningDelta")
    ? []
    : [event];

/**
 * Record what the harness reports until it is idle or its context is full, showing readers the
 * text it writes as drafts. While it waits on the model, a silence longer than the idle timeout
 * fails the session as an interruption worth retrying, so a model that stops answering does not
 * hold the turn; time a tool call the harness started spends running does not count. The
 * environment ending first fails it the same way.
 */
const recorder = Effect.fnUntraced(function* (
  turn: TurnSteps.Interface,
  settings: Settings,
  running: Environment.Running,
) {
  const pull = yield* Stream.toPull(running.events);
  const drafts = Drafts.make(turn);
  const silent = new HarnessErrors.ExecutionFailed({
    reason: `The model sent nothing for ${inWords(settings.idleTimeout)}.`,
    retryable: true,
    problem: "model-silent",
  });
  const next = pull.pipe(
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
  const started = new Set<string>();
  const recordUntilIdle = Effect.gen(function* () {
    for (;;) {
      const chunk = yield* started.size > 0
        ? next
        : next.pipe(
            Effect.timeoutOrElse({
              duration: settings.idleTimeout,
              orElse: () => Effect.fail(silent),
            }),
          );
      for (const item of chunk) {
        if (item._tag !== "Harness") continue;
        const event = item.event;
        if (event._tag === "ToolCallStarted") started.add(event.callId);
        else if (event._tag === "ToolCallCompleted") started.delete(event.result.callId);
        drafts.note(event);
      }
      yield* drafts.showWhenDue;
      const events = chunk.flatMap(recorded);
      if (events.length > 0) yield* turn.recordEvents(events);
      if (events.some((item) => item._tag === "Harness" && item.event._tag === "ContextFull"))
        return "full" as const;
      const last = events.at(-1);
      if (last?._tag === "Harness" && last.event._tag === "Idle") return "idle" as const;
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
  turn: TurnSteps.Interface,
  settings: Settings,
  work: NextStep.Work,
  submit: (pending: Pending) => ReturnType<typeof submitInput>,
) {
  const since = yield* Clock.currentTimeMillis;
  for (;;) {
    const preparation = yield* turn.prepare;
    if (preparation._tag !== "Ready") return Ending.again;
    const { plan } = preparation;
    if (plan.pending !== undefined) {
      if (ContextBudget.compactionFor(plan, work.model, settings.policy).compaction !== undefined)
        return Ending.again;
      yield* submit(plan.pending);
      return "submitted" as const;
    }
    if ((yield* Clock.currentTimeMillis) - since >= Duration.toMillis(settings.inputWait))
      return Ending.unrunnable("Input the agent accepted never arrived.");
    yield* Effect.sleep(settings.checkInterval);
    const closing = yield* turn.close;
    if (closing._tag !== "InputPending") return Ending.finished;
  }
});

export * as Session from "./session.ts";
