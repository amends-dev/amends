import { For, type JSX } from "solid-js";
import { IconBell, IconMarkChannel, IconMarkSearch, IconMarkSettings } from "@amends/icons";
import { AvatarStack, type AvatarStackPerson } from "../../components/avatar/index.ts";
import { IconButton } from "../../components/icon-button/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import * as s from "./group.css.ts";

export type GroupTab = "threads" | "tasks" | "files";

const tabs = [
  { id: "threads", label: "Threads" },
  { id: "tasks", label: "Tasks" },
  { id: "files", label: "Files" },
] as const;

export interface GroupPaneProps {
  readonly name: string;
  /** Shown under the name on phones. */
  readonly workspaceName: string;
  /** A few members for the header stack, such as the most recent to post. */
  readonly members: readonly AvatarStackPerson[];
  readonly memberCount: number;
  readonly tab: GroupTab;
  readonly tabHref: (tab: GroupTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: GroupTab) => void;
  readonly taskCount?: number;
  readonly onOpenMembers: () => void;
  readonly onOpenNotifications: () => void;
  readonly onOpenSettings: () => void;
  readonly onSearch: () => void;
  /** The current tab's Pane.Body and Pane.Footer. */
  readonly children: JSX.Element;
}

/** A group in the main content: its name, member stack, actions, and tabs above the current tab. */
export function GroupPane(props: GroupPaneProps) {
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkChannel} context={props.workspaceName}>
          {props.name}
        </Pane.Title>
        <Pane.Actions>
          <button
            type="button"
            class={s.members}
            aria-label={`${props.memberCount} members`}
            onClick={() => props.onOpenMembers()}
          >
            <AvatarStack people={props.members} aria-hidden="true" />
          </button>
          <IconButton
            icon={IconBell}
            label="Notifications"
            class={s.desktopOnly}
            onClick={() => props.onOpenNotifications()}
          />
          <IconButton
            icon={IconMarkSearch}
            label="Search"
            class={s.mobileOnly}
            onClick={() => props.onSearch()}
          />
          <IconButton
            icon={IconMarkSettings}
            label="Group settings"
            onClick={() => props.onOpenSettings()}
          />
        </Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label={props.name}>
            <For each={tabs}>
              {(tab) => (
                <Tabs.Tab
                  href={props.tabHref(tab.id)}
                  current={props.tab === tab.id}
                  count={tab.id === "tasks" ? props.taskCount : undefined}
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
      {props.children}
    </Pane.Root>
  );
}
