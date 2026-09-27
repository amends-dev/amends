import { For } from "solid-js";
import {
  IconMarkAgents,
  IconMarkChannel,
  IconMarkConnections,
  IconMarkEnvironments,
  IconMarkHome,
  IconMarkMail,
  IconMarkNew,
  IconMarkSearch,
  IconMarkSettings,
  IconMarkTasks,
  IconMarkTriage,
  IconMessage,
} from "@amends/icons";
import { IconButton } from "../../components/icon-button/index.ts";
import type { TaskState } from "../../components/task-status/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { Rail } from "../../patterns/rail/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { Sidebar } from "../../patterns/sidebar/index.ts";

export type Destination = "home" | "agents" | "environments" | "connections";

const destinations = [
  { id: "home", label: "Home", icon: IconMarkHome },
  { id: "agents", label: "Agents", icon: IconMarkAgents },
  { id: "environments", label: "Environments", icon: IconMarkEnvironments },
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
  readonly threads?: readonly NavigationThread[];
}

export interface NavigationDirect extends NavigationLink {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
}

export interface WorkspaceNavigationProps {
  readonly workspace: { readonly name: string; readonly initials?: string };
  readonly account: {
    readonly name: string;
    readonly initials?: string;
    readonly tone?: AvatarToneName;
  };
  readonly homeHref: string;
  readonly destination: Destination;
  readonly destinationHref: (destination: Destination) => string;
  readonly settings: NavigationLink;
  readonly inbox: NavigationLink & { readonly unread?: number };
  readonly triage: NavigationLink & { readonly count?: number };
  readonly tasks: NavigationLink;
  /** The directory of groups the title links to. */
  readonly groupsDirectory: NavigationLink;
  readonly groups: readonly NavigationGroup[];
  readonly directMessages: readonly NavigationDirect[];
  readonly onSearch: () => void;
  readonly onSwitchWorkspace: () => void;
  readonly onOpenAccount: () => void;
  readonly onBrowseGroups: () => void;
  readonly onCreateGroup: () => void;
  readonly onNewMessage: () => void;
}

/** The rail and the Home sidebar: Inbox, Triage, Tasks, groups, and direct messages. */
export function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  return (
    <Shell.Navigation>
      <Rail.Root>
        <Rail.Brand href={props.homeHref} />
        <Rail.List>
          <For each={destinations}>
            {(destination) => (
              <Rail.Item
                href={props.destinationHref(destination.id)}
                icon={destination.icon}
                label={destination.label}
                current={props.destination === destination.id}
              />
            )}
          </For>
          <Rail.Item icon={IconMarkSearch} label="Search" onClick={() => props.onSearch()} />
        </Rail.List>
        <Rail.Footer>
          <Rail.Item
            href={props.settings.href}
            icon={IconMarkSettings}
            label="Settings"
            current={props.settings.current}
          />
          <Rail.Account
            name={props.account.name}
            initials={props.account.initials}
            tone={props.account.tone}
            onClick={() => props.onOpenAccount()}
          />
        </Rail.Footer>
      </Rail.Root>
      <Sidebar.Root aria-label="Workspace">
        <Sidebar.Header>
          <Sidebar.Workspace
            name={props.workspace.name}
            initials={props.workspace.initials}
            onClick={() => props.onSwitchWorkspace()}
          />
          <Sidebar.Search shortcut="⌘ K" onClick={() => props.onSearch()}>
            Find anything…
          </Sidebar.Search>
        </Sidebar.Header>
        <Sidebar.Body>
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
            <Sidebar.Item
              href={props.tasks.href}
              icon={IconMarkTasks}
              current={props.tasks.current}
            >
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
              <IconButton
                icon={IconMarkNew}
                label="Create group"
                size="compact"
                onClick={() => props.onCreateGroup()}
              />
            </Sidebar.SectionHeader>
            <Sidebar.List>
              <For each={props.groups}>
                {(group) => (
                  <>
                    <Sidebar.Item href={group.href} icon={IconMarkChannel} current={group.current}>
                      {group.name}
                    </Sidebar.Item>
                    <For each={group.threads}>
                      {(thread) => (
                        <Sidebar.SubItem
                          href={thread.href}
                          icon={IconMessage}
                          state={thread.state}
                          current={thread.current}
                        >
                          {thread.title}
                        </Sidebar.SubItem>
                      )}
                    </For>
                  </>
                )}
              </For>
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
              <For each={props.directMessages}>
                {(direct) => (
                  <Sidebar.Item
                    href={direct.href}
                    current={direct.current}
                    person={{ name: direct.name, initials: direct.initials, tone: direct.tone }}
                  >
                    {direct.name}
                  </Sidebar.Item>
                )}
              </For>
            </Sidebar.List>
          </Sidebar.Section>
        </Sidebar.Body>
      </Sidebar.Root>
    </Shell.Navigation>
  );
}
