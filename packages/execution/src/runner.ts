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
  /** How many times a turn runs again after a failure worth retrying: three by default. */
  readonly retries?: number | undefined;
  /** How long a turn waits for input its agent is still accepting: a minute by default. */
  readonly inputWait?: Duration.Input | undefined;
}

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
 * run prepares it again; or it can't run, for this reason.
 */
type Ending =
  | { readonly _tag: "Finished" }
  | { readonly _tag: "Again" }
  | { readonly _tag: "Unrunnable"; readonly reason: string };
const finished: Ending = { _tag: "Finished" };
const again: Ending = { _tag: "Again" };
const unrunnable = (reason: string): Ending => ({ _tag: "Unrunnable", reason });

/** Streaming deltas are not recorded: only completed entries build the transcript. */
const recorded = (event: Environment.Event): ReadonlyArray<HarnessEvent.Event> =>
  event._tag === "Harness" &&
  event.event._tag !== "TextDelta" &&
  event.event._tag !== "ReasoningDelta"
    ? [event.event]
    : [];

/** The session was prepared and is not released while the run works in it. */
const unexpected = {
  "Harness.NotPrepared": Effect.die,
  "Environment.Released": Effect.die,
} as const;

/** How often a running turn shows its readers more of a response it is writing. */
const draftInterval = 150;
/** The most text one draft carries, so a signal stays small wherever it is relayed. */
const draftPiece = 1500;

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

  const run = Effect.fn("TurnRunner.run")(function* (workspaceId: Workspace.Id, turnId: Turn.Id) {
    const step = <A, E>(use: (execution: TurnExecution.Interface) => Effect.Effect<A, E>) =>
      gateway.executeTurns(workspaceId, Effect.flatMap(TurnExecution.Service, use));
    const prepare = step((execution) => execution.prepare(turnId));

    /** Hand the harness input the turn accepted, recorded first so its incorporation counts. */
    const submit = Effect.fnUntraced(function* (
      running: Environment.Running,
      pending: NonNullable<TurnExecution.Plan["pending"]>,
    ) {
      // The same range of input always gets the same batch, so submitting it again after a
      // restart records it once.
      const batchId = HarnessEvent.BatchId.make(`through:${pending.throughSequence}`);
      yield* step((execution) =>
        execution.submitted(turnId, { batchId, throughSequence: pending.throughSequence }),
      );
      yield* running
        .submit({ id: batchId, items: pending.items })
        .pipe(Effect.catchTags(unexpected));
    });

    /** One harness session: from the plan's conversation until the turn closes or can't go on. */
    const session = Effect.fnUntraced(function* (
      plan: TurnExecution.Plan,
      harness: Harness.Interface<ModelAccess>,
      model: ModelInference.Implementation,
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
        { sessionId, instructions: plan.instructions },
      ).pipe(Effect.provideContext(access), Effect.result);
      if (Result.isFailure(spawned))
        return unrunnable(`The environment could not start: ${spawned.failure._tag}.`);
      const running = spawned.success;
      yield* Effect.addFinalizer(() => Effect.ignore(running.release));

      const transcript = HarnessEvent.transcript(TurnLog.events(plan.log), plan.history);
      const summary = Transcript.summarize(transcript);
      if (Result.isFailure(summary))
        return unrunnable(`The conversation could not be continued: ${summary.failure}`);
      if (summary.success.pending.length > 0)
        return unrunnable("The turn is waiting on tool calls, which can't run yet.");
      const prepared = yield* Effect.result(running.prepare(transcript));
      if (Result.isFailure(prepared))
        return unrunnable(`The conversation could not be continued: ${prepared.failure._tag}.`);

      const pull = yield* Stream.toPull(running.events);
      /** Text of each response part not yet shown to readers, and how much of it they have. */
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
            yield* step((execution) =>
              execution.draft(turnId, {
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
      /** Record what the harness reports until it is idle. */
      const untilIdle = Effect.gen(function* () {
        for (;;) {
          const chunk = yield* pull.pipe(
            Pull.catchDone(() =>
              Effect.fail(
                new HarnessErrors.ExecutionFailed({
                  reason: "The environment ended before the turn finished.",
                  retryable: true,
                }),
              ),
            ),
          );
          for (const item of chunk) {
            if (item._tag !== "Harness") continue;
            const event = item.event;
            if (event._tag === "TextDelta") {
              const key = `${event.responseId}\u0000${event.part}`;
              const draft = drafts.get(key) ?? {
                responseId: event.responseId,
                part: event.part,
                offset: 0,
                pending: "",
              };
              draft.pending += event.delta;
              drafts.set(key, draft);
            } else if (event._tag === "ResponseCompleted")
              // The completed response replaces its draft in the log.
              for (const [key, draft] of drafts)
                if (draft.responseId === event.response.id) drafts.delete(key);
          }
          if ((yield* Clock.currentTimeMillis) - shownAt >= draftInterval) yield* showDrafts;
          const events = chunk.flatMap(recorded);
          if (events.length > 0) yield* step((execution) => execution.report(turnId, events));
          if (events.at(-1)?._tag === "Idle") return;
        }
      });

      let working = true;
      if (plan.pending !== undefined) yield* submit(running, plan.pending);
      else if (summary.success.awaitsResponse)
        yield* running.resume.pipe(Effect.catchTags(unexpected));
      else working = false;
      let waitingSince: number | undefined;
      for (;;) {
        if (working) yield* untilIdle;
        const closing = yield* step((execution) => execution.close(turnId));
        if (closing._tag !== "InputPending") return finished;
        // More input came for the agent: take in what it accepted, or wait while it accepts.
        const next = yield* prepare;
        if (next._tag !== "Ready") return again;
        if (next.plan.pending !== undefined) {
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
        const turn = yield* step((execution) => execution.get(turnId));
        if (turn.status !== "running") return again;
      }
    });

    let retried = 0;
    for (;;) {
      const preparation = yield* prepare;
      if (preparation._tag === "Finished") return;
      if (preparation._tag === "Stopping")
        return yield* step((execution) => execution.stopped(turnId));
      if (preparation._tag === "Unrunnable")
        return yield* step((execution) => execution.fail(turnId, preparation.reason));
      const plan = preparation.plan;
      const fail = (reason: string) => step((execution) => execution.fail(turnId, reason));
      if (plan.environment.sandbox !== null)
        return yield* fail("Environments with a sandbox can't run turns yet.");
      const harness = harnesses.get(plan.environment.harnessId);
      if (harness === undefined)
        return yield* fail(`The ${plan.environment.harnessId} harness doesn't run on this server.`);
      const model = models.get(plan.connection.implementationId);
      if (model === undefined)
        return yield* fail(`${plan.connection.implementationId} models can't run on this server.`);
      if (plan.turn.status === "queued") {
        const started = yield* step((execution) => execution.start(turnId, plan.selection)).pipe(
          Effect.as(true),
          // It was stopped before it started; preparing again finds it finished.
          Effect.catchTag("TurnApplication.NotActive", () => Effect.succeed(false)),
        );
        if (!started) continue;
      }

      const ending = yield* session(plan, harness, model).pipe(
        Effect.raceFirst(stopped),
        Effect.scoped,
        Effect.catchTag("Harness.ExecutionFailed", (failure) =>
          Effect.gen(function* () {
            yield* step((execution) =>
              execution.interrupted(turnId, {
                reason: failure.reason,
                retryable: failure.retryable,
              }),
            );
            if (!failure.retryable || retried >= retries) return unrunnable(failure.reason);
            retried += 1;
            yield* Effect.logWarning("Turn interrupted; running it again", {
              workspaceId,
              turnId,
              attempt: retried,
              reason: failure.reason,
            });
            yield* Effect.sleep(backoff(retried));
            return again;
          }),
        ),
      );
      if (ending._tag === "Finished") return;
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
        Effect.flatMap(TurnExecution.Service, (execution) =>
          execution.fail(turnId, "The turn could not run."),
        ),
      )
      .pipe(Effect.catchTag("TurnApplication.NotActive", () => Effect.void));
  });

  return Service.of({ run, abandon });
});

/** @category layers */
export const layer = (options: Options) => Layer.effect(Service, make(options));

export * as TurnRunner from "./runner.ts";
