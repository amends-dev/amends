import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Exit, Option } from "effect";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { agentsReads } from "../api/agents.ts";
import { timelineRead } from "../api/conversations.ts";
import { useApiClient } from "../api/context.tsx";
import { writing } from "../api/drafts.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import {
  activeTurnsRead,
  newTurnRequestKey,
  turnRead,
  turnProblem,
  turnsRequest,
  type Turn,
  type TurnProblem,
} from "../api/turns.ts";
import { useMembers } from "../conversations/reads.ts";
import { toDate } from "../conversations/time.ts";
import { memberName, useWorkspaceGroups } from "../conversations/views.ts";
import { turnLogFeed } from "../api/turn-log.ts";
import { useLastingDown, useLiveStatus } from "../live/status.ts";
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
  /** Ask a turn to stop. Returns whether the request started. */
  readonly stop: (turnId: string) => boolean;
  /** Run a failed or stopped turn again. Returns whether the request started. */
  readonly retry: (turnId: string) => boolean;
  /** The stop or retry running now, and for which turn. */
  readonly acting: Accessor<
    { readonly kind: "stop" | "retry"; readonly turnId: string } | undefined
  >;
  /** Why the last stop or retry did not go through, until another starts or it is dismissed. */
  readonly problem: Accessor<
    { readonly turnId: string; readonly problem: TurnCommandProblem } | undefined
  >;
  readonly dismiss: () => void;
}

/**
 * Why a stop or retry did not go through, as a code the screens word: it failed on the way, the
 * turn already finished, it cannot run again (still running, replied, superseded, or its agent
 * left), the reader may not direct its agent, or the turn left their reach.
 */
export type TurnCommandProblem =
  | "stop-failed"
  | "retry-failed"
  | "finished"
  | "still-running"
  | "replied"
  | "superseded"
  | "departed"
  | "denied"
  | "gone";

const refusals = {
  active: "still-running",
  completed: "replied",
  superseded: "superseded",
  departed: "departed",
} as const satisfies Record<Turn.NotRetryableReason, TurnCommandProblem>;

/** A failed command's cause as the problem it names. */
const commandProblem = (
  command: "stop" | "retry",
  refused: TurnProblem | undefined,
  failure: WorkspaceFailure,
): TurnCommandProblem => {
  if (refused?.kind === "finished") return "finished";
  if (refused?.kind === "not-retryable") return refusals[refused.reason];
  if (failure === "denied" || failure === "gone") return failure;
  return command === "stop" ? "stop-failed" : "retry-failed";
};

/**
 * Stop and retry a thread's turns. A retry that failed in transit asks again with the same key,
 * so it creates one turn; a refusal refreshes what the reader sees, as the turn changed meanwhile.
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
  const [acting, setActing] = createSignal<
    { readonly kind: "stop" | "retry"; readonly turnId: string } | undefined
  >();
  const [problem, setProblem] = createSignal<ReturnType<TurnControls["problem"]>>();
  const keys = new Map<string, ReturnType<typeof newTurnRequestKey>>();
  const request = useRequest(turnsRequest(client, workspaceId, threadId), (exit, command) => {
    setActing(undefined);
    if (Exit.isSuccess(exit)) {
      if (command.kind === "retry") {
        keys.delete(command.turnId);
        options.retried?.(exit.value.id);
      }
      return;
    }
    setProblem({
      turnId: command.turnId,
      problem: commandProblem(command.kind, turnProblem(exit.cause), workspaceFailure(exit.cause)),
    });
    options.refresh();
  });
  const start = (kind: "stop" | "retry", turnId: string) => {
    const key = keys.get(turnId) ?? newTurnRequestKey();
    const started = request.run(
      kind === "stop"
        ? { kind, turnId, log: options.log }
        : { kind, turnId, key, log: options.log },
    );
    if (!started) return false;
    if (kind === "retry") keys.set(turnId, key);
    setProblem(undefined);
    setActing({ kind, turnId });
    return true;
  };
  return {
    stop: (turnId) => start("stop", turnId),
    retry: (turnId) => start("retry", turnId),
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

/** One entry of a turn's activity, oldest first, as its log shows it. */
export type TurnActivity =
  /** The agent took on work from the thread. */
  | { readonly kind: "accepted"; readonly at: Date }
  | { readonly kind: "started"; readonly at: Date }
  /** The harness took in a batch of the thread's messages; the first holds the request. */
  | {
      readonly kind: "input";
      readonly at: Date;
      readonly messages: number;
      readonly first: boolean;
    }
  /** A response wrote text; those the turn owes are posted as replies when it closes. */
  | {
      readonly kind: "response";
      readonly at: Date;
      readonly id: string;
      readonly text: string;
      readonly posted: boolean;
    }
  /** Execution stopped short and the same turn continues, when it can. */
  | {
      readonly kind: "interrupted";
      readonly at: Date;
      readonly reason: string;
      readonly retrying: boolean;
    }
  | { readonly kind: "replied"; readonly at: Date; readonly messageId: string }
  | { readonly kind: "finished"; readonly at: Date }
  | { readonly kind: "failed"; readonly at: Date; readonly reason: string }
  | { readonly kind: "stopped"; readonly at: Date; readonly by: "request" | "departure" };

/** A turn as its log shows it: where it ran, with what model access. */
export interface TurnDetail extends TurnEntry {
  readonly groupName: string | undefined;
  /** The model access it started with, by provider and model; undefined before it starts. */
  readonly model: { readonly provider: string | undefined; readonly model: string } | undefined;
  /** The environment it started in, by name when the reader may read it. */
  readonly environment: string | undefined;
}

export interface TurnLogView extends TurnControls {
  readonly turn: Accessor<TurnDetail | undefined>;
  readonly activity: Accessor<ReadonlyArray<TurnActivity>>;
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
  const setup = agentsReads(client, workspaceId);
  const connections = useRead(setup?.connections);
  const implementations = useRead(setup?.connectionImplementations);
  const environments = useRead(setup?.environments);
  const live = useLiveStatus();
  const followingDown = useLastingDown(() => feed()?.connection === "reconnecting");

  const turn = createMemo((): TurnDetail | undefined => {
    const view = read.value();
    if (view === undefined) return undefined;
    const entry = entryOf(view);
    const selection = view.selection;
    const connection = connections.value()?.find((item) => item.id === selection?.connectionId);
    const provider = implementations
      .value()
      ?.find((item) => item.id === connection?.implementationId)?.name;
    return {
      ...entry,
      groupName: groups.group(entry.groupId)?.name,
      model: selection === null ? undefined : { provider, model: selection.model },
      environment:
        selection === null
          ? undefined
          : environments.value()?.find((item) => item.id === selection.environmentId)?.name,
    };
  });
  const activity = createMemo((): ReadonlyArray<TurnActivity> => {
    const logged = feed()?.items;
    const current = turn();
    if (logged === undefined || current === undefined) return [];
    const items: Array<TurnActivity> = [{ kind: "accepted", at: current.createdAt }];
    if (current.startedAt !== undefined) items.push({ kind: "started", at: current.startedAt });
    for (const item of logged) {
      const at = toDate(item.at);
      if (item._tag === "InputTaken")
        items.push({
          kind: "input",
          at,
          messages: item.messages,
          first: !items.some((entry) => entry.kind === "input"),
        });
      else if (item._tag === "Responded")
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
          current.replyId === undefined
            ? { kind: "finished", at }
            : { kind: "replied", at, messageId: current.replyId },
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
    const current = turn();
    if (current === undefined || current.state !== "working") return undefined;
    const following = feed();
    if (following === undefined) return undefined;
    // A block's draft gives way to the block once the log holds it.
    const logged = new Set(
      (following.items ?? []).flatMap((item) =>
        item._tag === "Responded"
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
    loading: () => read.loading() || (feed()?.items === undefined && feed()?.connection !== "gone"),
    failure: () => read.failure() ?? (feed()?.connection === "gone" ? "gone" : undefined),
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
  readonly groupName: string | undefined;
  readonly groupKind: "team" | "direct" | undefined;
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
  /**
   * An agent's current activity, by its member ID: its most pressing state, and where it works,
   * each thread by its group, as "#general" for a team or the people of a direct group.
   */
  readonly agentActivity: (
    memberId: string,
  ) =>
    | { readonly state: "working" | "stopping" | "queued"; readonly places: readonly string[] }
    | undefined;
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
      return { ...entry, groupName: group?.name, groupKind: group?.kind };
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
    agentActivity: (memberId) => {
      const turns = all().filter((turn) => turn.agent.memberId === memberId);
      const [state] = turns
        .map((turn) => turn.state as keyof typeof urgency)
        .filter((state) => state in urgency)
        .toSorted((left, right) => urgency[left] - urgency[right]);
      if (state === undefined) return undefined;
      return {
        state,
        places: turns.map((turn) =>
          turn.groupKind === "direct"
            ? (turn.groupName ?? "A conversation")
            : `#${turn.groupName ?? "group"}`,
        ),
      };
    },
  };
}
