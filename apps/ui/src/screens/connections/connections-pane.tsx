import { For, Match, Show, Switch, type JSX } from "solid-js";
import { IconMarkConnections } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { SearchField } from "../../components/input/index.ts";
import { StatusMark, markTone } from "../../components/status-mark/index.ts";
import { Tooltip } from "../../components/tooltip/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  ConnectionsAlert,
  connectionStatus,
  methodLabels,
  type ConnectionSummary,
  type ConnectionsFailure,
} from "./wording.tsx";
import * as s from "./connections.css.ts";

export type ConnectionsTab = "all" | "needs-setup";

export interface ConnectionsPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  readonly tab: ConnectionsTab;
  readonly tabHref: (tab: ConnectionsTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: ConnectionsTab) => void;
  /** Connections in each tab, once they have loaded. */
  readonly counts?: { readonly all: number; readonly needsSetup: number };
  /** Shows Add connection, for a reader who may add one. */
  readonly onAdd?: () => void;
  /** In place of the list, while connections load or when they cannot. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** The list: ConnectionList. */
  readonly children: JSX.Element;
}

const tabs = [
  { id: "all", label: "All" },
  { id: "needs-setup", label: "Needs setup" },
] as const;

/** The workspace's connections in the main content, All first, then those that need setup. */
export function ConnectionsPane(props: ConnectionsPaneProps) {
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkConnections} context={props.workspaceName}>
          Connections
        </Pane.Title>
        <Pane.Actions>
          <Show when={props.status !== "unavailable" && props.onAdd}>
            {(add) => (
              <Button onClick={() => add()()}>
                <span class={s.wideOnly}>Add connection</span>
                <span class={s.phoneOnly}>Add</span>
              </Button>
            )}
          </Show>
        </Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Connections">
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
              Loading connections…
            </p>
            <ul class={s.list} aria-hidden="true">
              <For each={[0, 1, 2]}>
                {() => (
                  <li class={s.placeholder}>
                    <span class={s.placeholderTile} />
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
              title="Connections aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState
              art="came-apart"
              title="Couldn’t load connections"
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

export interface ConnectionListProps {
  readonly tab: ConnectionsTab;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tab's connections after the search. */
  readonly connections: readonly ConnectionSummary[];
  /** Connections in the workspace, whatever the tab and search. */
  readonly total: number;
  /** Provider names for the empty state, such as Anthropic. */
  readonly providers?: readonly string[];
  /** Each connection's page. */
  readonly connectionHref: (id: string) => string;
  /** Starts adding a connection, for a reader who may. */
  readonly onAdd?: () => void;
  /** A read or change that failed, outside any dialog. */
  readonly failure?: ConnectionsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** "Start with Anthropic or OpenAI-compatible." */
const startWith = (names: readonly string[]) =>
  names.length === 0
    ? undefined
    : `Start with ${names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0]}.`;

/**
 * The connection list: search, then each connection with its provider, endpoint, and how it
 * authenticates, and a mark on its tile when it cannot be used. With no connections yet it offers
 * adding one. Place it in ConnectionsPane.
 */
export function ConnectionList(props: ConnectionListProps) {
  const search = () => props.query.trim();
  return (
    <Show
      when={props.total > 0}
      fallback={
        <Pane.Body>
          <Show when={props.failure}>
            {(failure) => (
              <ConnectionsAlert
                action={failure().action}
                error={failure().error}
                onRefresh={props.onRefresh}
                refreshing={props.refreshing}
              />
            )}
          </Show>
          <EmptyState
            art="reach"
            title="No connections yet"
            lines={
              props.onAdd
                ? [
                    "Add a model provider or a sandbox account for your workspace.",
                    startWith(props.providers ?? []),
                  ].filter((line) => line !== undefined)
                : [
                    "An administrator can add model providers and sandbox accounts for your workspace.",
                  ]
            }
          >
            <Show when={props.onAdd}>
              {(add) => (
                <Button variant="primary" onClick={() => add()()}>
                  Add connection
                </Button>
              )}
            </Show>
          </EmptyState>
        </Pane.Body>
      }
    >
      <Pane.Toolbar>
        <SearchField
          placeholder="Search connections…"
          class={s.search}
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
      </Pane.Toolbar>
      <div class={s.headings} aria-hidden="true">
        <span class={s.headingConnection}>Connection</span>
        <span class={s.wideOnly}>Authentication</span>
        <Divider class={s.headingsStitch} />
      </div>
      <Pane.Body inset="list">
        <div class={s.listing}>
          <Show when={props.failure}>
            {(failure) => (
              <ConnectionsAlert
                action={failure().action}
                error={failure().error}
                onRefresh={props.onRefresh}
                refreshing={props.refreshing}
              />
            )}
          </Show>
          <Show
            when={props.connections.length > 0}
            fallback={
              <div class={s.empty}>
                <p class={s.emptyText}>
                  {search()
                    ? `No connections match “${search()}”.`
                    : "All connections are configured."}
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
                props.tab === "needs-setup" ? "Connections that need setup" : "Connections"
              }
            >
              <Keyed each={props.connections} by={(connection) => connection.id}>
                {(connection) => {
                  const status = () => connectionStatus(connection());
                  return (
                    <li>
                      <a href={props.connectionHref(connection().id)} class={s.row}>
                        <span class={s.tile} aria-hidden="true">
                          <IconMarkConnections class={s.tileIcon} />
                          <Show when={status()}>
                            {(status) => (
                              <Tooltip
                                title={status().label}
                                detail={status().detail}
                                tone={markTone(status().mark)}
                                class={s.tileStatus}
                              >
                                <StatusMark mark={status().mark} size={9} cutout />
                              </Tooltip>
                            )}
                          </Show>
                        </span>
                        <span class={s.rowText}>
                          <span class={s.rowName}>
                            {connection().name}
                            <Show when={status()}>
                              {(status) => <span class={s.visuallyHidden}>, {status().label}</span>}
                            </Show>
                          </span>
                          <span class={s.rowProvider}>
                            {connection().provider?.name ?? connection().providerId}
                          </span>
                          <span class={s.rowEndpoint}>
                            {connection().endpoint ?? "Default API endpoint"}
                          </span>
                        </span>
                        <span class={s.rowMethod}>{methodLabels[connection().method]}</span>
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
