/**
 * Runs the turns agents accepted. A run prepares its turn from core, spawns the agent's
 * environment with its model access, hands the harness the conversation and the input it has not
 * taken in, records what the harness reports, and closes the turn once the harness is idle, which
 * publishes the agent's reply. Each step is its own commit through the gateway, so a run cut short
 * continues from the turn's log.
 */
import type { ModelInference } from "@amends/connection/model-inference";
import { TurnExecution, TurnLog } from "@amends/core/turn";
import type { Turn } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Environment } from "@amends/environment";
import { Gateway } from "@amends/gateway";
import type { GatewayErrors } from "@amends/gateway";
import { HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import { Compaction } from "./compaction.ts";
import type { Harness } from "@amends/harness";
import { Clock, Context, Crypto, Duration, Effect, Layer, Pull, Result, Stream } from "effect";
import type { LanguageModel, Model } from "effect/unstable/ai";

/** The model access an in-process harness takes: Effect AI's, from a connection's implementation. */
export type ModelAccess = LanguageModel.LanguageModel | Model.ProviderName | Model.ModelName;

export interface Options {
  /** The harnesses this host runs in process, found by name. */
  readonly harnesses: ReadonlyArray<Harness.Interface<ModelAccess>>;
  /** The code behind the model connections this host installs, found by implementation. */
  readonly models: ReadonlyArray<ModelInference.Implementation>;
  /** How often a running turn looks for a request to stop: every second by default. */
  readonly checkInterval?: Duration.Input | undefined;
  /**
   * How many times a turn runs again when it stopped short without getting further, whether by a
   * failure worth retrying or by its run dying: three by default. Its log counts the attempts, so
   * a restart does not reset them.
   */
  readonly retries?: number | undefined;
  /** How long a turn waits for input its agent is still accepting: a minute by default. */
  readonly inputWait?: Duration.Input | undefined;
  /**
   * How long a turn waits on its model with nothing reported before the run counts as interrupted,
   * which it recovers from as from any interruption worth retrying: five minutes by default. Time
   * a tool call the harness started spends running does not count.
   */
  readonly idleTimeout?: Duration.Input | undefined;
  /** How much of its model's context a turn may use before a checkpoint, and what one keeps. */
  readonly context?: Partial<ContextPolicy> | undefined;
}

/**
 * How a turn's conversation is kept within its model's context window. A turn may use `share` of
 * the window, less the room its model may need to write (at most `outputReserve` tokens), and at
 * most `cap` tokens, which bounds what one request costs however large the window; a checkpoint
 * then keeps `keep` of that budget verbatim and summarizes the rest. When the context proves full
 * anyway, as when a provider counts more tokens than four characters make, each checkpoint for it
 * keeps half as much, up to `shrinks` times before the turn fails.
 */
export interface ContextPolicy {
  readonly share: number;
  readonly outputReserve: number;
  readonly cap: number;
  readonly keep: number;
  readonly shrinks: number;
}

/** The context policy a runner applies unless it is given another. */
export const defaultContextPolicy: ContextPolicy = {
  share: 0.8,
  outputReserve: 32_000,
  cap: 200_000,
  keep: 0.4,
  shrinks: 3,
};

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

/** A step through the gateway failed; the turn stays as its last commit left it. */
export type Failure =
  | TurnExecution.PrepareError
  | TurnExecution.CloseError
  | GatewayErrors.WorkspaceNotFound;

export interface Interface {
  /**
   * Run a turn until it closes, stops, or fails. A turn already finished is left as it is, and a
   * running one continues from its log.
   */
  readonly run: (workspaceId: Workspace.Id, turnId: Turn.Id) => Effect.Effect<void, Failure>;
  /** Fail a turn its runs could not finish, unless it already finished. */
  readonly abandon: (workspaceId: Workspace.Id, turnId: Turn.Id) => Effect.Effect<void, Failure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/execution/runner/Service",
) {}

/**
 * How a session with the harness ended: the turn finished; its state changed under it, so the
 * run prepares it again; it stopped short in a way worth retrying, so the run prepares it again
 * after a wait; or it can't run, for this reason.
 */
type Ending =
  | { readonly _tag: "Finished" }
  | { readonly _tag: "Again" }
  | { readonly _tag: "Interrupted" }
  | { readonly _tag: "Unrunnable"; readonly reason: string };
const finished: Ending = { _tag: "Finished" };
const again: Ending = { _tag: "Again" };
const interrupted: Ending = { _tag: "Interrupted" };
const unrunnable = (reason: string): Ending => ({ _tag: "Unrunnable", reason });

/**
 * What the log records: everything the environment and its harness report except streaming
 * deltas, which only show readers a block while it streams.
 */
const recorded = (event: Environment.Event): ReadonlyArray<Environment.Event> =>
  event._tag === "Harness" &&
  (event.event._tag === "TextDelta" || event.event._tag === "ReasoningDelta")
    ? []
    : [event];

/** The session was prepared and is not released while the run works in it. */
const unexpected = {
  "Harness.NotPrepared": Effect.die,
  "Environment.Released": Effect.die,
} as const;

/** How often a running turn shows its readers more of a response it is writing. */
const draftInterval = 150;
/** The most text one draft carries, so a signal stays small wherever it is relayed. */
const draftPiece = 1500;

/** A duration in words, as the turn's readers see it in an interruption. */
const inWords = (duration: Duration.Duration) => {
  const seconds = Math.round(Duration.toSeconds(duration));
  return seconds % 60 === 0
    ? `${seconds / 60} minute${seconds === 60 ? "" : "s"}`
    : `${seconds} second${seconds === 1 ? "" : "s"}`;
};

/** What a turn's readers know its model access by: the connection's name, and the model's. */
interface Named {
  readonly connection: string;
  readonly model: string;
}

/**
 * Why a run stopped, in words for the turn's readers: its problem, naming the connection and
 * model, never the provider's own message, which can name addresses they should not see.
 */
const words = (problem: HarnessErrors.Problem, named: Named, idle: string): string => {
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

/**
 * How many characters of conversation one summary request reads at most: less when the model's
 * budget is smaller, so each request fits its model.
 */
const summaryPass = 200_000;

/** How long a turn waits before running again after its `attempt`th failure: 2, 4, then 8 seconds. */
const backoff = (attempt: number) => Duration.seconds(2 ** Math.min(attempt, 6));

/** @category constructors */
export const make = Effect.fn("TurnRunner.make")(function* (options: Options) {
  const gateway = yield* Gateway.Service;
  const crypto = yield* Crypto.Crypto;
  const harnesses = new Map(options.harnesses.map((harness) => [harness.name as string, harness]));
  const models = new Map(options.models.map((model) => [model.declaration.id as string, model]));
  const checkInterval = Duration.fromInputUnsafe(options.checkInterval ?? "1 second");
  const retries = options.retries ?? 3;
  const inputWait = Duration.fromInputUnsafe(options.inputWait ?? "1 minute");
  const idleTimeout = Duration.fromInputUnsafe(options.idleTimeout ?? "5 minutes");
  const idle = inWords(idleTimeout);
  const policy: ContextPolicy = { ...defaultContextPolicy, ...options.context };
  /** Whether the plan's conversation needs a checkpoint before its model reads it, and what. */
  const compactionFor = (
    plan: TurnExecution.Plan,
    model: ModelInference.Implementation,
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
      compaction: TurnLog.compaction(plan.transcript, plan.waiting, {
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
  const silent = new HarnessErrors.ExecutionFailed({
    reason: `The model sent nothing for ${idle}.`,
    retryable: true,
    problem: "model-silent",
  });

  const run = Effect.fn("TurnRunner.run")(function* (workspaceId: Workspace.Id, turnId: Turn.Id) {
    const step = <A, E>(use: (turnExecution: TurnExecution.Interface) => Effect.Effect<A, E>) =>
      gateway.executeTurns(workspaceId, Effect.flatMap(TurnExecution.Service, use));
    const prepare = step((turnExecution) => turnExecution.prepare(turnId));

    /**
     * Hand the harness input the turn accepted, recorded first so its incorporation counts: the
     * batch as the log recorded it, which a restart submits again unchanged.
     */
    const submit = Effect.fnUntraced(function* (
      running: Environment.Running,
      pending: NonNullable<TurnExecution.Plan["pending"]>,
    ) {
      // The same range of input always gets the same batch, so submitting it again after a
      // restart records it once.
      const batchId = HarnessEvent.BatchId.make(
        `${turnId}/after:${pending.afterSequence}/through:${pending.throughSequence}`,
      );
      const items = yield* step((turnExecution) =>
        turnExecution.submitted(turnId, {
          batchId,
          throughSequence: pending.throughSequence,
          items: pending.items,
        }),
      );
      yield* running.submit({ id: batchId, items }).pipe(Effect.catchTags(unexpected));
    });

    /**
     * One harness session: from the plan's conversation until the turn closes, can't go on, or
     * its context is full, which a checkpoint then shortens for a new session.
     */
    const session = Effect.fnUntraced(function* (
      plan: TurnExecution.Plan,
      harness: Harness.Interface<ModelAccess>,
      model: ModelInference.Implementation,
      budget: number,
    ) {
      const access = yield* Layer.build(
        model.languageModel(
          { settings: plan.connection.settings, credential: plan.connection.credential },
          { model: plan.selection.model },
        ),
      );
      const sessionId = `session-${yield* Effect.orDie(crypto.randomUUIDv4)}`;
      const spawned = yield* Environment.spawn(
        { id: Environment.DefinitionId.make(plan.environment.id), harness },
        {
          sessionId,
          instructions: plan.instructions,
          contextLimit: budget,
          measured: plan.measured,
        },
      ).pipe(Effect.provideContext(access), Effect.result);
      if (Result.isFailure(spawned)) {
        yield* Effect.logWarning("Turn environment did not start", {
          workspaceId,
          turnId,
          failure: spawned.failure,
        });
        return unrunnable("The agent's environment couldn't start.");
      }
      const running = spawned.success;
      yield* Effect.addFinalizer(() => Effect.ignore(running.release));

      const transcript = plan.transcript;
      const summary = Transcript.summarize(transcript);
      if (Result.isFailure(summary)) {
        yield* Effect.logWarning("Turn transcript is invalid", {
          workspaceId,
          turnId,
          reason: summary.failure,
        });
        return unrunnable("The agent's conversation so far couldn't be continued.");
      }
      if (summary.success.pending.length > 0)
        return unrunnable("The turn is waiting on tool calls, which can't run yet.");
      const prepared = yield* Effect.result(running.prepare(transcript));
      if (Result.isFailure(prepared)) {
        yield* Effect.logWarning("Turn transcript was refused", {
          workspaceId,
          turnId,
          failure: prepared.failure,
        });
        return unrunnable("The agent's conversation so far couldn't be continued.");
      }

      const pull = yield* Stream.toPull(running.events);
      /** Text of each response block not yet shown to readers, and how much of it they have. */
      const drafts = new Map<
        string,
        { readonly responseId: string; readonly part: number; offset: number; pending: string }
      >();
      let shownAt = Number.NEGATIVE_INFINITY;
      /** Show readers what the harness wrote since the last draft, best effort. */
      const showDrafts = Effect.gen(function* () {
        if (![...drafts.values()].some((draft) => draft.pending !== "")) return;
        shownAt = yield* Clock.currentTimeMillis;
        for (const draft of drafts.values()) {
          while (draft.pending !== "") {
            const text = draft.pending.slice(0, draftPiece);
            yield* step((turnExecution) =>
              turnExecution.draft(turnId, {
                responseId: draft.responseId,
                part: draft.part,
                offset: draft.offset,
                text,
              }),
            ).pipe(Effect.catchCause((cause) => Effect.logDebug("Draft not shown", cause)));
            draft.offset += text.length;
            draft.pending = draft.pending.slice(text.length);
          }
        }
      });
      /** Calls the harness started that have no result yet: while one runs, silence is its. */
      const started = new Set<string>();
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
      /**
       * Record what the harness reports until it is idle or its context is full. While it waits on
       * the model, a silence longer than the idle timeout interrupts the run, so a model that
       * stops answering does not hold the turn.
       */
      const untilIdle = Effect.gen(function* () {
        for (;;) {
          const chunk = yield* started.size > 0
            ? next
            : next.pipe(
                Effect.timeoutOrElse({ duration: idleTimeout, orElse: () => Effect.fail(silent) }),
              );
          for (const item of chunk) {
            if (item._tag !== "Harness") continue;
            const event = item.event;
            if (event._tag === "ToolCallStarted") started.add(event.callId);
            else if (event._tag === "ToolCallCompleted") started.delete(event.result.callId);
            else if (event._tag === "TextDelta") {
              const key = `${event.responseId}\u0000${event.part}`;
              const draft = drafts.get(key) ?? {
                responseId: event.responseId,
                part: event.part,
                offset: 0,
                pending: "",
              };
              draft.pending += event.delta;
              drafts.set(key, draft);
            } else if (event._tag === "BlockCompleted")
              // The completed block replaces its draft in the log.
              drafts.delete(`${event.responseId}\u0000${event.part}`);
          }
          if ((yield* Clock.currentTimeMillis) - shownAt >= draftInterval) yield* showDrafts;
          const events = chunk.flatMap(recorded);
          if (events.length > 0)
            yield* step((turnExecution) => turnExecution.report(turnId, events));
          if (events.some((item) => item._tag === "Harness" && item.event._tag === "ContextFull"))
            return "full" as const;
          const last = events.at(-1);
          if (last?._tag === "Harness" && last.event._tag === "Idle") return "idle" as const;
        }
      });

      let working = true;
      if (plan.pending !== undefined) yield* submit(running, plan.pending);
      else if (summary.success.awaitsResponse)
        yield* running.resume.pipe(Effect.catchTags(unexpected));
      else working = false;
      let waitingSince: number | undefined;
      for (;;) {
        // A full context ends the session without closing: a checkpoint comes first.
        if (working && (yield* untilIdle) === "full") return again;
        const closing = yield* step((turnExecution) => turnExecution.close(turnId));
        if (closing._tag !== "InputPending") return finished;
        // More input came for the agent: take in what it accepted, or wait while it accepts.
        const next = yield* prepare;
        if (next._tag !== "Ready") return again;
        if (next.plan.pending !== undefined) {
          // Input that would take the conversation past its budget waits for a checkpoint, in a
          // new session.
          if (compactionFor(next.plan, model).compaction !== undefined) return again;
          yield* submit(running, next.plan.pending);
          working = true;
          waitingSince = undefined;
          continue;
        }
        const now = yield* Clock.currentTimeMillis;
        waitingSince ??= now;
        if (now - waitingSince >= Duration.toMillis(inputWait))
          return unrunnable("Input the agent accepted never arrived.");
        working = false;
        yield* Effect.sleep(checkInterval);
      }
    });

    /** Resolves once the turn is no longer running, as when someone asks it to stop. */
    const stopped = Effect.gen(function* () {
      for (;;) {
        yield* Effect.sleep(checkInterval);
        const turn = yield* step((turnExecution) => turnExecution.get(turnId));
        if (turn.status !== "running") return again;
      }
    });

    /**
     * Record a checkpoint before working: the turn's model summarizes the older history and any
     * input it covers, in passes that each fit a request. A summary that fails or stays silent
     * past the idle timeout stops the run as an interruption, which is retried like any other, so
     * nothing is left out for want of a summary.
     */
    const checkpoint = Effect.fnUntraced(function* (
      plan: TurnExecution.Plan,
      model: ModelInference.Implementation,
      compaction: TurnLog.Compaction,
      budget: number,
    ) {
      const summary = yield* Compaction.summarize(compaction.summarize, {
        passSize: Math.min(summaryPass, budget * Transcript.charactersPerToken),
        timeout: idleTimeout,
      }).pipe(
        Effect.provide(
          model.languageModel(
            { settings: plan.connection.settings, credential: plan.connection.credential },
            { model: plan.selection.model },
          ),
        ),
      );
      yield* step((turnExecution) =>
        turnExecution.checkpoint(turnId, {
          summary,
          kept: compaction.kept,
          through: compaction.through,
        }),
      );
      return again;
    });

    /**
     * Whether to wait before the next attempt: after an interruption worth retrying, and, when the
     * run begins, after an attempt that died, as the turn's log shows.
     */
    let rest: boolean | undefined;
    for (;;) {
      const preparation = yield* prepare;
      if (preparation._tag === "Finished") return;
      if (preparation._tag === "Stopping")
        return yield* step((turnExecution) => turnExecution.stopped(turnId));
      if (preparation._tag === "Unrunnable")
        return yield* step((turnExecution) => turnExecution.fail(turnId, preparation.reason));
      const plan = preparation.plan;
      const fail = (reason: string) => step((turnExecution) => turnExecution.fail(turnId, reason));
      const named = { connection: plan.connection.name, model: plan.selection.model };
      /**
       * Record why the run stopped, in words and as a problem, and run it again when that may
       * help, after a wait; the detail goes to the logs only.
       */
      const interrupt = (
        failure: HarnessErrors.ExecutionFailed | Compaction.Failed,
        text: string,
      ) =>
        Effect.gen(function* () {
          yield* step((turnExecution) =>
            turnExecution.interrupted(turnId, {
              reason: text,
              // A full context goes on after a checkpoint, however its provider classed it.
              retryable: failure.retryable || failure.problem === "model-context",
              problem: failure.problem,
            }),
          );
          const detail = {
            workspaceId,
            turnId,
            problem: failure.problem,
            reason: failure.reason,
            attempt: plan.attempts + 1,
          };
          // A request longer than the model's window is shortened by a checkpoint, at once.
          if (failure.problem === "model-context") {
            yield* Effect.logWarning("Turn context full", detail);
            return again;
          }
          if (!failure.retryable) {
            yield* Effect.logWarning("Turn failed", detail);
            return unrunnable(text);
          }
          yield* Effect.logWarning("Turn interrupted", detail);
          return interrupted;
        });
      if (plan.environment.sandbox !== null)
        return yield* fail("Environments with a sandbox can't run turns yet.");
      const harness = harnesses.get(plan.environment.harnessId);
      if (harness === undefined)
        return yield* fail(`The ${plan.environment.harnessId} harness doesn't run on this server.`);
      const model = models.get(plan.connection.implementationId);
      if (model === undefined)
        return yield* fail(`${plan.connection.name}'s models can't run on this server.`);
      if (plan.turn.status === "queued") {
        // Starting may record the thread's history in the agent's log, so prepare again after it;
        // a turn stopped before it started is found finished.
        yield* step((turnExecution) => turnExecution.start(turnId, plan.selection)).pipe(
          Effect.catchTag("TurnApplication.NotActive", () => Effect.void),
        );
        continue;
      }
      // A turn that keeps stopping without getting further is given up; before running it again,
      // it waits longer each time, whether its last run was interrupted or died.
      if (plan.attempts > retries) {
        yield* Effect.logWarning("Turn given up", {
          workspaceId,
          turnId,
          attempts: plan.attempts,
          problem: plan.interruption?.problem,
        });
        return yield* fail(
          plan.interruption?.reason ?? "The turn kept stopping before it got anywhere.",
        ).pipe(Effect.catchTag("TurnApplication.NotActive", () => Effect.void));
      }
      const waits = rest ?? plan.diedLast;
      rest = false;
      if (waits) {
        yield* Effect.sleep(backoff(plan.attempts));
        continue;
      }
      // A checkpoint the history needs comes first; either stops the same way when interrupted.
      // A context that proved full owes a checkpoint however the estimate stands, which keeps less
      // each time it proves full again before the model answers; past that, or when a checkpoint
      // would free nothing, even a summary does not make it fit.
      const tooLong = `The conversation no longer fits in ${plan.selection.model}'s context window, even summarized.`;
      if (plan.overflow.pending && plan.overflow.count > policy.shrinks)
        return yield* fail(tooLong);
      const { compaction, budget } = compactionFor(plan, model, {
        force: plan.overflow.pending,
        shrink: plan.overflow.pending ? plan.overflow.count - 1 : 0,
      });
      if (plan.overflow.pending && compaction === undefined) return yield* fail(tooLong);
      yield* step((turnExecution) =>
        turnExecution.attempt(turnId, compaction === undefined ? "session" : "summary"),
      );
      type Work = ReturnType<typeof session> | ReturnType<typeof checkpoint>;
      const ending = yield* Effect.suspend(
        (): Effect.Effect<Effect.Success<Work>, Effect.Error<Work>, Effect.Services<Work>> =>
          compaction === undefined
            ? session(plan, harness, model, budget)
            : checkpoint(plan, model, compaction, budget),
      ).pipe(
        Effect.raceFirst(stopped),
        Effect.scoped,
        Effect.catchTags({
          "Harness.ExecutionFailed": (failure) =>
            interrupt(failure, words(failure.problem, named, idle)),
          "Compaction.Failed": (failure) =>
            interrupt(
              failure,
              `The earlier conversation couldn't be summarized. ${words(failure.problem, named, idle)}`,
            ),
        }),
      );
      if (ending._tag === "Finished") return;
      rest = ending._tag === "Interrupted";
      if (ending._tag === "Unrunnable")
        return yield* fail(ending.reason).pipe(
          Effect.catchTag("TurnApplication.NotActive", () => Effect.void),
        );
    }
  });

  const abandon = Effect.fn("TurnRunner.abandon")(function* (
    workspaceId: Workspace.Id,
    turnId: Turn.Id,
  ) {
    yield* gateway
      .executeTurns(
        workspaceId,
        Effect.flatMap(TurnExecution.Service, (turnExecution) =>
          turnExecution.fail(turnId, "The turn could not run."),
        ),
      )
      .pipe(Effect.catchTag("TurnApplication.NotActive", () => Effect.void));
  });

  return Service.of({ run, abandon });
});

/** @category layers */
export const layer = (options: Options) => Layer.effect(Service, make(options));

export * as TurnRunner from "./runner.ts";
