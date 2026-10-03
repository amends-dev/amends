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
  // Each step holds the workspace only while it runs, so a step after another host changed it
  // uses the workspace prepared again.
  const executeTurnStep = <A, E>(
    call: (turnExecution: TurnExecution.Interface) => Effect.Effect<A, E>,
  ) => Effect.scoped(gateway.inWorkspace(workspaceId, Effect.flatMap(TurnExecution.Service, call)));
  return {
    /** The turn, as log fields. */
    ids: { workspaceId, turnId },
    get: executeTurnStep((turnExecution) => turnExecution.get(turnId)),
    prepare: executeTurnStep((turnExecution) => turnExecution.prepare(turnId)),
    start: (selection: Argument<"start">) =>
      executeTurnStep((turnExecution) => turnExecution.start(turnId, selection)).pipe(
        Effect.asVoid,
        Effect.catchTag("TurnService.NotActive", () => Effect.void),
      ),
    recordAttempt: (kind: Argument<"recordAttempt">) =>
      executeTurnStep((turnExecution) => turnExecution.recordAttempt(turnId, kind)),
    recordSubmission: (batch: Argument<"recordSubmission">) =>
      executeTurnStep((turnExecution) => turnExecution.recordSubmission(turnId, batch)),
    recordEvents: (events: Argument<"recordEvents">) =>
      executeTurnStep((turnExecution) => turnExecution.recordEvents(turnId, events)),
    recordEnvironment: (acquired: Argument<"recordEnvironment">) =>
      executeTurnStep((turnExecution) => turnExecution.recordEnvironment(turnId, acquired)),
    recordSession: (sessionId: string) =>
      executeTurnStep((turnExecution) => turnExecution.recordSession(turnId, sessionId)),
    readAcquiredEnvironment: executeTurnStep((turnExecution) =>
      turnExecution.readAcquiredEnvironment(turnId),
    ),
    showDraft: (piece: Argument<"showDraft">) =>
      executeTurnStep((turnExecution) => turnExecution.showDraft(turnId, piece)),
    recordInterruption: (stop: Argument<"recordInterruption">) =>
      executeTurnStep((turnExecution) => turnExecution.recordInterruption(turnId, stop)),
    recordCheckpoint: (checkpoint: Argument<"recordCheckpoint">) =>
      executeTurnStep((turnExecution) => turnExecution.recordCheckpoint(turnId, checkpoint)),
    close: executeTurnStep((turnExecution) => turnExecution.close(turnId)),
    fail: (reason: string) =>
      executeTurnStep((turnExecution) => turnExecution.fail(turnId, reason)).pipe(
        Effect.catchTag("TurnService.NotActive", () => Effect.void),
      ),
    confirmStopped: executeTurnStep((turnExecution) => turnExecution.confirmStopped(turnId)),
  };
};

export type Interface = ReturnType<typeof make>;

export * as TurnSteps from "./turn-steps.ts";
