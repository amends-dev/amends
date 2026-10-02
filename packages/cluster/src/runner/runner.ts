/**
 * Runs the turns agents accepted. A run reads where its turn stands, decides the next step from
 * that alone, performs it, and reads again, until the turn ends: it starts a queued turn, rests
 * after an interruption, summarizes history too long for the model, or works in a harness session
 * until closing the turn publishes the agent's reply. Each step is its own commit through the
 * gateway, so a run cut short continues from the turn's log.
 *
 * - `NextStep` decides what to do from what `prepare` read.
 * - The run spawns the agent's environment for its first session, acquiring the one the turn's log
 *   recorded, and releases it once the turn ends.
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
import { Context, Effect, Layer, Result } from "effect";
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
  /** Fail a turn its runs could not finish, unless it already finished. */
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
  const settings = RunnerSettings.fromOptions(options);

  const run = Effect.fn("TurnRunner.run")(function* (workspaceId: Workspace.Id, turnId: Turn.Id) {
    const turnSteps = TurnSteps.make(gateway, workspaceId, turnId);
    // Whether to rest before the next attempt, as after one that was interrupted; until the
    // run's first attempt, the turn's log says, by an attempt that died.
    let restBeforeAttempt: boolean | undefined;
    // The environment the run's sessions work in, spawned for the first of them.
    let environment: Environment.Running | undefined;
    const runAttempt = Effect.fnUntraced(function* (
      step: Attempt.Step,
      attempt: Parameters<typeof Attempt.run>[3],
    ) {
      const ending = yield* Attempt.run(turnSteps, settings, step, attempt);
      if (Ending.$is("Finished")(ending)) return false;
      if (Ending.$is("Unrunnable")(ending)) {
        yield* turnSteps.fail(ending.reason);
        return false;
      }
      restBeforeAttempt = Ending.$is("Interrupted")(ending);
      return true;
    });
    /**
     * Work in a harness session in the agent's environment, spawned for the run's first session,
     * acquiring the one the turn's log recorded if it still exists, and recorded.
     */
    const workInSession = Effect.fnUntraced(function* (
      step: Extract<NextStep.Step, { readonly _tag: "Work" }>,
    ) {
      if (environment === undefined) {
        const spawned = yield* Effect.result(
          environments.spawn(step.plan.environment, { reacquire: step.plan.reacquire }),
        );
        if (Result.isFailure(spawned)) {
          yield* Effect.logWarning("Turn environment did not start", {
            ...turnSteps.ids,
            failure: spawned.failure,
          });
          yield* turnSteps.fail(describeSpawnFailure(spawned.failure));
          return false;
        }
        environment = spawned.success;
        yield* turnSteps.recordEnvironment({
          reference: environment.reference,
          filesystem: environment.filesystem,
        });
      }
      return yield* runAttempt(step, Session.run(turnSteps, settings, step, environment));
    });
    for (;;) {
      const step = NextStep.decide(yield* turnSteps.prepare, settings, restBeforeAttempt);
      const continueRunning = yield* NextStep.Step.$match(step, {
        Done: () => Effect.succeed(false),
        ConfirmStop: () => Effect.as(turnSteps.confirmStopped, false),
        Fail: ({ reason }) => Effect.as(turnSteps.fail(reason), false),
        GiveUp: ({ reason, attempts, problem }) =>
          Effect.gen(function* () {
            yield* Effect.logWarning("Turn given up", { ...turnSteps.ids, attempts, problem });
            yield* turnSteps.fail(reason);
            return false;
          }),
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
    // The turn ended: its environment applies its retention. A run cut short leaves it as it is,
    // for the next run to acquire again.
    if (environment !== undefined)
      yield* environment.release.pipe(
        Effect.catch((failure) =>
          Effect.logWarning("Turn environment was not released", { ...turnSteps.ids, failure }),
        ),
      );
  });

  const abandon = Effect.fn("TurnRunner.abandon")(function* (
    workspaceId: Workspace.Id,
    turnId: Turn.Id,
  ) {
    yield* TurnSteps.make(gateway, workspaceId, turnId).fail("The turn could not run.");
  });

  return Service.of({ run, abandon });
});

/** @category layers */
export const layer = (options: Options) => Layer.effect(Service, make(options));

export * as TurnRunner from "./runner.ts";
