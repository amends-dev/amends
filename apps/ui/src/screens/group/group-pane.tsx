import { For, Show, type JSX } from "solid-js";
import {
  IconBell,
  IconBellFilled,
  IconMarkChannel,
  IconMarkSearch,
  IconMarkSettings,
  IconMessage,
} from "@amends-dev/icons";
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

/** Following a group: new threads there include the reader. */
export interface GroupFollow {
  readonly following: boolean;
  readonly pending?: boolean;
  readonly onToggle: () => void;
}

export interface GroupPaneProps {
  readonly name: string;
  /** A direct conversation, named by its people, or a team group. Default "team". */
  readonly kind?: "team" | "direct";
  /** Shown under the name on phones. */
  readonly workspaceName: string;
  /** A few members for the header stack, such as the most recent to post. */
  readonly members: readonly AvatarStackPerson[];
  readonly memberCount: number;
  /** The tabs to offer, in a row even when there is one, such as Threads alone. Default all three. */
  readonly tabs?: readonly GroupTab[];
  readonly tab: GroupTab;
  readonly tabHref: (tab: GroupTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: GroupTab) => void;
  readonly taskCount?: number;
  /** The member stack opens the members; without it, the stack only shows them. */
  readonly onOpenMembers?: () => void;
  /** The bell follows or stops following the group. */
  readonly follow?: GroupFollow;
  /** The bell opens notification settings, where following is not offered. */
  readonly onOpenNotifications?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onSearch?: () => void;
  /** Previewing a public group the reader has not joined: Back, a Public badge, fewer actions. */
  readonly preview?: { readonly onBack: () => void };
  /** The current tab's Pane.Body and Pane.Footer. */
  readonly children: JSX.Element;
}

/** A group in the main content: its name, member stack, actions, and tabs above the current tab. */
export function GroupPane(props: GroupPaneProps) {
  const shownTabs = () => tabs.filter((tab) => props.tabs?.includes(tab.id) ?? true);
  return (
    <Pane.Root>
      <Pane.Header>
        <Show when={props.preview} fallback={<Shell.NavigationToggle />}>
          {(preview) => (
            <Pane.Back always aria-label="Back to groups" onClick={() => preview().onBack()} />
          )}
        </Show>
        <Pane.Title
          icon={props.kind === "direct" ? IconMessage : IconMarkChannel}
          context={props.workspaceName}
          badge={props.preview ? "Public" : undefined}
        >
          {props.name}
        </Pane.Title>
        <Pane.Actions>
          <Show
            when={props.onOpenMembers}
            fallback={
              <span class={s.members} role="img" aria-label={`${props.memberCount} members`}>
                <AvatarStack people={props.members} aria-hidden="true" />
              </span>
            }
          >
            {(open) => (
              <button
                type="button"
                class={s.members}
                aria-label={`${props.memberCount} members`}
                onClick={() => open()()}
              >
                <AvatarStack people={props.members} aria-hidden="true" />
              </button>
            )}
          </Show>
          <Show when={!props.preview}>
            <Show
              when={props.follow}
              fallback={
                <Show when={props.onOpenNotifications}>
                  {(open) => (
                    <IconButton
                      icon={IconBell}
                      label="Notifications"
                      class={s.desktopOnly}
                      onClick={() => open()()}
                    />
                  )}
                </Show>
              }
            >
              {(follow) => (
                <IconButton
                  icon={follow().following ? IconBellFilled : IconBell}
                  label={follow().following ? "Following" : "Follow"}
                  aria-pressed={follow().following}
                  disabled={follow().pending}
                  onClick={() => follow().onToggle()}
                />
              )}
            </Show>
            <Show when={props.onSearch}>
              {(search) => (
                <IconButton
                  icon={IconMarkSearch}
                  label="Search"
                  class={s.mobileOnly}
                  onClick={() => search()()}
                />
              )}
            </Show>
            <Show when={props.onOpenSettings}>
              {(open) => (
                <IconButton
                  icon={IconMarkSettings}
                  label="Group settings"
                  onClick={() => open()()}
                />
              )}
            </Show>
          </Show>
        </Pane.Actions>
        <Show when={shownTabs().length > 0}>
          <Pane.Tabs>
            <Tabs.List aria-label={props.name}>
              <For each={shownTabs()}>
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
        </Show>
      </Pane.Header>
      {props.children}
    </Pane.Root>
  );
}
