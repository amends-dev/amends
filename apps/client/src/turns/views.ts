import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Exit, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import {
  newTurnRequestKey,
  threadTurnsRead,
  turnProblem,
  turnsRequest,
  type Turn,
  type TurnProblem,
} from "../api/turns.ts";
import { useMembers } from "../conversations/reads.ts";
import { toDate } from "../conversations/time.ts";
import { memberName } from "../conversations/views.ts";
import { useRequest } from "../request/use-request.ts";

export type { TurnProblem };

/**
 * Where an agent's turn stands: waiting to start, working, stopping as asked, done with or
 * without a reply, failed, or stopped.
 */
export type TurnState = "queued" | "working" | "stopping" | "done" | "failed" | "stopped";

/** An agent's turn on a thread, as a thread shows it. */
export interface TurnEntry {
  readonly id: string;
  readonly agent: { readonly memberId: string; readonly name: string };
  readonly state: TurnState;
  /** Why it failed, as the host worded it. */
  readonly failure: string | undefined;
  /** Why it stopped: someone asked, or its agent stopped taking part in the thread. */
  readonly stoppedBy: "request" | "departure" | undefined;
  /** The reply it posted, when it closed with one. */
  readonly replyId: string | undefined;
  /** The timeline position of the latest message it took on. */
  readonly throughSequence: number;
  readonly createdAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  /** The reader may ask it to stop now. */
  readonly stoppable: boolean;
  /** The reader may run it again now. */
  readonly retryable: boolean;
}

export interface ThreadTurnsView {
  /** Each agent's latest turn on the thread, newest first, once loaded. */
  readonly latest: Accessor<ReadonlyArray<TurnEntry>>;
  /** The agents at work on the thread now: queued, working, or stopping. */
  readonly active: Accessor<ReadonlyArray<TurnEntry>>;
  /** The first read is loading. */
  readonly loading: Accessor<boolean>;
  /** Why the latest read failed; the turns shown are the last that loaded. */
  readonly failure: Accessor<WorkspaceFailure | undefined>;
  /** Ask a turn to stop. Returns whether the request started. */
  readonly stop: (turnId: string) => boolean;
  /** Run a failed or stopped turn again. Returns whether the request started. */
  readonly retry: (turnId: string) => boolean;
  /** The stop or retry running now, and for which turn. */
  readonly acting: Accessor<
    { readonly kind: "stop" | "retry"; readonly turnId: string } | undefined
  >;
  /** Why the last stop or retry did not go through, until another starts or it is dismissed. */
  readonly problem: Accessor<TurnProblem | { readonly kind: WorkspaceFailure } | undefined>;
  readonly dismiss: () => void;
}

const states: Readonly<Record<Turn.Record["status"], TurnState>> = {
  queued: "queued",
  running: "working",
  cancelling: "stopping",
  completed: "done",
  failed: "failed",
  cancelled: "stopped",
};

/**
 * The agents' turns on a thread, live while mounted, with stopping and retrying for readers who
 * may direct their agents. A retry that failed in transit asks again with the same key, so it
 * creates one turn.
 */
export function useThreadTurns(workspaceId: string, threadId: string): ThreadTurnsView {
  const client = useApiClient();
  const members = useMembers(workspaceId);
  const read = threadTurnsRead(client, workspaceId, threadId);
  const result = read === undefined ? () => undefined : useAtomValue(() => read);
  const refresh = read === undefined ? () => {} : useAtomRefresh(() => read);
  const entry = (turn: Turn.View): TurnEntry => ({
    id: turn.id,
    agent: { memberId: turn.memberId, name: memberName(members.member(turn.memberId)) },
    state: states[turn.status],
    failure: turn.failure ?? undefined,
    stoppedBy:
      turn.status !== "cancelled" && turn.status !== "cancelling"
        ? undefined
        : turn.cancelReason === "participation-ended"
          ? "departure"
          : "request",
    replyId: turn.messageId ?? undefined,
    throughSequence: turn.acceptedThroughSequence,
    createdAt: toDate(turn.createdAt),
    startedAt: turn.startedAt === null ? undefined : toDate(turn.startedAt),
    finishedAt: turn.finishedAt === null ? undefined : toDate(turn.finishedAt),
    stoppable: turn.stoppable,
    retryable: turn.retryable,
  });
  const latest = createMemo(() => {
    const current = result();
    const turns =
      current === undefined ? [] : Option.getOrElse(AsyncResult.value(current), () => []);
    const seen = new Set<string>();
    return turns.flatMap((turn) => {
      if (seen.has(turn.memberId)) return [];
      seen.add(turn.memberId);
      return [entry(turn)];
    });
  });

  const [acting, setActing] = createSignal<
    { readonly kind: "stop" | "retry"; readonly turnId: string } | undefined
  >();
  const [problem, setProblem] = createSignal<
    TurnProblem | { readonly kind: WorkspaceFailure } | undefined
  >();
  // One key per turn until its retry succeeds, so asking again after a lost answer is one retry.
  const keys = new Map<string, ReturnType<typeof newTurnRequestKey>>();
  const request = useRequest(turnsRequest(client, workspaceId, threadId), (exit, command) => {
    setActing(undefined);
    if (Exit.isSuccess(exit)) {
      if (command.kind === "retry") keys.delete(command.turnId);
      return;
    }
    setProblem(turnProblem(exit.cause) ?? { kind: workspaceFailure(exit.cause) });
    // A turn that changed meanwhile shows as it is now.
    refresh();
  });
  const start = (kind: "stop" | "retry", turnId: string) => {
    const key = keys.get(turnId) ?? newTurnRequestKey();
    const started = request.run(kind === "stop" ? { kind, turnId } : { kind, turnId, key });
    if (!started) return false;
    if (kind === "retry") keys.set(turnId, key);
    setProblem(undefined);
    setActing({ kind, turnId });
    return true;
  };

  return {
    latest,
    active: createMemo(() =>
      latest().filter(
        (turn) => turn.state === "queued" || turn.state === "working" || turn.state === "stopping",
      ),
    ),
    loading: () => {
      const current = result();
      return (
        current !== undefined &&
        Option.isNone(AsyncResult.value(current)) &&
        !AsyncResult.isFailure(current)
      );
    },
    failure: () => {
      const current = result();
      if (current === undefined) return "gone";
      return AsyncResult.isFailure(current) && !current.waiting
        ? workspaceFailure(current.cause)
        : undefined;
    },
    stop: (turnId) => start("stop", turnId),
    retry: (turnId) => start("retry", turnId),
    acting,
    problem,
    dismiss: () => setProblem(undefined),
  };
}
