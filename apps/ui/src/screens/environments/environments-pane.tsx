import { For, Match, Show, Switch, type JSX } from "solid-js";
import { IconAlertTriangle, IconMarkEnvironments } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { SearchField } from "../../components/input/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  EnvironmentsAlert,
  ReadinessStatus,
  providerName,
  runtimeLine,
  type EnvironmentSummary,
  type EnvironmentsAction,
  type EnvironmentsError,
} from "./wording.tsx";
import * as s from "./environments.css.ts";

export type EnvironmentsTab = "all" | "needs-setup";

export interface EnvironmentsPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  readonly tab: EnvironmentsTab;
  readonly tabHref: (tab: EnvironmentsTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: EnvironmentsTab) => void;
  /** Environments in each tab, once they have loaded. */
  readonly counts?: { readonly all: number; readonly needsSetup: number };
  /** Shows Add environment, for a reader who may add one. */
  readonly onAdd?: () => void;
  /** In place of the list, while environments load or when they cannot. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** The list: EnvironmentList. */
  readonly children: JSX.Element;
}

const tabs = [
  { id: "all", label: "All" },
  { id: "needs-setup", label: "Needs setup" },
] as const;

/** The workspace's environments in the main content, All first, then those that need setup. */
export function EnvironmentsPane(props: EnvironmentsPaneProps) {
  return (
    <Pane.Root class={s.pane}>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkEnvironments} context={props.workspaceName}>
          Environments
        </Pane.Title>
        <Pane.Actions>
          <Show when={props.status !== "unavailable" && props.onAdd}>
            {(add) => (
              <Button onClick={() => add()()}>
                <span class={s.wideOnly}>Add environment</span>
                <span class={s.phoneOnly}>Add</span>
              </Button>
            )}
          </Show>
        </Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Environments">
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
              Loading environments…
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
              icon={IconMarkEnvironments}
              title="Environments aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState
              icon={IconAlertTriangle}
              title="Couldn’t load environments"
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

export interface EnvironmentListProps {
  readonly tab: EnvironmentsTab;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tab's environments after the search. */
  readonly environments: readonly EnvironmentSummary[];
  /** Environments in the workspace, whatever the tab and search. */
  readonly total: number;
  /** The environment open in the side panel. */
  readonly selectedId?: string;
  readonly environmentHref: (id: string) => string;
  /** Opens an environment in place of following its link. */
  readonly onOpen?: (id: string) => void;
  /** Starts adding an environment, for a reader who may. */
  readonly onAdd?: () => void;
  /** A read or change that failed, outside any dialog. */
  readonly failure?: {
    readonly action: EnvironmentsAction | "refresh";
    readonly error: EnvironmentsError;
  };
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/**
 * The environment list: search, then each environment with its harness, sandbox, and readiness.
 * With room it shows the harness and sandbox as columns; beside an open environment or on phones,
 * under the name. Place it in EnvironmentsPane.
 */
export function EnvironmentList(props: EnvironmentListProps) {
  const search = () => props.query.trim();
  const alert = () => (
    <Show when={props.failure}>
      {(failure) => (
        <EnvironmentsAlert
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
          <EmptyState
            icon={IconMarkEnvironments}
            title="No environments yet"
            lines={
              props.onAdd
                ? ["Add an environment for your agents: a harness, and a sandbox if they need one."]
                : ["An administrator can add environments for your workspace."]
            }
          >
            <Show when={props.onAdd}>
              {(add) => (
                <Button variant="primary" onClick={() => add()()}>
                  Add environment
                </Button>
              )}
            </Show>
          </EmptyState>
        </Pane.Body>
      }
    >
      <Pane.Toolbar>
        <SearchField
          placeholder="Search environments…"
          class={s.search}
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
      </Pane.Toolbar>
      <div class={s.headings} aria-hidden="true">
        <span class={s.headingEnvironment}>Environment</span>
        <span class={s.wideColumn}>Harness</span>
        <span class={s.wideColumn}>Sandbox</span>
        <span>Setup</span>
        <Divider class={s.headingsStitch} />
      </div>
      <Pane.Body inset="list">
        <div class={s.listing}>
          {alert()}
          <Show
            when={props.environments.length > 0}
            fallback={
              <div class={s.empty}>
                <p class={s.emptyText}>
                  {search()
                    ? `No environments match “${search()}”.`
                    : "All environments are ready."}
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
              aria-label={
                props.tab === "needs-setup" ? "Environments that need setup" : "Environments"
              }
            >
              <Keyed each={props.environments} by={(environment) => environment.id}>
                {(environment) => (
                  <li>
                    <a
                      href={props.environmentHref(environment().id)}
                      class={s.row}
                      aria-current={props.selectedId === environment().id ? "true" : undefined}
                      onClick={(event) => {
                        if (!props.onOpen) return;
                        event.preventDefault();
                        props.onOpen(environment().id);
                      }}
                    >
                      <span class={s.tile} aria-hidden="true">
                        <IconMarkEnvironments class={s.tileIcon} />
                      </span>
                      <span class={s.rowText}>
                        <span class={s.rowName}>{environment().name}</span>
                        <span class={s.rowRuntime}>{runtimeLine(environment())}</span>
                      </span>
                      <span class={s.rowColumn}>
                        {environment().harness?.name ?? environment().harnessId}
                      </span>
                      <span class={s.rowColumn}>
                        {environment().sandbox ? providerName(environment()) : "No sandbox"}
                      </span>
                      <span class={s.rowSetup}>
                        <ReadinessStatus issues={environment().issues} />
                      </span>
                    </a>
                  </li>
                )}
              </Keyed>
            </ul>
          </Show>
          <p class={s.footnote}>
            Ready reflects the saved setup. Provider access has not been tested.
          </p>
        </div>
      </Pane.Body>
    </Show>
  );
}
