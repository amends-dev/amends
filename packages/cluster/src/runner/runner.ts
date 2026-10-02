/**
 * Runs the turns agents accepted. A run reads where its turn stands, decides the next step from
 * that alone, performs it, and reads again, until the turn ends: it starts a queued turn, rests
 * after an interruption, summarizes history too long for the model, or works in a harness session
 * until closing the turn publishes the agent's reply. Each step is its own commit through the
 * gateway, so a run cut short continues from the turn's log.
 *
 * - `NextStep` decides what to do from what `prepare` read.
 * - The run spawns the agent's environment for its first session, acquiring the one the turn's log
 *   recorded, and releases it once the turn ends. A run that ends the turn without spawning releases
 *   the one an earlier run left, as does abandoning the turn.
 * - `Attempt` runs a session (`Session`) or a summary (`Checkpoint`) until it ends or the turn is
 *   asked to stop, recording a failure as the turn's interruption.
 * - `TurnSteps` are the commits a run makes for its turn.
 */
import type { TurnExecution } from "@amends/core/turn";
import type { Turn } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Environment } from "@amends/environment";
import { Gateway } from "@amends/gateway";
import type { GatewayErrors } from "@amends/gateway";
import { Context, Crypto, Effect, Layer, Result } from "effect";
import { Attempt } from "./attempt.ts";
import { Checkpoint } from "./checkpoint.ts";
import { Ending } from "./ending.ts";
import { NextStep } from "./next-step.ts";
import { Session } from "./session.ts";
import { RunnerSettings } from "./settings.ts";
import type { Options } from "./settings.ts";
import { TurnSteps } from "./turn-steps.ts";

export { contextBudget } from "./context-budget.ts";
export { defaultContextPolicy } from "./settings.ts";
export type { ContextPolicy, Options } from "./settings.ts";

/** A step through the gateway failed; the turn stays as its last commit left it. */
export type Failure =
  | GatewayErrors.PublicErrorOf<TurnExecution.PrepareError | TurnExecution.CloseError>
  | GatewayErrors.WorkspaceNotFound;

export interface Interface {
  /**
   * Run a turn until it closes, stops, or fails. A turn already finished is left as it is, and a
   * running one continues from its log.
   */
  readonly run: (workspaceId: Workspace.Id, turnId: Turn.Id) => Effect.Effect<void, Failure>;
  /**
   * Fail a turn its runs could not finish, unless it already finished, and release the running
   * environment its log names.
   */
  readonly abandon: (workspaceId: Workspace.Id, turnId: Turn.Id) => Effect.Effect<void, Failure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/cluster/runner/Service",
) {}

/** Why the agent's environment could not start, in words for the turn's readers. */
const describeSpawnFailure = (failure: Environment.SpawnError): string => {
  switch (failure._tag) {
    case "Environment.HarnessUnavailable":
      return `The ${failure.harnessId} harness doesn't run on this server.`;
    case "Environment.SandboxUnavailable":
      return `The ${failure.providerId} sandbox doesn't run on this server.`;
    case "Environment.UnsupportedPlatform":
      return `The harness can't run on the sandbox's system, ${failure.platform}.`;
    default:
      return "The agent's environment couldn't start.";
  }
};

/** @category constructors */
export const make = Effect.fn("TurnRunner.make")(function* (options: Options) {
  const gateway = yield* Gateway.Service;
  const environments = yield* Environment.Service;
  const crypto = yield* Crypto.Crypto;
  const settings = RunnerSettings.fromOptions(options);

  /**
   * Release the running environment the turn's log names, applying its retention, for one a run
   * that ended short left behind. A failure is logged: nothing else would release it.
   */
  const releaseAcquired = (turnSteps: TurnSteps.Interface) =>
    turnSteps.readAcquiredEnvironment.pipe(
      Effect.flatMap((acquired) =>
        acquired === undefined
          ? Effect.void
          : environments.release(
              acquired.environment,
              acquired.reference,
              acquired.sandboxConnection,
            ),
      ),
      Effect.catch((failure) =>
        Effect.logWarning("Turn environment was not released", { ...turnSteps.ids, failure }),
      ),
    );

  const run = Effect.fn("TurnRunner.run")(
    function* (workspaceId: Workspace.Id, turnId: Turn.Id) {
      const turnSteps = TurnSteps.make(gateway, workspaceId, turnId);
      // Whether to rest before the next attempt, as after one that was interrupted; until the
      // run's first attempt, the turn's log says, by an attempt that died.
      let restBeforeAttempt: boolean | undefined;
      // The environment the run's sessions work in, spawned for the first of them.
      let environment: Environment.Running | undefined;
      // Whether this run ended the turn, so an environment an earlier run left is released.
      let endedHere = false;
      /** End the turn with `step`, and stop running it. */
      const endTurn = <E>(step: Effect.Effect<void, E>) =>
        Effect.map(step, () => {
          endedHere = true;
          return false;
        });
      const runAttempt = Effect.fnUntraced(function* (
        step: Attempt.Step,
        attempt: Parameters<typeof Attempt.run>[3],
      ) {
        const ending = yield* Attempt.run(turnSteps, settings, step, attempt);
        if (Ending.$is("Finished")(ending)) return false;
        if (Ending.$is("Unrunnable")(ending)) {
          yield* turnSteps.fail(ending.reason);
          endedHere = true;
          return false;
        }
        restBeforeAttempt = Ending.$is("Interrupted")(ending);
        // The environment stopped under the session: spawn it again for the next attempt, which
        // acquires the same sandbox if it is still there, or a new one in its place.
        if (Ending.$is("Interrupted")(ending) && ending.problem === "ended")
          environment = undefined;
        return true;
      });
      /**
       * Work in a harness session in the agent's environment. The run's first session spawns it,
       * acquiring the one the turn's log recorded if it still exists, and records it, then reads
       * the log again: recording a new sandbox in place of one that is gone adds a note for the
       * agent.
       */
      const workInSession = Effect.fnUntraced(function* (
        step: Extract<NextStep.Step, { readonly _tag: "Work" }>,
      ) {
        if (environment === undefined) {
          const spawned = yield* Effect.result(
            environments.spawn(step.plan.environment, {
              reacquire: step.plan.reacquire,
              sandboxConnection: step.plan.sandboxConnection,
            }),
          );
          if (Result.isFailure(spawned)) {
            yield* Effect.logWarning("Turn environment did not start", {
              ...turnSteps.ids,
              failure: spawned.failure,
            });
            yield* turnSteps.fail(describeSpawnFailure(spawned.failure));
            endedHere = true;
            return false;
          }
          environment = spawned.success;
          yield* turnSteps.recordEnvironment({
            reference: environment.reference,
            filesystem: environment.filesystem,
          });
          return true;
        }
        return yield* runAttempt(step, Session.run(turnSteps, settings, step, environment));
      });
      for (;;) {
        const step = NextStep.decide(yield* turnSteps.prepare, settings, restBeforeAttempt);
        const continueRunning = yield* NextStep.Step.$match(step, {
          Done: () => Effect.succeed(false),
          ConfirmStop: () => endTurn(turnSteps.confirmStopped),
          Fail: ({ reason }) => endTurn(turnSteps.fail(reason)),
          GiveUp: ({ reason, attempts, problem }) =>
            Effect.logWarning("Turn given up", { ...turnSteps.ids, attempts, problem }).pipe(
              Effect.andThen(endTurn(turnSteps.fail(reason))),
            ),
          Start: ({ selection }) => Effect.as(turnSteps.start(selection), true),
          Rest: ({ delay }) =>
            Effect.gen(function* () {
              yield* Effect.sleep(delay);
              restBeforeAttempt = false;
              return true;
            }),
          Summarize: (step) => runAttempt(step, Checkpoint.record(turnSteps, settings, step)),
          Work: workInSession,
        });
        if (!continueRunning) break;
      }
      // The turn ended: its environment applies its retention, the one this run spawned or, when it
      // ended the turn without one, the one an earlier run left. A run cut short leaves it as it is,
      // for the next run to acquire again.
      if (environment !== undefined)
        yield* environment.release.pipe(
          Effect.catch((failure) =>
            Effect.logWarning("Turn environment was not released", { ...turnSteps.ids, failure }),
          ),
        );
      else if (endedHere) yield* releaseAcquired(turnSteps);
    },
    // The sandbox provider the run's environment was spawned with lasts as long as the run.
    Effect.scoped,
    Effect.provideService(Crypto.Crypto, crypto),
  );

  const abandon = Effect.fn("TurnRunner.abandon")(function* (
    workspaceId: Workspace.Id,
    turnId: Turn.Id,
  ) {
    const turnSteps = TurnSteps.make(gateway, workspaceId, turnId);
    yield* turnSteps.fail("The turn could not run.");
    yield* releaseAcquired(turnSteps);
  });

  return Service.of({ run, abandon });
});

/** @category layers */
export const layer = (options: Options) => Layer.effect(Service, make(options));

export * as TurnRunner from "./runner.ts";
