import { For, Match, Show, Switch, type JSX } from "solid-js";
import { IconMarkAgents } from "@amends/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { SearchField } from "../../components/input/index.ts";
import { markTone, type Status } from "../../components/status-mark/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Tooltip } from "../../components/tooltip/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  AgentsV2Alert,
  agentV2Status,
  harnessLine,
  modelLine,
  sandboxLine,
  type AgentV2Summary,
  type AgentsV2Failure,
} from "./wording.tsx";
import * as s from "./agents-v2.css.ts";

/** All agents, or those that need setup before they can run. */
export type AgentsV2Tab = "all" | "needs-setup";

const tabs: ReadonlyArray<{ readonly id: AgentsV2Tab; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "needs-setup", label: "Needs setup" },
];

export interface AgentsV2PaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  readonly tab: AgentsV2Tab;
  readonly tabHref: (tab: AgentsV2Tab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: AgentsV2Tab) => void;
  /** Agents in each tab, once they have loaded. */
  readonly counts?: Readonly<Record<AgentsV2Tab, number>>;
  /** Shows Add agent, for a reader who may add one. */
  readonly onAdd?: () => void;
  /** In place of the list, while agents load or when they cannot. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** The list: AgentV2List. */
  readonly children: JSX.Element;
}

/** The workspace's agents in the main content: All, then those that need setup. */
export function AgentsV2Pane(props: AgentsV2PaneProps) {
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkAgents} context={props.workspaceName}>
          Agents v2
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
                  count={props.counts?.[tab.id]}
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
                    <span class={s.placeholderAvatar} />
                    <span class={s.placeholderLines}>
                      <span class={s.placeholderLine} />
                      <span class={s.placeholderShort} />
                    </span>
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

/** An agent's avatar, with its state as a patch on the corner and the state's words on hover. */
export function AgentV2Avatar(props: {
  readonly name: string;
  readonly size: 32 | 40;
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

export interface AgentV2ListProps {
  readonly tab: AgentsV2Tab;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tab's agents after the search. */
  readonly agents: readonly AgentV2Summary[];
  /** Agents in the workspace, whatever the tab and search. */
  readonly total: number;
  /** Each agent's page. */
  readonly agentHref: (id: string) => string;
  /** Starts adding an agent, for a reader who may. */
  readonly onAdd?: () => void;
  /** A read or change that failed, outside any dialog. */
  readonly failure?: AgentsV2Failure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/**
 * The agent list: search, then each agent with its state as a patch on its avatar, the harness it
 * runs on and where, and its model, each row opening the agent's page. With room the harness and
 * model are columns; on phones they sit under the name. With no agents yet it offers adding one.
 * Place it in AgentsV2Pane.
 */
export function AgentV2List(props: AgentV2ListProps) {
  const search = () => props.query.trim();
  const alert = () => (
    <Show when={props.failure}>
      {(failure) => (
        <AgentsV2Alert
          failure={failure()}
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
          <EmptyState
            art="sew-in"
            title="No agents yet"
            lines={[
              props.onAdd
                ? "Add an agent: a member that works on a harness and a model your connections give."
                : "An administrator can add agents to your workspace.",
            ]}
          >
            <Show when={props.onAdd}>
              {(add) => (
                <Button variant="primary" onClick={() => add()()}>
                  Add agent
                </Button>
              )}
            </Show>
          </EmptyState>
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
        <span>Harness</span>
        <span>Model</span>
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
                  {search()
                    ? `No agents match “${search()}”.`
                    : props.tab === "needs-setup"
                      ? "Every agent can run as it is set up."
                      : "No agents yet."}
                </p>
                <Show when={search()}>
                  <Button variant="quiet" onClick={() => props.onQueryChange("")}>
                    Clear search
                  </Button>
                </Show>
              </div>
            }
          >
            <ul class={s.list} aria-label="Agents">
              <Keyed each={props.agents} by={(agent) => agent.id}>
                {(agent) => {
                  const status = () => agentV2Status(agent().issues);
                  return (
                    <li>
                      <a href={props.agentHref(agent().id)} class={s.row}>
                        <AgentV2Avatar
                          name={agent().name}
                          size={32}
                          status={status()}
                          class={s.rowAvatar}
                        />
                        <span class={s.rowText}>
                          <span class={s.rowName}>
                            {agent().name}
                            <Show when={status()}>
                              {(status) => <span class={s.visuallyHidden}>, {status().label}</span>}
                            </Show>
                          </span>
                          <span class={s.rowUnder}>
                            {`${harnessLine(agent().harness)} · ${modelLine(agent().model)}`}
                          </span>
                        </span>
                        <span class={s.rowColumn}>
                          <span class={s.rowValue}>{harnessLine(agent().harness)}</span>
                          <span class={s.rowDetail}>{sandboxLine(agent().sandbox)}</span>
                        </span>
                        <span class={s.rowColumn}>
                          <span class={s.rowValue}>{agent().model.name ?? agent().model.id}</span>
                          <span class={s.rowDetail}>
                            {agent().model.connection.name ?? "Removed connection"}
                          </span>
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
