/**
 * The turn runner runs one agent's turns in one thread, for its turn job, one at a time: it takes
 * the work that waits into a turn and starts it through the workspace, runs it on the agent's
 * harness while it writes the participation's session log and shows readers what each step is
 * writing, and ends it through the workspace. A turn asked to stop is stopped where it runs.
 */
import {
  SessionLog,
  type SessionStateStore,
  type Turn,
  TurnExecution,
  type TurnJobs,
  TurnPrompt,
} from "@amends/core/turn";
import { Agent, type Session, StreamPart } from "@amends/harness-v2";
import { Cause, Clock, Data, Deferred, Effect, Option, Predicate, Semaphore, Stream } from "effect";
import { TurnAgent } from "./agent.ts";
import { SessionLogWriter } from "./session-log-writer.ts";
import { inWorkspace } from "./workspace.ts";

/** The least time between two drafts of a step's text, in milliseconds. */
const draftInterval = 100;

/** How a run of a turn came out. */
export type Outcome = Data.TaggedEnum<{
  /** The agent finished the turn, whose answer is the text of its last step. */
  Answered: {};
  /** The agent could not run the turn, or reported that it failed, for `reason`. */
  Failed: { readonly reason: string };
  /** The turn was asked to stop, and was. */
  Stopped: {};
}>;
export const Outcome = Data.taggedEnum<Outcome>();

/** A run of the job failed before its turn ended; the turn it ran, if it accepted one, is still active. */
export class RunFailed extends Data.TaggedError("TurnRunner.RunFailed")<{
  readonly turnId: Turn.Id | undefined;
  readonly cause: unknown;
}> {}

/** More of a text part of a step: `text` continues the part at `offset`. */
export interface Draft {
  /** The part's position among the step's parts, as the session log records the step. */
  readonly part: number;
  readonly offset: number;
  readonly text: string;
}

/** The text each text part of `step` has past what `shown` holds, by the part's position. */
export const newDrafts = (
  step: StreamPart.Step,
  shown: ReadonlyMap<number, number>,
): ReadonlyArray<Draft> =>
  step.parts.flatMap((part, index) => {
    if (part.type !== "text") return [];
    const offset = shown.get(index) ?? 0;
    return part.text.length > offset
      ? [{ part: index, offset, text: part.text.slice(offset) }]
      : [];
  });

/** An error an agent reported, as the reason its turn failed. */
export const describeError = (error: unknown): string => {
  if (typeof error === "string" && error !== "") return error;
  if (Predicate.hasProperty(error, "message") && typeof error.message === "string")
    return error.message;
  return "The agent reported that the turn failed.";
};

/** What a session it let go of resumes from, as the workspace keeps it. */
const resumeOf = (state: Session.SessionState): SessionStateStore.Resume =>
  state.agentState === undefined
    ? { agent: state.agent }
    : { agent: state.agent, agentState: state.agentState };

/** @category constructors */
export const make = Effect.fn("TurnRunner.make")(function* (job: TurnJobs.Job) {
  const runs = yield* Semaphore.make(1);
  /** The turn a run holds, and how to ask it to stop. */
  let running: { readonly turnId: Turn.Id; readonly stop: Deferred.Deferred<void> } | undefined;
  const execute = <A, E>(step: (turnExecution: TurnExecution.Interface) => Effect.Effect<A, E>) =>
    inWorkspace(job.workspaceId, Effect.flatMap(TurnExecution.Service, step));

  /**
   * Run the turn on the agent's harness until it ends or is stopped, logging each step it
   * finishes and showing drafts of the step it is writing.
   */
  const runAgent = Effect.fnUntraced(function* (
    ready: SessionLogWriter.Ready,
    writer: SessionLogWriter.Writer,
    progress: Progress,
  ) {
    const turnId = ready.turn.id;
    // A participation's session, and the sandbox it works in, are named after it.
    const sessionId = Agent.SessionId.make(ready.turn.participationId);
    const agent = yield* TurnAgent.open(ready.runnable, sessionId);
    const { history } = writer.opening;
    const session = yield* agent.harness.startSession({
      ...(agent.sandbox === undefined ? {} : { sandbox: agent.sandbox }),
      ...(ready.resume === null
        ? { id: sessionId, history }
        : { resumeFrom: { id: sessionId, history, ...ready.resume } }),
    });
    progress.session = { session, agent: agent.harness.agent.id };
    /** Names a step of this run: the run's opening position in the log, and the step's index. */
    const stepId = (index: number) => `${writer.openedAt}.${index}`;
    const showDrafts = Effect.gen(function* () {
      const [step] = StreamPart.stepsOf(progress.stepParts);
      progress.shownAt = yield* Clock.currentTimeMillis;
      if (step === undefined) return;
      const drafts = newDrafts(step, progress.shown);
      for (const { part, offset, text } of drafts) progress.shown.set(part, offset + text.length);
      if (drafts.length === 0) return;
      // Drafts are best effort: the step's log entry shows what a missed one held.
      yield* execute((turnExecution) =>
        Effect.forEach(
          drafts,
          (draft) =>
            turnExecution.showDraft(turnId, { responseId: stepId(progress.steps), ...draft }),
          { discard: true },
        ),
      ).pipe(
        Effect.catchCauseIf(
          (cause) => !Cause.hasInterruptsOnly(cause),
          (cause) => Effect.logWarning("Drafts of a turn's step were not shown", cause),
        ),
      );
    });
    const takePart = Effect.fnUntraced(function* (part: StreamPart.StreamPart) {
      if (part.type === "finish") return;
      if (part.type === "finish-step") {
        const [step] = StreamPart.stepsOf([...progress.stepParts, part]);
        progress.stepParts = [];
        progress.shown.clear();
        if (step !== undefined)
          yield* writer.append([{ _tag: "Step", turnId, id: stepId(progress.steps), step }]);
        progress.steps += 1;
        return;
      }
      if (part.type === "error") progress.reported = part.error;
      progress.stepParts.push(part);
      const now = yield* Clock.currentTimeMillis;
      if (
        part.type === "text-end" ||
        (part.type === "text-delta" && now - progress.shownAt >= draftInterval)
      )
        yield* showDrafts;
    });
    const instructions = ready.runnable.instructions;
    yield* session
      .stream({
        prompt: TurnPrompt.userMessageOf(writer.opening.prompt),
        ...(instructions === "" ? {} : { instructions }),
      })
      .pipe(Stream.runForEach(takePart));
    return progress.reported === undefined
      ? Outcome.Answered()
      : Outcome.Failed({ reason: describeError(progress.reported) });
  });

  /**
   * Start the turn and run it: open its session log, run the agent until the turn ends or is
   * asked to stop, log the step it left unfinished, let go of the session, and end the turn.
   */
  const runTurn = Effect.fnUntraced(function* (turnId: Turn.Id, stop: Deferred.Deferred<void>) {
    const started = yield* execute((turnExecution) => turnExecution.start(turnId));
    if (started._tag === "Idle") return;
    const writer = yield* SessionLogWriter.open(job.workspaceId, started);
    const { outcome, resume } = yield* Effect.scoped(
      Effect.gen(function* () {
        const progress = makeProgress();
        const outcome = yield* runAgent(started, writer, progress).pipe(
          Effect.catchTags({
            ConnectionError: (error) => Effect.succeed(Outcome.Failed({ reason: error.message })),
            SandboxError: (error) => Effect.succeed(Outcome.Failed({ reason: error.message })),
            HarnessError: (error) => Effect.succeed(Outcome.Failed({ reason: error.message })),
            AiError: (error) => Effect.succeed(Outcome.Failed({ reason: error.message })),
            PlatformError: (error) => Effect.succeed(Outcome.Failed({ reason: error.message })),
          }),
          Effect.raceFirst(Effect.as(Deferred.await(stop), Outcome.Stopped())),
        );
        const [unfinished] = StreamPart.stepsOf(progress.stepParts);
        if (unfinished !== undefined)
          yield* writer.append([
            { _tag: "Step", turnId, id: `${writer.openedAt}.${progress.steps}`, step: unfinished },
          ]);
        return { outcome, resume: yield* letGo(progress) };
      }),
    );
    yield* execute((turnExecution) =>
      Outcome.$match(outcome, {
        Answered: () =>
          resume === undefined
            ? Effect.die("A turn its agent answered has no session")
            : turnExecution.close(turnId, { reply: SessionLog.answerOf(writer.written()), resume }),
        Failed: ({ reason }) => turnExecution.fail(turnId, { reason, resume }),
        Stopped: () => turnExecution.confirmStopped(turnId, { resume }),
      }),
    );
  });

  /**
   * Run the agent's next turn in the thread, if work waits for one, after any run in progress:
   * the turn it has active, or one that accepts the work that waits. Answers the turn it ran.
   */
  const runNextTurn = runs.withPermit(
    Effect.gen(function* () {
      const accepted = yield* execute((turnExecution) => turnExecution.accept(job)).pipe(
        Effect.mapError((cause) => new RunFailed({ turnId: undefined, cause })),
      );
      if (Option.isNone(accepted)) return Option.none<Turn.Id>();
      const turnId = accepted.value.id;
      const stop = yield* Deferred.make<void>();
      running = { turnId, stop };
      yield* runTurn(turnId, stop).pipe(
        Effect.catchTag("SessionLogWriter.Superseded", () =>
          Effect.logWarning("Turn run superseded by another run of it", {
            workspaceId: job.workspaceId,
            turnId,
          }),
        ),
        Effect.mapError((cause) => new RunFailed({ turnId, cause })),
        Effect.catchDefect((cause) => Effect.fail(new RunFailed({ turnId, cause }))),
        Effect.ensuring(Effect.sync(() => (running = undefined))),
      );
      return Option.some(turnId);
    }),
  );

  /**
   * Stop the turn: the run that holds it stops it, and one no run holds ends as it stands, when it
   * was asked to stop or its participation ended.
   */
  const stopTurn = (turnId: Turn.Id) =>
    running?.turnId === turnId
      ? Effect.asVoid(Deferred.succeed(running.stop, undefined))
      : execute((turnExecution) => turnExecution.confirmStopped(turnId, {}));

  /** Fail the turn its job could not run, for `reason`. */
  const giveUp = (turnId: Turn.Id, reason: string) =>
    execute((turnExecution) => turnExecution.fail(turnId, { reason }));

  return { runNextTurn, stopTurn, giveUp };
});

/**
 * What a session the run started resumes from once the run lets go of it: what its agent returned,
 * or, when letting go failed, the agent alone, which then starts from the conversation the log
 * records. None when the run started no session.
 */
const letGo = (progress: Progress) => {
  const started = progress.session;
  if (started === undefined) return Effect.undefined;
  return started.session.detach.pipe(
    Effect.map(resumeOf),
    Effect.tapError((error) => Effect.logWarning("A turn's session was not let go of", error)),
    Effect.orElseSucceed((): SessionStateStore.Resume => ({ agent: started.agent })),
  );
};

/** What a run of a turn has done so far, which ending it reads. */
interface Progress {
  /** The session, once started, and the agent that runs it. */
  session: { readonly session: Session.Session; readonly agent: string } | undefined;
  /** The parts of the step being written, since the last that finished. */
  stepParts: Array<StreamPart.StreamPart>;
  /** How many steps finished. */
  steps: number;
  /** How much of each text part of the step being written readers were shown, by its position. */
  shown: Map<number, number>;
  /** When readers were last shown drafts, in milliseconds. */
  shownAt: number;
  /** The failure the agent reported, if it did. */
  reported: unknown;
}

const makeProgress = (): Progress => ({
  session: undefined,
  stepParts: [],
  steps: 0,
  shown: new Map(),
  shownAt: Number.NEGATIVE_INFINITY,
  reported: undefined,
});

export type TurnRunner = Effect.Success<ReturnType<typeof make>>;

export * as TurnRunner from "./runner.ts";
