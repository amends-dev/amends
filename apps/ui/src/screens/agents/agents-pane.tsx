import { For, Match, Show, Switch, type JSX } from "solid-js";
import { IconMarkAgents } from "@amends/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { SearchField } from "../../components/input/index.ts";
import { markTone, type Status } from "../../components/status-mark/index.ts";
import { Tooltip } from "../../components/tooltip/index.ts";
import { TurnActivity } from "../../components/turn-status/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  AgentsAlert,
  agentStatus,
  modelLine,
  activityWords,
  type AgentSummary,
  type AgentsFailure,
} from "./wording.tsx";
import * as s from "./agents.css.ts";

export type AgentsTab = "all" | "needs-setup";

export interface AgentsPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  readonly tab: AgentsTab;
  readonly tabHref: (tab: AgentsTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: AgentsTab) => void;
  /** Agents in each tab, once they have loaded. */
  readonly counts?: { readonly all: number; readonly needsSetup: number };
  /** Shows Add agent, for a reader who may add one. */
  readonly onAdd?: () => void;
  /** In place of the list, while agents load or when they cannot. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** The list: AgentList. */
  readonly children: JSX.Element;
}

const tabs = [
  { id: "all", label: "All" },
  { id: "needs-setup", label: "Needs setup" },
] as const;

/** The workspace's agents in the main content, All first, then those that need setup. */
export function AgentsPane(props: AgentsPaneProps) {
  return (
    <Pane.Root class={s.pane}>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkAgents} context={props.workspaceName}>
          Agents
        </Pane.Title>
        <Pane.Actions>
          <Show when={props.status !== "unavailable" && props.onAdd}>
            {(add) => (
              <Button onClick={() => add()()}>
                <span class={s.wideOnly}>Add agent</span>
                <span class={s.phoneOnly}>Add</span>
              </Button>
            )}
          </Show>
        </Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Agents">
            <For each={tabs}>
              {(tab) => (
                <Tabs.Tab
                  href={props.tabHref(tab.id)}
                  current={props.tab === tab.id}
                  count={
                    props.counts === undefined
                      ? undefined
                      : tab.id === "all"
                        ? props.counts.all
                        : props.counts.needsSetup
                  }
                  onClick={(event: MouseEvent) => {
                    if (!props.onTabChange) return;
                    event.preventDefault();
                    props.onTabChange(tab.id);
                  }}
                >
                  {tab.label}
                </Tabs.Tab>
              )}
            </For>
          </Tabs.List>
        </Pane.Tabs>
      </Pane.Header>
      <Switch fallback={props.children}>
        <Match when={props.status === "loading"}>
          <Pane.Body inset="list">
            <p class={s.visuallyHidden} role="status">
              Loading agents…
            </p>
            <ul class={s.list} aria-hidden="true">
              <For each={[0, 1, 2]}>
                {() => (
                  <li class={s.placeholder}>
                    <span class={s.placeholderTile} />
                    <span class={s.placeholderLine} />
                  </li>
                )}
              </For>
            </ul>
          </Pane.Body>
        </Match>
        <Match when={props.status === "unavailable"}>
          <Pane.Body>
            <EmptyState
              art="held-back"
              title="Agents aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState
              art="came-apart"
              title="Couldn’t load agents"
              lines={["Try again once the host is reachable."]}
            >
              <Show when={props.onRetry}>
                {(retry) => <Button onClick={() => retry()()}>Retry</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
      </Switch>
    </Pane.Root>
  );
}

export interface AgentListProps {
  readonly tab: AgentsTab;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tab's agents after the search. */
  readonly agents: readonly AgentSummary[];
  /** Agents in the workspace, whatever the tab and search. */
  readonly total: number;
  /** No model connection exists yet, so agents need one before the first is added. */
  readonly noModelConnection?: boolean;
  /** Each agent's page. */
  readonly agentHref: (id: string) => string;
  /** Starts adding an agent, for a reader who may. */
  readonly onAdd?: () => void;
  /** Starts creating a model connection, for a reader who may add agents. */
  readonly onCreateConnection?: () => void;
  /** A read or change that failed, outside any dialog. */
  readonly failure?: Pick<AgentsFailure, "action" | "error">;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** One letter on a lilac tile, as agents appear across the workspace. */
export function AgentAvatar(props: {
  readonly name: string;
  readonly size: 32 | 40;
  /** A patch on its corner, with its words on hover; the text beside it names the state. */
  readonly status?: Status;
  readonly class?: string;
}) {
  const avatar = (className?: string) => (
    <Avatar
      name={props.name}
      initials={props.name.trim().charAt(0).toUpperCase()}
      tone="lilac"
      size={props.size}
      status={props.status}
      class={className}
      decorative
    />
  );
  return (
    <Show when={props.status} fallback={avatar(props.class)}>
      {(status) => (
        <Tooltip
          title={status().label}
          detail={status().detail}
          tone={markTone(status().mark)}
          class={props.class}
        >
          {avatar()}
        </Tooltip>
      )}
    </Show>
  );
}

/**
 * The agent list: search, then each agent with its state as a patch on its avatar, its model,
 * environment, and where it is at work, each row opening the agent's page. With room it shows
 * the model, environment, and activity as columns; in a narrow pane or on phones, under the name.
 * An idle agent's activity is blank. Place it in AgentsPane.
 */
export function AgentList(props: AgentListProps) {
  const search = () => props.query.trim();
  const alert = () => (
    <Show when={props.failure}>
      {(failure) => (
        <AgentsAlert
          action={failure().action}
          error={failure().error}
          onRefresh={props.onRefresh}
          refreshing={props.refreshing}
        />
      )}
    </Show>
  );
  return (
    <Show
      when={props.total > 0}
      fallback={
        <Pane.Body>
          {alert()}
          <Show
            when={props.noModelConnection && props.onCreateConnection}
            fallback={
              <EmptyState
                art="sew-in"
                title="No agents yet"
                lines={
                  props.onAdd
                    ? [
                        "Create an agent with instructions, a model,",
                        "and an environment to start in.",
                      ]
                    : ["An administrator can add agents to your workspace."]
                }
              >
                <Show when={props.onAdd}>
                  {(add) => (
                    <Button variant="primary" onClick={() => add()()}>
                      Add agent
                    </Button>
                  )}
                </Show>
              </EmptyState>
            }
          >
            {(create) => (
              <EmptyState
                art="reach"
                title="Connect a model first"
                lines={[
                  "Agents need a model connection.",
                  "Connect a model provider, then create your first agent.",
                ]}
              >
                <Button variant="primary" onClick={() => create()()}>
                  Create model connection
                </Button>
              </EmptyState>
            )}
          </Show>
        </Pane.Body>
      }
    >
      <Pane.Toolbar>
        <SearchField
          placeholder="Search agents…"
          class={s.search}
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
      </Pane.Toolbar>
      <div class={s.headings} aria-hidden="true">
        <span class={s.headingAgent}>Agent</span>
        <span class={s.wideColumn}>Model</span>
        <span class={s.wideColumn}>Environment</span>
        <span class={s.wideColumn}>Activity</span>
        <Divider class={s.headingsStitch} />
      </div>
      <Pane.Body inset="list">
        <div class={s.listing}>
          {alert()}
          <Show
            when={props.agents.length > 0}
            fallback={
              <div class={s.empty}>
                <p class={s.emptyText}>
                  {search() ? `No agents match “${search()}”.` : "All agents are ready."}
                </p>
                <Show when={search()}>
                  <Button variant="quiet" onClick={() => props.onQueryChange("")}>
                    Clear search
                  </Button>
                </Show>
              </div>
            }
          >
            <ul
              class={s.list}
              aria-label={props.tab === "needs-setup" ? "Agents that need setup" : "Agents"}
            >
              <Keyed each={props.agents} by={(agent) => agent.id}>
                {(agent) => {
                  const status = () => agentStatus(agent().issues, agent().activity);
                  return (
                    <li>
                      <a href={props.agentHref(agent().id)} class={s.row}>
                        <AgentAvatar
                          name={agent().name}
                          size={32}
                          status={status()}
                          class={s.avatar}
                        />
                        <span class={s.rowText}>
                          <span class={s.rowName}>
                            {agent().name}
                            <span class={s.visuallyHidden}>, {status().label}</span>
                          </span>
                          <span class={s.rowLine}>{modelLine(agent())}</span>
                          <span class={s.rowLine}>
                            {agent().environment.name ?? "Unavailable environment"}
                          </span>
                          <Show when={agent().activity}>
                            {(activity) => (
                              <span class={s.rowLine}>
                                <TurnActivity state={activity().state}>
                                  {`${activityWords(activity()).status} · ${activityWords(activity()).where}`}
                                </TurnActivity>
                              </span>
                            )}
                          </Show>
                        </span>
                        <span class={s.rowColumn}>{modelLine(agent())}</span>
                        <span class={s.rowColumn}>
                          {agent().environment.name ?? "Unavailable environment"}
                        </span>
                        <span class={s.rowActivity}>
                          <Show when={agent().activity}>
                            {(activity) => (
                              <>
                                <TurnActivity state={activity().state}>
                                  {activityWords(activity()).status}
                                </TurnActivity>
                                <span class={s.activityWhere}>
                                  {activityWords(activity()).where}
                                </span>
                              </>
                            )}
                          </Show>
                        </span>
                      </a>
                    </li>
                  );
                }}
              </Keyed>
            </ul>
          </Show>
        </div>
      </Pane.Body>
    </Show>
  );
}
