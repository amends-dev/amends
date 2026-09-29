// Workshop harness: a group with a thread where agents work, their turns under its messages, and
// a turn's log in place of the thread, shaped like the connected app's data. Not exported.
import { Show, createSignal } from "solid-js";
import type { TurnState } from "../../components/turn-status/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { GroupPane } from "../group/group-pane.tsx";
import { GroupThreads } from "../group/group-threads.tsx";
import { ThreadPane } from "../group/thread-pane.tsx";
import { navigation, people } from "../sample.ts";
import type { TimelineEntry } from "../timeline/index.ts";
import { HomeSidebar, WorkspaceNavigation } from "../workspace-navigation/index.ts";
import type { TurnLogActivity, TurnLogTurn } from "./turn-log.tsx";
import { TurnLogPane } from "./turn-log.tsx";
import type { ThreadTurn } from "./turn-row.tsx";

const now = new Date();
const at = (minutes: number, seconds = 0) =>
  new Date(now.getTime() - minutes * 60_000 + seconds * 1000);

const reply =
  "Deploy the API first, verify compatibility, then release clients on Thursday. Keep rollback ready if error rates rise.";

/** The thread's messages; a completed turn's reply follows them. */
const messages = (replied: boolean): readonly TimelineEntry[] => [
  {
    kind: "message",
    id: "m1",
    author: people.aj,
    at: at(12),
    text: "Can we review the rollout plan for Thursday?",
  },
  {
    kind: "message",
    id: "m2",
    author: people.sara,
    at: at(11),
    text: "API changes land first. Clients follow on Thursday.",
  },
  {
    kind: "message",
    id: "m3",
    author: people.aj,
    at: at(10),
    text: "[@Yumi](member:yumi) summarize the risks and rollout order.",
    mentions: [{ id: "yumi", name: "Yumi" }],
  },
  ...(replied
    ? [
        {
          kind: "message" as const,
          id: "m4",
          author: people.yumi,
          at: at(9),
          text: reply,
          turn: { id: "turn-1" },
        },
      ]
    : []),
];

/** What a scenario shows: the turn's state and what the reader may do with it. */
export type Scenario =
  | "queued"
  | "working"
  | "stopping"
  | "stopped"
  | "failed"
  | "departed"
  | "retried"
  | "done"
  | "done-quietly"
  | "follow-only"
  | "stop-failed";

const turnOf = (scenario: Scenario): ThreadTurn | undefined => {
  const agent = { name: "Yumi" };
  const base = { id: "turn-1", agent, stoppable: false, retryable: false, agentHref: "#agents" };
  switch (scenario) {
    case "queued":
      return { ...base, state: "queued", stoppable: true };
    case "working":
    case "stop-failed":
      return { ...base, state: "working", stoppable: true };
    case "follow-only":
      return { ...base, state: "working" };
    case "stopping":
      return { ...base, state: "stopping" };
    case "stopped":
      return { ...base, state: "stopped", stoppedBy: "request", retryable: true };
    case "departed":
      return { ...base, state: "stopped", stoppedBy: "departure" };
    case "failed":
      return { ...base, state: "failed", failure: "Anthropic needs its API key.", retryable: true };
    case "retried":
      return {
        ...base,
        id: "turn-2",
        state: "queued",
        stoppable: true,
        previous: { id: "turn-1", state: "failed" },
      };
    case "done-quietly":
      return { ...base, state: "done" };
    case "done":
      return undefined;
  }
};

/** The log of a turn in a state, with its activity so far. */
export const logOf = (
  state: TurnState,
  options: { readonly failedEarly?: boolean } = {},
): { readonly turn: TurnLogTurn; readonly activity: readonly TurnLogActivity[] } => {
  const started = state !== "queued" && !options.failedEarly;
  const turn: TurnLogTurn = {
    agent: { name: "Yumi" },
    state,
    where: "Thread in #general",
    ...(started && { model: "Anthropic · claude-sonnet-5", environment: "In-process" }),
    stoppable: state === "queued" || state === "working",
    retryable: state === "failed" || state === "stopped",
    agentHref: "#agents",
    ...(state === "done" && { replyId: "m4" }),
  };
  const activity: TurnLogActivity[] = [{ kind: "accepted", at: at(10, 2) }];
  if (options.failedEarly) {
    activity.push({ kind: "failed", at: at(10, 3), reason: "Anthropic needs its API key." });
    return { turn, activity };
  }
  if (!started) return { turn, activity };
  activity.push(
    { kind: "started", at: at(10, 4) },
    { kind: "input", at: at(10, 4), messages: 3, first: true },
  );
  if (state === "done")
    activity.push(
      { kind: "response", at: at(9, 28), id: "r1", text: reply, posted: true },
      { kind: "replied", at: at(9, 28) },
    );
  if (state === "failed")
    activity.push({ kind: "failed", at: at(9, 40), reason: "The model provider is unavailable." });
  if (state === "stopped") activity.push({ kind: "stopped", at: at(9, 40), by: "request" });
  return { turn, activity };
};

export interface TurnsWorkshopProps {
  readonly scenario: Scenario;
  /** Open the turn's log in place of the thread. */
  readonly log?: boolean;
  /** The log's turn failed before it started. */
  readonly failedEarly?: boolean;
  /** What the agent has written so far, while working. */
  readonly draft?: string;
  readonly reconnecting?: boolean;
}

/** A group, its thread, and an agent's turn there in one scenario, as the app drives them. */
export function TurnsWorkshop(props: TurnsWorkshopProps) {
  const [log, setLog] = createSignal(props.log ?? false);
  const [scenario, setScenario] = createSignal(props.scenario);
  const turn = () => turnOf(scenario());
  const active = () => {
    const state = turn()?.state;
    return state === "queued" || state === "working" || state === "stopping" ? state : undefined;
  };
  const { onSearch: _search, ...base } = navigation({
    groups: [{ id: "general", name: "general" }],
    currentGroup: "general",
  });
  const logged = () => {
    const state: TurnState =
      scenario() === "done" || scenario() === "done-quietly" ? "done" : (turn()?.state ?? "done");
    return logOf(state, { failedEarly: props.failedEarly });
  };
  return (
    <Shell.Root>
      <WorkspaceNavigation
        {...base}
        destinations={["home", "agents", "environments", "connections"]}
      >
        <HomeSidebar
          {...base}
          groups={[
            { id: "general", name: "general", href: "#general", current: true, activity: active() },
            { id: "design", name: "design", href: "#design" },
          ]}
        />
      </WorkspaceNavigation>
      <Shell.Main>
        <GroupPane
          name="general"
          workspaceName="Mercier & Co"
          members={[people.aj, people.sara, people.yumi]}
          memberCount={3}
          tabs={["threads"]}
          tab="threads"
          tabHref={() => "#threads"}
          onOpenMembers={() => {}}
        >
          <GroupThreads
            entries={[
              {
                kind: "message",
                id: "t1",
                author: people.aj,
                at: at(12),
                text: "Can we review the rollout plan for Thursday?",
                thread: {
                  replies: scenario() === "done" ? 3 : 2,
                  activity: active() ? [{ agent: "Yumi", state: active()! }] : undefined,
                },
              },
            ]}
            openThreadId="t1"
            onOpenThread={() => setLog(false)}
            placeholder="Message #general"
            draft=""
            onDraftChange={() => {}}
            onSend={() => {}}
          />
        </GroupPane>
      </Shell.Main>
      <Show
        when={log()}
        fallback={
          <ThreadPane
            title="Thread"
            groupName="general"
            entries={messages(scenario() === "done")}
            repliesDivider
            onClose={() => {}}
            placeholder="Reply in thread"
            draft=""
            onDraftChange={() => {}}
            onSend={() => {}}
            onOpenTurnLog={() => setLog(true)}
            turns={
              turn()
                ? {
                    list: [turn()!],
                    onStop: () => setScenario("stopping"),
                    onRetry: () => setScenario("retried"),
                    onOpenLog: () => setLog(true),
                    problem:
                      scenario() === "stop-failed"
                        ? { turnId: "turn-1", problem: "stop-failed" as const }
                        : undefined,
                  }
                : undefined
            }
          />
        }
      >
        <TurnLogPane
          turn={logged().turn}
          activity={logged().activity}
          draft={props.draft === undefined ? undefined : { text: props.draft, broken: false }}
          reconnecting={props.reconnecting}
          updatedAt={at(0, -12)}
          onStop={() => setScenario("stopping")}
          onRetry={() => setScenario("retried")}
          onBack={() => setLog(false)}
          onClose={() => setLog(false)}
          onOpenReply={() => setLog(false)}
        />
      </Show>
    </Shell.Root>
  );
}
