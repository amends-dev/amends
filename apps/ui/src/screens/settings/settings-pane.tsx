import { Match, Show, Switch, type JSX } from "solid-js";
import { IconMarkSettings, IconUsers } from "@amends-dev/icons";
import { Button } from "../../components/button/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import * as s from "./settings.css.ts";

export type SettingsTab = "workspace" | "members";

export interface SettingsPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  /** The section showing, as the Settings sidebar lists them: Workspace, then Members. */
  readonly tab: SettingsTab;
  /** Shows Invite people on Members, for a reader who may invite. */
  readonly onInvite?: () => void;
  /** In place of the section, while settings load or when they cannot. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** The section: WorkspaceSettings or MemberSettings. */
  readonly children: JSX.Element;
}

/** One section of a workspace's settings in the main content, chosen in the Settings sidebar. */
export function SettingsPane(props: SettingsPaneProps) {
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title
          icon={props.tab === "members" ? IconUsers : IconMarkSettings}
          context={props.workspaceName}
        >
          {props.tab === "members" ? "Members" : "Workspace"}
        </Pane.Title>
        <Pane.Actions>
          <Show when={props.tab === "members" && !props.status && props.onInvite}>
            {(invite) => <Button onClick={() => invite()()}>Invite people</Button>}
          </Show>
        </Pane.Actions>
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
