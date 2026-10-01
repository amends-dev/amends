/**
 * What a runner records for one turn, each step its own commit through the gateway, attributed to
 * the turn's agent. A turn no longer active, as one that finished meanwhile, is left as it is by
 * the steps that would only end it.
 */
import { TurnExecution } from "@amends/core/turn";
import type { Turn } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import type { Gateway } from "@amends/gateway";
import { Effect } from "effect";

type Argument<K extends keyof TurnExecution.Interface> = TurnExecution.Interface[K] extends (
  turnId: Turn.Id,
  argument: infer A,
) => unknown
  ? A
  : never;

/** @category constructors */
export const make = (gateway: Gateway.Interface, workspaceId: Workspace.Id, turnId: Turn.Id) => {
  const step = <A, E>(use: (turnExecution: TurnExecution.Interface) => Effect.Effect<A, E>) =>
    gateway.executeTurns(workspaceId, Effect.flatMap(TurnExecution.Service, use));
  return {
    /** The turn, as log fields. */
    ids: { workspaceId, turnId },
    get: step((turnExecution) => turnExecution.get(turnId)),
    prepare: step((turnExecution) => turnExecution.prepare(turnId)),
    start: (selection: Argument<"start">) =>
      step((turnExecution) => turnExecution.start(turnId, selection)).pipe(
        Effect.asVoid,
        Effect.catchTag("TurnService.NotActive", () => Effect.void),
      ),
    recordAttempt: (kind: Argument<"recordAttempt">) =>
      step((turnExecution) => turnExecution.recordAttempt(turnId, kind)),
    recordSubmission: (batch: Argument<"recordSubmission">) =>
      step((turnExecution) => turnExecution.recordSubmission(turnId, batch)),
    recordEvents: (events: Argument<"recordEvents">) =>
      step((turnExecution) => turnExecution.recordEvents(turnId, events)),
    showDraft: (piece: Argument<"showDraft">) =>
      step((turnExecution) => turnExecution.showDraft(turnId, piece)),
    recordInterruption: (stop: Argument<"recordInterruption">) =>
      step((turnExecution) => turnExecution.recordInterruption(turnId, stop)),
    recordCheckpoint: (checkpoint: Argument<"recordCheckpoint">) =>
      step((turnExecution) => turnExecution.recordCheckpoint(turnId, checkpoint)),
    close: step((turnExecution) => turnExecution.close(turnId)),
    fail: (reason: string) =>
      step((turnExecution) => turnExecution.fail(turnId, reason)).pipe(
        Effect.catchTag("TurnService.NotActive", () => Effect.void),
      ),
    confirmStopped: step((turnExecution) => turnExecution.confirmStopped(turnId)),
  };
};

export type Interface = ReturnType<typeof make>;

export * as TurnSteps from "./turn-steps.ts";
