import { For, Show, type JSX } from "solid-js";
import {
  IconList,
  IconMarkAgents,
  IconMarkChannel,
  IconMarkConnections,
  IconMarkHome,
  IconMarkMail,
  IconMarkNew,
  IconMarkSearch,
  IconMarkSettings,
  IconMarkTasks,
  IconMarkTriage,
  IconMessage,
} from "@amends-dev/icons";
import { IconButton } from "../../components/icon-button/index.ts";
import type { Status } from "../../components/status-mark/index.ts";
import { Menu } from "../../components/menu/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import type { IconComponent } from "../../internal/props.ts";
import type { TaskState } from "../../components/task-status/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { paletteOptions, type ColorPalette } from "../../foundations/color/palettes.ts";
import { Rail } from "../../patterns/rail/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { Sidebar } from "../../patterns/sidebar/index.ts";

export type Destination = "home" | "agents" | "connections";

const destinations = [
  { id: "home", label: "Home", icon: IconMarkHome },
  { id: "agents", label: "Agents", icon: IconMarkAgents },
  { id: "connections", label: "Connections", icon: IconMarkConnections },
] as const;

export interface NavigationLink {
  readonly href: string;
  readonly current?: boolean;
}

export interface NavigationThread extends NavigationLink {
  readonly id: string;
  readonly title: string;
  /** For a task, its state; plain threads show a message icon. */
  readonly state?: TaskState;
}

export interface NavigationGroup extends NavigationLink {
  readonly id: string;
  readonly name: string;
  /** Open threads and tasks shown under the group. */
  readonly threads?: ReadonlyArray<NavigationThread>;
  /** Agents at work in the group: the most pressing turn state. */
  readonly activity?: "queued" | "working" | "stopping";
  /** Notifications addressed to the reader from the group. */
  readonly pending?: number;
  /** Activity the reader has not seen. */
  readonly unread?: boolean;
}

export interface NavigationDirect extends NavigationLink {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
  /** The other member's state, as a patch on their avatar, such as an agent that needs setup. */
  readonly status?: Status;
  /** Notifications addressed to the reader from the conversation. */
  readonly pending?: number;
  /** Activity the reader has not seen. */
  readonly unread?: boolean;
}

export type Appearance = "system" | "light" | "dark";

/** The account menu the rail's avatar opens. */
export interface AccountMenu {
  /** The address the reader signs in with. */
  readonly identity: string;
  readonly appearance: Appearance;
  readonly onAppearanceChange: (appearance: Appearance) => void;
  readonly palette?: ColorPalette;
  readonly onPaletteChange?: (palette: ColorPalette) => void;
  readonly onOpenSettings: () => void;
  readonly onChangeName: () => void;
  readonly onSignOut: () => void;
}

export interface WorkspaceNavigationProps {
  readonly workspace: { readonly name: string; readonly initials?: string };
  readonly account: {
    readonly name: string;
    readonly initials?: string;
    readonly tone?: AvatarToneName;
    /** Opens from the avatar, in place of `onOpenAccount`. */
    readonly menu?: AccountMenu;
  };
  readonly homeHref: string;
  /** The rail's destinations. Default all of them. */
  readonly destinations?: ReadonlyArray<Destination>;
  /** The current destination, if the page is one. */
  readonly destination?: Destination;
  readonly destinationHref: (destination: Destination) => string;
  /** The rail's Settings, a destination of its own. */
  readonly settings: NavigationLink;
  /** Shows the rail's Search and the sidebar's "Find anything". */
  readonly onSearch?: () => void;
  readonly onSwitchWorkspace: () => void;
  readonly onOpenAccount?: () => void;
  /** The current destination's sidebar: HomeSidebar or DestinationSidebar. */
  readonly children: JSX.Element;
}

/**
 * The rail and the current destination's sidebar. The sidebar keeps the workspace switcher and
 * search above whatever the destination lists, so it stays in place as the reader moves between
 * destinations.
 */
export function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  return (
    <Shell.Navigation>
      <Rail.Root>
        <Rail.Brand href={props.homeHref} />
        <Rail.List>
          <For
            each={destinations.filter((destination) =>
              (props.destinations ?? destinations.map((entry) => entry.id)).includes(
                destination.id,
              ),
            )}
          >
            {(destination) => (
              <Rail.Item
                href={props.destinationHref(destination.id)}
                icon={destination.icon}
                label={destination.label}
                current={props.destination === destination.id}
              />
            )}
          </For>
          <Show when={props.onSearch}>
            {(search) => (
              <Rail.Item icon={IconMarkSearch} label="Search" onClick={() => search()()} />
            )}
          </Show>
        </Rail.List>
        <Rail.Footer>
          <Rail.Item
            href={props.settings.href}
            icon={IconMarkSettings}
            label="Settings"
            current={props.settings.current}
          />
          <Show
            when={props.account.menu}
            fallback={
              <Rail.Account
                name={props.account.name}
                initials={props.account.initials}
                tone={props.account.tone}
                onClick={() => props.onOpenAccount?.()}
              />
            }
          >
            {(menu) => (
              <Menu.Root placement="right-end">
                <Rail.Account
                  menu
                  name={props.account.name}
                  initials={props.account.initials}
                  tone={props.account.tone}
                />
                <Menu.Content>
                  <Menu.Header title={props.account.name} detail={menu().identity} />
                  <Menu.Separator />
                  <Menu.RadioGroup
                    label="Appearance"
                    value={menu().appearance}
                    onChange={(value) => menu().onAppearanceChange(value as Appearance)}
                  >
                    <Menu.RadioItem value="system">System</Menu.RadioItem>
                    <Menu.RadioItem value="light">Light</Menu.RadioItem>
                    <Menu.RadioItem value="dark">Dark</Menu.RadioItem>
                  </Menu.RadioGroup>
                  <Show when={menu().onPaletteChange}>
                    {(changePalette) => (
                      <>
                        <Menu.Separator />
                        <Menu.RadioGroup
                          label="Color palette"
                          value={menu().palette ?? "neutral"}
                          onChange={(value) => changePalette()(value as ColorPalette)}
                        >
                          <For each={paletteOptions}>
                            {(option) => (
                              <Menu.RadioItem value={option.value}>{option.label}</Menu.RadioItem>
                            )}
                          </For>
                        </Menu.RadioGroup>
                      </>
                    )}
                  </Show>
                  <Menu.Separator />
                  <Menu.Item onSelect={() => props.onSwitchWorkspace()}>Switch workspace</Menu.Item>
                  <Menu.Item onSelect={() => menu().onOpenSettings()}>Workspace settings</Menu.Item>
                  <Menu.Item onSelect={() => menu().onChangeName()}>Change your name…</Menu.Item>
                  <Menu.Separator />
                  <Menu.Item onSelect={() => menu().onSignOut()}>Sign out</Menu.Item>
                </Menu.Content>
              </Menu.Root>
            )}
          </Show>
        </Rail.Footer>
      </Rail.Root>
      <Sidebar.Root aria-label="Workspace">
        <Sidebar.Header>
          <Sidebar.Workspace
            name={props.workspace.name}
            initials={props.workspace.initials}
            onClick={() => props.onSwitchWorkspace()}
          />
          <Show when={props.onSearch}>
            {(search) => (
              <Sidebar.Search shortcut="⌘ K" onClick={() => search()()}>
                Find anything…
              </Sidebar.Search>
            )}
          </Show>
        </Sidebar.Header>
        <Sidebar.Body>{props.children}</Sidebar.Body>
      </Sidebar.Root>
    </Shell.Navigation>
  );
}

export interface HomeSidebarProps {
  readonly inbox: NavigationLink & { readonly unread?: number };
  readonly triage: NavigationLink & { readonly count?: number };
  readonly tasks: NavigationLink;
  /** The directory of groups the title links to. */
  readonly groupsDirectory: NavigationLink;
  readonly groups: ReadonlyArray<NavigationGroup>;
  /** The groups are still loading, so an empty list says nothing yet. */
  readonly groupsLoading?: boolean;
  readonly directMessages: ReadonlyArray<NavigationDirect>;
  readonly onBrowseGroups: () => void;
  /** Shows Create group, for readers who may create groups. */
  readonly onCreateGroup?: () => void;
  readonly onNewMessage: () => void;
}

/** Home's sidebar: Inbox, Triage, Tasks, groups, and direct messages. */
export function HomeSidebar(props: HomeSidebarProps) {
  return (
    <>
      <Sidebar.List>
        <Sidebar.Item
          href={props.inbox.href}
          icon={IconMarkMail}
          current={props.inbox.current}
          count={props.inbox.unread}
          countLabel={`${props.inbox.unread ?? 0} unread`}
        >
          Inbox
        </Sidebar.Item>
        <Sidebar.Item
          href={props.triage.href}
          icon={IconMarkTriage}
          current={props.triage.current}
          count={props.triage.count}
          countLabel={`${props.triage.count ?? 0} to triage`}
        >
          Triage
        </Sidebar.Item>
        <Sidebar.Item href={props.tasks.href} icon={IconMarkTasks} current={props.tasks.current}>
          Tasks
        </Sidebar.Item>
      </Sidebar.List>
      <Sidebar.Section>
        <Sidebar.SectionHeader
          title="Groups"
          href={props.groupsDirectory.href}
          current={props.groupsDirectory.current}
        >
          <IconButton
            icon={IconMarkSearch}
            label="Browse groups"
            size="compact"
            onClick={() => props.onBrowseGroups()}
          />
          <Show when={props.onCreateGroup}>
            {(create) => (
              <IconButton
                icon={IconMarkNew}
                label="Create group"
                size="compact"
                onClick={() => create()()}
              />
            )}
          </Show>
        </Sidebar.SectionHeader>
        <Show when={!props.groupsLoading && props.groups.length === 0}>
          <Sidebar.Empty>No groups yet</Sidebar.Empty>
        </Show>
        <Sidebar.List>
          <Keyed each={props.groups} by={(group) => group.id}>
            {(group) => (
              <>
                <Sidebar.Item
                  href={group().href}
                  icon={IconMarkChannel}
                  current={group().current}
                  count={group().pending || undefined}
                  countLabel={`${group().pending ?? 0} for you`}
                  unread={group().unread}
                  activity={group().activity}
                >
                  {group().name}
                </Sidebar.Item>
                <Keyed each={group().threads ?? []} by={(thread) => thread.id}>
                  {(thread) => (
                    <Sidebar.SubItem
                      href={thread().href}
                      icon={IconMessage}
                      state={thread().state}
                      current={thread().current}
                    >
                      {thread().title}
                    </Sidebar.SubItem>
                  )}
                </Keyed>
              </>
            )}
          </Keyed>
        </Sidebar.List>
      </Sidebar.Section>
      <Sidebar.Section>
        <Sidebar.SectionHeader title="Direct messages">
          <IconButton
            icon={IconMarkNew}
            label="New message"
            size="compact"
            onClick={() => props.onNewMessage()}
          />
        </Sidebar.SectionHeader>
        <Sidebar.List>
          <Keyed each={props.directMessages} by={(direct) => direct.id}>
            {(direct) => (
              <Sidebar.Item
                href={direct().href}
                current={direct().current}
                person={{
                  name: direct().name,
                  initials: direct().initials,
                  tone: direct().tone,
                }}
                status={direct().status}
                activity={direct().status?.activity}
                count={direct().pending || undefined}
                countLabel={`${direct().pending ?? 0} for you`}
                unread={direct().unread}
              >
                {direct().name}
              </Sidebar.Item>
            )}
          </Keyed>
        </Sidebar.List>
      </Sidebar.Section>
    </>
  );
}

/** One of a destination's items, such as an agent or a connection. */
export interface NavigationEntry extends NavigationLink {
  readonly id: string;
  readonly name: string;
  /** An icon before the name. */
  readonly icon?: IconComponent;
  /** An avatar before the name, for an agent. */
  readonly person?: {
    readonly name: string;
    readonly initials?: string;
    readonly tone?: AvatarToneName;
  };
  /** Agents at work: the most pressing turn state. */
  readonly activity?: "queued" | "working" | "stopping";
  /**
   * Its state: a patch on the avatar, or a mark at the row's end for an item without one, such
   * as an agent that needs setup. Word it with the destination's status helpers.
   */
  readonly status?: Status;
}

/** A titled list of a destination's items, with Browse and Create beside the title. */
export interface NavigationSection {
  readonly id: string;
  /** Without a title, the items stand alone, as Home's Inbox does. */
  readonly title?: string;
  /** The title links to the full list in the main content. */
  readonly href?: string;
  /** The full list is showing. */
  readonly current?: boolean;
  /** Shows Browse, opening the full list, named such as "Browse agents". */
  readonly browse?: { readonly label: string; readonly onBrowse: () => void };
  /** Shows Create, for a reader who may, named such as "Add agent". */
  readonly create?: { readonly label: string; readonly onCreate: () => void };
  readonly entries: ReadonlyArray<NavigationEntry>;
  /** The entries are still loading, so an empty list says nothing yet. */
  readonly loading?: boolean;
  /** Where the list has no entries, such as "No agents yet". */
  readonly empty?: string;
}

export interface DestinationSidebarProps {
  readonly sections: ReadonlyArray<NavigationSection>;
}

/**
 * A destination's sidebar: each section's items, which open in the main content. The same
 * pattern serves Agents, Connections, and Settings.
 */
export function DestinationSidebar(props: DestinationSidebarProps) {
  return (
    <Keyed each={props.sections} by={(section) => section.id}>
      {(section) => (
        <Sidebar.Section>
          <Show when={section().title}>
            {(title) => (
              <Sidebar.SectionHeader
                title={title()}
                href={section().href}
                current={section().current}
              >
                <Show when={section().browse}>
                  {(browse) => (
                    <IconButton
                      icon={IconList}
                      label={browse().label}
                      size="compact"
                      onClick={() => browse().onBrowse()}
                    />
                  )}
                </Show>
                <Show when={section().create}>
                  {(create) => (
                    <IconButton
                      icon={IconMarkNew}
                      label={create().label}
                      size="compact"
                      onClick={() => create().onCreate()}
                    />
                  )}
                </Show>
              </Sidebar.SectionHeader>
            )}
          </Show>
          <Show when={section().empty && !section().loading && section().entries.length === 0}>
            <Sidebar.Empty>{section().empty}</Sidebar.Empty>
          </Show>
          <Sidebar.List>
            <Keyed each={section().entries} by={(entry) => entry.id}>
              {(entry) => (
                <Sidebar.Item
                  href={entry().href}
                  current={entry().current}
                  icon={entry().icon}
                  person={entry().person}
                  activity={entry().activity}
                  status={entry().status}
                >
                  {entry().name}
                </Sidebar.Item>
              )}
            </Keyed>
          </Sidebar.List>
        </Sidebar.Section>
      )}
    </Keyed>
  );
}
