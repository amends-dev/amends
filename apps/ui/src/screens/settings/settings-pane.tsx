import { Match, Show, Switch, type JSX } from "solid-js";
import { IconMarkSettings } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import * as s from "./settings.css.ts";

export type SettingsTab = "workspace" | "members";

export interface SettingsPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  readonly tab: SettingsTab;
  readonly tabHref: (tab: SettingsTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: SettingsTab) => void;
  /** Active members, for the Members tab. */
  readonly memberCount?: number;
  /** Shows Invite people on the Members tab, for a reader who may invite. */
  readonly onInvite?: () => void;
  /** In place of the tab, while settings load or when they cannot. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** The tab: WorkspaceSettings or MemberSettings. */
  readonly children: JSX.Element;
}

/** A workspace's settings in the main content: Workspace first, then Members. */
export function SettingsPane(props: SettingsPaneProps) {
  const tab = (id: SettingsTab, label: string, count?: number) => (
    <Tabs.Tab
      href={props.tabHref(id)}
      current={props.tab === id}
      count={count}
      onClick={(event: MouseEvent) => {
        if (!props.onTabChange) return;
        event.preventDefault();
        props.onTabChange(id);
      }}
    >
      {label}
    </Tabs.Tab>
  );
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkSettings} context={props.workspaceName}>
          Settings
        </Pane.Title>
        <Pane.Actions>
          <Show when={props.tab === "members" && !props.status && props.onInvite}>
            {(invite) => <Button onClick={() => invite()()}>Invite people</Button>}
          </Show>
        </Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Settings">
            {tab("workspace", "Workspace")}
            {tab("members", "Members", props.memberCount)}
          </Tabs.List>
        </Pane.Tabs>
      </Pane.Header>
      <Switch fallback={props.children}>
        <Match when={props.status === "loading"}>
          <Pane.Body>
            <p class={s.loading} role="status">
              Loading settings…
            </p>
          </Pane.Body>
        </Match>
        <Match when={props.status === "unavailable"}>
          <Pane.Body>
            <EmptyState
              art="held-back"
              title="These settings aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState
              art="came-apart"
              title="Can’t load settings"
              lines={["Try again once the host is reachable."]}
            >
              <Show when={props.onRetry}>
                {(retry) => <Button onClick={() => retry()()}>Try again</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
      </Switch>
    </Pane.Root>
  );
}
