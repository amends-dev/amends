/**
 * Runs the turns agents accepted. A run reads where its turn stands, decides the next step from
 * that alone, performs it, and reads again, until the turn ends: it starts a queued turn, rests
 * after an interruption, summarizes history too long for the model, or works in a harness session
 * until closing the turn publishes the agent's reply. Each step is its own commit through the
 * gateway, so a run cut short continues from the turn's log.
 *
 * - `NextStep` decides what to do from what `prepare` read.
 * - `Attempt` runs a session (`Session`) or a summary (`Checkpoint`) until it ends or the turn is
 *   asked to stop, recording a failure as the turn's interruption.
 * - `TurnSteps` are the commits a run makes for its turn.
 */
import type { TurnExecution } from "@amends/core/turn";
import type { Turn } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import type { GatewayErrors } from "@amends/gateway";
import { Context, Crypto, Effect, Layer } from "effect";
import { Attempt } from "./attempt.ts";
import { NextStep } from "./next-step.ts";
import { RunnerSettings } from "./settings.ts";
import type { Options } from "./settings.ts";
import { TurnSteps } from "./turn-steps.ts";

export { contextBudget } from "./context-budget.ts";
export { defaultContextPolicy } from "./settings.ts";
export type { ContextPolicy, ModelAccess, Options } from "./settings.ts";

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

/** @category constructors */
export const make = Effect.fn("TurnRunner.make")(function* (options: Options) {
  const gateway = yield* Gateway.Service;
  const crypto = yield* Crypto.Crypto;
  const settings = RunnerSettings.resolve(options);

  const run = Effect.fn("TurnRunner.run")(
    function* (workspaceId: Workspace.Id, turnId: Turn.Id) {
      const turn = TurnSteps.make(gateway, workspaceId, turnId);
      // Whether to rest before the next attempt, as after one that was interrupted; until the
      // run's first attempt, the turn's log says, by an attempt that died.
      let rest: boolean | undefined;
      for (;;) {
        const step = NextStep.decide(yield* turn.prepare, settings, rest);
        switch (step._tag) {
          case "Done":
            return;
          case "ConfirmStop":
            return yield* turn.confirmStopped;
          case "Fail":
            return yield* turn.fail(step.reason);
          case "GiveUp":
            yield* Effect.logWarning("Turn given up", {
              ...turn.ids,
              attempts: step.attempts,
              problem: step.problem,
            });
            return yield* turn.fail(step.reason);
          case "Start":
            yield* turn.start(step.selection);
            break;
          case "Rest":
            yield* Effect.sleep(step.delay);
            rest = false;
            break;
          case "Summarize":
          case "Work": {
            const ending = yield* Attempt.run(turn, settings, step);
            if (ending._tag === "Finished") return;
            if (ending._tag === "Unrunnable") return yield* turn.fail(ending.reason);
            rest = ending._tag === "Interrupted";
          }
        }
      }
    },
    Effect.provideService(Crypto.Crypto, crypto),
  );

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
