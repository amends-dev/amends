import type { TurnState } from "@amends/ui/components/turn-status";
import type {
  ThreadTurnControls,
  TurnLogActivity,
  TurnLogTurn,
  TurnProblem,
} from "@amends/ui/screens/turns";
import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Effect, Exit, Option } from "effect";
import { AsyncResult, type Atom } from "effect/reactivity";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { connectionsV2Reads } from "../connections-v2/api.ts";
import { timelineRead } from "../conversations/api.ts";
import { useApiClient } from "../provider.tsx";
import { writing } from "./drafts.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import {
  activeTurnsRead,
  turnRead,
  turnRefusal,
  controlTurn,
  Turn,
  type TurnCommand,
  turnLogFeed,
} from "./api.ts";
import { useMembers } from "../conversations/reads.ts";
import { toDate } from "../conversations/time.ts";
import { memberName, useWorkspaceGroups } from "../conversations/views.ts";
import { useLastingDown, useChangeFeedStatus } from "../live/status.ts";
import { useMutation } from "../api/mutation.ts";
import { refreshResult } from "../api/refresh.ts";

/** An agent's turn on a thread, as a thread shows it. */
export interface TurnEntry {
  readonly id: string;
  readonly threadId: string;
  readonly groupId: string;
  readonly agent: { readonly id: string; readonly memberId: string; readonly name: string };
  readonly state: TurnState;
  /** Why it failed, as the host worded it. */
  readonly failure: string | undefined;
  /** Why it stopped: someone asked, or its agent stopped taking part in the thread. */
  readonly stoppedBy: "request" | "departure" | undefined;
  /** The last reply it posted when it closed, if any. */
  readonly replyId: string | undefined;
  /** Every reply it posted when it closed, in order. */
  readonly replyIds: ReadonlyArray<string>;
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

/** A turn's state is active until it finishes. */
export const activeState = (state: TurnState) =>
  state === "queued" || state === "working" || state === "stopping";

const states: Readonly<Record<Turn.Record["status"], TurnState>> = {
  queued: "queued",
  running: "working",
  cancelling: "stopping",
  completed: "done",
  failed: "failed",
  cancelled: "stopped",
};

/** Shape turns as entries, naming their agents from the workspace's members. */
function useEntries(workspaceId: string) {
  const members = useMembers(workspaceId);
  return (turn: Turn.View): TurnEntry => ({
    id: turn.id,
    threadId: turn.threadId,
    groupId: turn.groupId,
    agent: {
      id: turn.agentId,
      memberId: turn.memberId,
      name: memberName(members.member(turn.memberId)),
    },
    state: states[turn.status],
    failure: turn.failure ?? undefined,
    stoppedBy:
      turn.status !== "cancelled" && turn.status !== "cancelling"
        ? undefined
        : turn.cancelReason === "participation-ended"
          ? "departure"
          : "request",
    replyId: turn.messageIds.at(-1),
    replyIds: turn.messageIds,
    throughSequence: turn.acceptedThroughSequence,
    createdAt: toDate(turn.createdAt),
    startedAt: turn.startedAt === null ? undefined : toDate(turn.startedAt),
    finishedAt: turn.finishedAt === null ? undefined : toDate(turn.finishedAt),
    stoppable: turn.stoppable,
    retryable: turn.retryable,
  });
}

/** A read's value, loading state, and failure, for a read that may not exist. */
function useRead<A, E>(read: Atom.Atom<AsyncResult.AsyncResult<A, E>> | undefined) {
  const result = read === undefined ? () => undefined : useAtomValue(() => read);
  const refresh = read === undefined ? () => {} : useAtomRefresh(() => read);
  return {
    value: (): A | undefined => {
      const current = result();
      return current === undefined ? undefined : Option.getOrUndefined(AsyncResult.value(current));
    },
    loading: () => {
      const current = result();
      return (
        current !== undefined &&
        Option.isNone(AsyncResult.value(current)) &&
        !AsyncResult.isFailure(current)
      );
    },
    failure: (): WorkspaceFailure | undefined => {
      const current = result();
      if (current === undefined) return "gone";
      return AsyncResult.isFailure(current) && !current.waiting
        ? workspaceFailure(current.cause)
        : undefined;
    },
    refresh,
  };
}

/** Stopping and retrying one thread's turns. */
export interface TurnControls {
  /** Ask a turn to stop, unless a stop or retry is running. */
  readonly stop: (turnId: string) => void;
  /** Run a failed or stopped turn again, unless a stop or retry is running. */
  readonly retry: (turnId: string) => void;
  /** The stop or retry running now, and for which turn. */
  readonly acting: Accessor<ThreadTurnControls["acting"]>;
  /** Why the last stop or retry did not go through, until another starts or it is dismissed. */
  readonly problem: Accessor<ThreadTurnControls["problem"]>;
  readonly dismiss: () => void;
}

/** A failed command's cause as the problem it names. */
const commandProblem = (
  command: "stop" | "retry",
  refused: TurnProblem | undefined,
  failure: WorkspaceFailure,
): TurnProblem => {
  if (refused !== undefined) return refused;
  if (failure === "denied" || failure === "gone") return failure;
  return command === "stop" ? "stop-failed" : "retry-failed";
};

/**
 * Stop and retry a thread's turns. A turn is retried at most once, so a retry that failed in
 * transit can simply ask again; a refusal refreshes what the reader sees, as the turn changed
 * meanwhile.
 */
function useControls(
  workspaceId: string,
  threadId: string | undefined,
  options: {
    readonly log: boolean;
    readonly refresh: () => void;
    readonly retried?: (turnId: string) => void;
  },
): TurnControls {
  const client = useApiClient();
  const timeline = threadId === undefined ? undefined : timelineRead(client, workspaceId, threadId);
  const [acting, setActing] = createSignal<ThreadTurnControls["acting"]>();
  const [problem, setProblem] = createSignal<ReturnType<TurnControls["problem"]>>();
  // A command answers once the thread's timeline, and the turn when its log is open, show it.
  const request = useMutation((api, command: TurnCommand) =>
    controlTurn(workspaceId)(api, command).pipe(
      Effect.tap(() => (timeline ? Effect.ignore(refreshResult(timeline.atom)) : Effect.void)),
      Effect.tap(() => {
        const turn = options.log ? turnRead(client, workspaceId, command.turnId) : undefined;
        return turn ? Effect.ignore(refreshResult(turn)) : Effect.void;
      }),
    ),
  );
  async function act(kind: "stop" | "retry", turnId: string) {
    if (request.pending()) return;
    setProblem(undefined);
    setActing({ kind, turnId });
    const exit = await request.run({ kind, turnId });
    if (exit === undefined) return;
    setActing(undefined);
    if (Exit.isSuccess(exit)) {
      if (kind === "retry") options.retried?.(exit.value.id);
      return;
    }
    setProblem({
      turnId,
      problem: commandProblem(kind, turnRefusal(exit.cause), workspaceFailure(exit.cause)),
    });
    options.refresh();
  }
  return {
    stop: (turnId) => void act("stop", turnId),
    retry: (turnId) => void act("retry", turnId),
    acting,
    problem,
    dismiss: () => setProblem(undefined),
  };
}

/**
 * Stop and retry the agents' turns in a thread, as its timeline shows them. A command's thread
 * timeline is read again before it answers, so it shows the state the command produced.
 */
export function useThreadTurnControls(workspaceId: string, threadId: string): TurnControls {
  const timeline = timelineRead(useApiClient(), workspaceId, threadId);
  const refresh = timeline === undefined ? () => {} : useAtomRefresh(() => timeline.atom);
  return useControls(workspaceId, threadId, { log: false, refresh });
}

export interface TurnLogView extends TurnControls {
  /** The turn, with its agent's ID for the page that fixes its setup. */
  readonly turn: Accessor<
    (Omit<TurnLogTurn, "agentHref"> & { readonly agentId: string }) | undefined
  >;
  readonly activity: Accessor<ReadonlyArray<TurnLogActivity>>;
  /**
   * The response the agent is writing now, before it completes: its text so far, and whether some
   * of it went missing on the way, so the rest shows once it completes.
   */
  readonly draft: Accessor<{ readonly text: string; readonly broken: boolean } | undefined>;
  readonly loading: Accessor<boolean>;
  readonly failure: Accessor<WorkspaceFailure | undefined>;
  /** Live updates are down: what is shown is the last known, from `updatedAt`. */
  readonly reconnecting: Accessor<boolean>;
  /** When the log last arrived. */
  readonly updatedAt: Accessor<Date | undefined>;
  /** Read the log again, as after it failed to load. */
  readonly refresh: () => void;
}

/**
 * One turn's log, live while mounted: its activity, the response it is writing, and where it runs,
 * with stopping and retrying. The turn follows its facts through the workspace's changes; its log
 * is followed by subscribing to it, which delivers its items as its agent's log grows and the
 * response being written, until the turn ends. `retried` receives the new turn a retry queued, to
 * show its log.
 */
export function useTurnLog(
  workspaceId: string,
  turnId: string,
  options: { readonly retried?: (turnId: string) => void } = {},
): TurnLogView {
  const client = useApiClient();
  const read = useRead(turnRead(client, workspaceId, turnId));
  const feedAtom = turnLogFeed(client, workspaceId, turnId);
  const feedResult = useAtomValue(() => feedAtom);
  const refollow = useAtomRefresh(() => feedAtom);
  const feed = () => Option.getOrUndefined(AsyncResult.value(feedResult()));
  const entryOf = useEntries(workspaceId);
  const groups = useWorkspaceGroups(workspaceId);
  const connections = useRead(connectionsV2Reads(client, workspaceId)?.connections);
  const live = useChangeFeedStatus();
  const followingDown = useLastingDown(() => feed()?.connection === "reconnecting");
  const failure = (): WorkspaceFailure | undefined => {
    const connection = feed()?.connection;
    return (
      read.failure() ?? (connection === "gone" || connection === "denied" ? connection : undefined)
    );
  };
  /** The turn left the reader's reach: none of it shows, however recently it did. */
  const lost = () => {
    const current = failure();
    return current === "gone" || current === "denied";
  };

  const entry = createMemo(() => {
    const view = read.value();
    return view === undefined || lost() ? undefined : entryOf(view);
  });
  const turn = createMemo(() => {
    const current = entry(),
      selection = read.value()?.selection;
    if (current === undefined || selection === undefined) return undefined;
    const group = groups.group(current.groupId);
    const nameOf = (connectionId: string | undefined) =>
      connections.value()?.find((item) => item.id === connectionId)?.name;
    // TODO: Show the turn's harness, model, and sandbox as parts of their own, once the turn log
    // screen takes a selection rather than a model and an environment.
    return {
      agentId: current.agent.id,
      agent: { name: current.agent.name },
      state: current.state,
      where:
        group?.kind === "direct" ? `Thread with ${group.name}` : `Thread in #${group?.name ?? ""}`,
      model:
        selection === null
          ? undefined
          : [nameOf(selection.model.connectionId), selection.model.id].filter(Boolean).join(" · "),
      environment:
        selection === null
          ? undefined
          : [nameOf(selection.harness.connectionId), nameOf(selection.sandbox?.connectionId)]
              .filter(Boolean)
              .join(" in "),
      stoppable: current.stoppable,
      retryable: current.retryable,
      replyId: current.replyId,
    };
  });
  const activity = createMemo((): ReadonlyArray<TurnLogActivity> => {
    const logged = feed()?.items;
    const current = entry();
    if (logged === undefined || current === undefined) return [];
    const items: Array<TurnLogActivity> = [{ kind: "accepted", at: current.createdAt }];
    if (current.startedAt !== undefined) items.push({ kind: "started", at: current.startedAt });
    for (const item of logged) {
      const at = toDate(item.at);
      if (Turn.LogItem.isAnyOf(["InputTaken"])(item))
        items.push({
          kind: "input",
          at,
          messages: item.messages,
          first: !items.some((entry) => entry.kind === "input"),
        });
      else if (Turn.LogItem.isAnyOf(["Responded"])(item))
        items.push({
          kind: "response",
          at,
          id: item.responseId,
          text: item.text,
          posted: item.reply && current.state === "done",
        });
      else
        items.push({
          kind: "interrupted",
          at,
          reason: item.reason,
          retrying: item.retryable && activeState(current.state),
        });
    }
    const at = current.finishedAt;
    if (at !== undefined) {
      if (current.state === "done")
        items.push(
          current.replyId === undefined ? { kind: "finished", at } : { kind: "replied", at },
        );
      else if (current.state === "failed") {
        const reason = current.failure ?? "";
        // The interruption that ended the turn says what its failure says.
        const last = items.at(-1);
        if (last?.kind === "interrupted" && last.reason === reason) items.pop();
        items.push({ kind: "failed", at, reason });
      } else if (current.state === "stopped")
        items.push({ kind: "stopped", at, by: current.stoppedBy ?? "request" });
    }
    return items;
  });
  const draft = createMemo(() => {
    const current = entry();
    if (current === undefined || current.state !== "working") return undefined;
    const following = feed();
    if (following === undefined) return undefined;
    // A block's draft gives way to the block once the log holds it.
    const logged = new Set(
      (following.items ?? []).flatMap((item) =>
        Turn.LogItem.isAnyOf(["Responded"])(item)
          ? item.parts.map((part) => `${item.responseId}\u0000${part}`)
          : [],
      ),
    );
    return writing(following.drafts, turnId, logged);
  });
  // Its thread's turns follow the change feed; the turn refreshes with each command.
  const controls = useControls(workspaceId, undefined, {
    log: true,
    refresh: read.refresh,
    retried: options.retried,
  });
  return {
    turn,
    activity,
    draft,
    loading: () => !lost() && (read.loading() || feed()?.items === undefined),
    failure,
    reconnecting: () => live() !== undefined || followingDown(),
    updatedAt: () => feed()?.updatedAt,
    refresh: () => {
      read.refresh();
      refollow();
    },
    ...controls,
  };
}

/** An agent's active turn somewhere in the workspace. */
export interface ActiveTurn extends TurnEntry {
  /** Where it runs: its group, as "#general", or the people of a direct conversation. */
  readonly place: string;
}

export interface TurnActivityView {
  /** Every active turn in threads the reader may open, once loaded. */
  readonly all: Accessor<ReadonlyArray<ActiveTurn>>;
  /** The agents at work on a thread. */
  readonly inThread: (threadId: string) => ReadonlyArray<ActiveTurn>;
  /** What agents are doing in a group, most urgent first: working, then stopping, then queued. */
  readonly inGroup: (groupId: string) => "working" | "stopping" | "queued" | undefined;
  /** An agent's active turns, by its member ID. */
  readonly ofAgent: (memberId: string) => ReadonlyArray<ActiveTurn>;
}

const urgency = { working: 0, stopping: 1, queued: 2 } as const;

/** Where agents are at work across the workspace, live while mounted. */
export function useTurnActivity(workspaceId: string): TurnActivityView {
  const read = useRead(activeTurnsRead(useApiClient(), workspaceId));
  const entryOf = useEntries(workspaceId);
  const groups = useWorkspaceGroups(workspaceId);
  const all = createMemo((): ReadonlyArray<ActiveTurn> =>
    (read.value() ?? []).map((turn) => {
      const entry = entryOf(turn);
      const group = groups.group(entry.groupId);
      return {
        ...entry,
        place: group?.kind === "direct" ? group.name : `#${group?.name ?? "group"}`,
      };
    }),
  );
  return {
    all,
    inThread: (threadId) => all().filter((turn) => turn.threadId === threadId),
    inGroup: (groupId) =>
      all()
        .filter((turn) => turn.groupId === groupId)
        .map((turn) => turn.state as keyof typeof urgency)
        .filter((state) => state in urgency)
        .toSorted((left, right) => urgency[left] - urgency[right])[0],
    ofAgent: (memberId) => all().filter((turn) => turn.agent.memberId === memberId),
  };
}
