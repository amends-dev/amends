/**
 * The workspace, as a turn's run calls it: what core gives a host's jobs, with each call entering
 * the workspace through the gateway for itself, since a run holds the workspace only while a call
 * runs. The runner and the session log writer call these and know nothing of the gateway.
 */
import type * as Core from "@amends-dev/core";
import type { ThreadParticipation } from "@amends-dev/core/thread";
import {
  type SessionLog,
  SessionLogStore,
  type Turn,
  TurnExecution,
  type TurnJobs,
} from "@amends-dev/core/turn";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { type Array, Effect, type Scope } from "effect";

/**
 * Makes the workspace `workspaceId` as a turn's run calls it, over `Gateway.Gateway`'s
 * `inWorkspace`: core's `TurnExecution` and the session log store, each method entering the
 * workspace for its own call.
 */
export const make = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  const gateway = yield* Gateway.Gateway;
  /** Run `program` in the workspace, holding it only while `program` runs. */
  const enter = <A, E>(program: Effect.Effect<A, E, Core.JobServices | Scope.Scope>) =>
    Effect.scoped(gateway.inWorkspace(workspaceId, program));
  /** Ask `call` of the workspace's turn execution, as `TurnExecution.use` does. */
  const useTurnExecution = <A, E>(
    call: (turnExecution: TurnExecution.TurnExecution["Service"]) => Effect.Effect<A, E>,
  ) => enter(TurnExecution.TurnExecution.use(call));
  /**
   * Ask `call` of the workspace's session log store. The log takes part in no commit, and its
   * errors are the writer's to handle.
   */
  const useSessionLogStore = <A, E>(
    call: (sessionLogStore: SessionLogStore.SessionLogStore["Service"]) => Effect.Effect<A, E>,
  ) => enter(SessionLogStore.SessionLogStore.use(call));
  return {
    /** The agent's active turn in the thread, or a new one that accepts the work that waits. */
    accept: (job: TurnJobs.Job) =>
      useTurnExecution((turnExecution) => turnExecution.accept(job.memberId, job.threadId)),
    /** Start the turn: `Ready` with what runs it, or `Idle` for one that ended as it stood. */
    start: (turnId: Turn.Id) => useTurnExecution((turnExecution) => turnExecution.start(turnId)),
    /** The conversation the turn's agent joined, for a session log that starts with it. */
    joinedConversation: (turnId: Turn.Id) =>
      useTurnExecution((turnExecution) => turnExecution.joinedConversation(turnId)),
    /** Show the turn's readers a draft of the step being written. */
    showDraft: (turnId: Turn.Id, draft: Turn.Draft) =>
      useTurnExecution((turnExecution) => turnExecution.showDraft(turnId, draft)),
    /** Close the turn its agent answered. */
    close: (
      turnId: Turn.Id,
      closing: Parameters<TurnExecution.TurnExecution["Service"]["close"]>[1],
    ) => useTurnExecution((turnExecution) => turnExecution.close(turnId, closing)),
    /** Fail the turn. */
    fail: (
      turnId: Turn.Id,
      failure: Parameters<TurnExecution.TurnExecution["Service"]["fail"]>[1],
    ) => useTurnExecution((turnExecution) => turnExecution.fail(turnId, failure)),
    /** End the turn that was asked to stop, or that no run holds. */
    confirmStopped: (
      turnId: Turn.Id,
      stopped: Parameters<TurnExecution.TurnExecution["Service"]["confirmStopped"]>[1],
    ) => useTurnExecution((turnExecution) => turnExecution.confirmStopped(turnId, stopped)),
    /** The participation's session log past `after`, at most `limit` entries, oldest first. */
    readLog: (
      participationId: ThreadParticipation.Id,
      options: { readonly after: number; readonly limit: number },
    ) => useSessionLogStore((sessionLogStore) => sessionLogStore.read(participationId, options)),
    /**
     * Append `entries` to the participation's session log after `after`, or fail with
     * `SessionLogStore.Overtaken` when the log holds an entry past it: someone else wrote there
     * meanwhile.
     */
    appendLog: (
      participationId: ThreadParticipation.Id,
      entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>,
      after: number,
    ) =>
      useSessionLogStore((sessionLogStore) =>
        sessionLogStore.append(participationId, entries, after),
      ),
  };
});

/**
 * What `make` returns, which `TurnRunner` and `SessionLogWriter` call.
 */
export type TurnWorkspace = Effect.Success<ReturnType<typeof make>>;
