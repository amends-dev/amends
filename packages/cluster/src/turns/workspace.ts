/**
 * The workspace, as a turn's run calls it: what core gives a host's jobs, with each call entering
 * the workspace through the gateway for itself, since a run holds the workspace only while a call
 * runs. The runner and the session log writer call these and know nothing of the gateway.
 */
import type * as Core from "@amends/core";
import type { ThreadParticipation } from "@amends/core/thread";
import {
  type SessionLog,
  SessionLogStore,
  type Turn,
  TurnExecution,
  type TurnJobs,
} from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { type Array, Effect, type Scope } from "effect";

/** @category constructors */
export const make = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  const gateway = yield* Gateway.Service;
  /** Run `program` in the workspace, holding it only while `program` runs. */
  const enter = <A, E>(program: Effect.Effect<A, E, Core.JobServices | Scope.Scope>) =>
    Effect.scoped(gateway.inWorkspace(workspaceId, program));
  /** Ask `call` of the workspace's turn execution, whose errors the gateway reports as public. */
  const turnExecution = <A, E>(
    call: (turnExecution: TurnExecution.Interface) => Effect.Effect<A, E>,
  ) => enter(Effect.flatMap(TurnExecution.Service, call));
  /**
   * Ask `call` of the workspace's session log store. The log takes part in no commit and its
   * errors are the writer's to handle, so they leave the workspace as they are, where the gateway
   * would report them as defects.
   */
  const sessionLogStore = <A, E>(
    call: (sessionLogStore: SessionLogStore.Interface) => Effect.Effect<A, E>,
  ) =>
    enter(Effect.flatMap(SessionLogStore.Service, (store) => Effect.result(call(store)))).pipe(
      Effect.flatMap(Effect.fromResult),
    );
  return {
    /** The agent's active turn in the thread, or a new one that accepts the work that waits. */
    accept: (job: TurnJobs.Job) => turnExecution((turnExecution) => turnExecution.accept(job)),
    /** Start the turn: `Ready` with what runs it, or `Idle` for one that ended as it stood. */
    start: (turnId: Turn.Id) => turnExecution((turnExecution) => turnExecution.start(turnId)),
    /** The conversation the turn's agent joined, for a session log that starts with it. */
    joinedConversation: (turnId: Turn.Id) =>
      turnExecution((turnExecution) => turnExecution.joinedConversation(turnId)),
    /** Show the turn's readers a draft of the step being written. */
    showDraft: (turnId: Turn.Id, draft: Turn.Draft) =>
      turnExecution((turnExecution) => turnExecution.showDraft(turnId, draft)),
    /** Close the turn its agent answered. */
    close: (turnId: Turn.Id, closing: Parameters<TurnExecution.Interface["close"]>[1]) =>
      turnExecution((turnExecution) => turnExecution.close(turnId, closing)),
    /** Fail the turn. */
    fail: (turnId: Turn.Id, failure: Parameters<TurnExecution.Interface["fail"]>[1]) =>
      turnExecution((turnExecution) => turnExecution.fail(turnId, failure)),
    /** End the turn that was asked to stop, or that no run holds. */
    confirmStopped: (
      turnId: Turn.Id,
      stopped: Parameters<TurnExecution.Interface["confirmStopped"]>[1],
    ) => turnExecution((turnExecution) => turnExecution.confirmStopped(turnId, stopped)),
    /** The participation's session log past `after`, at most `limit` entries, oldest first. */
    readLog: (
      participationId: ThreadParticipation.Id,
      options: { readonly after: number; readonly limit: number },
    ) => sessionLogStore((sessionLogStore) => sessionLogStore.read(participationId, options)),
    /**
     * Append `entries` to the participation's session log after `after`, or fail with `Conflict`
     * when the log holds an entry past it: someone else wrote there meanwhile.
     */
    appendLog: (
      participationId: ThreadParticipation.Id,
      entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>,
      after: number,
    ) =>
      sessionLogStore((sessionLogStore) => sessionLogStore.append(participationId, entries, after)),
  };
});

export type TurnWorkspace = Effect.Success<ReturnType<typeof make>>;

export * as TurnWorkspace from "./workspace.ts";
