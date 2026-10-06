import {
  paths,
  useAppearance,
  useCreateGroup,
  useInboxPending,
  useChangeFeedStatus,
  useMemberName,
  useMemberProfiles,
  useMentionCandidates,
  useReply,
  useSession,
  useThreadConversation,
  useThreadFollow,
  useAgentList,
  useAgentStates,
  useConnectionList,
  useConnectionV2List,
  useEnvironmentList,
  useThreadTurnControls,
  useTurnActivity,
  useWorkspace,
  useDirectMessages,
  useWorkspaceGroups,
  useWorkspacePeople,
  useWorkspacePermission,
  type WorkspacePage,
} from "@amends/client";
import type { MentionCandidate } from "@amends/ui/components/composer";
import type { PickerPerson } from "@amends/ui/components/member-picker";
import { LiveStatus } from "@amends/ui/components/live-status";
import { Profiles } from "@amends/ui/components/profile-card";
import { Toast } from "@amends/ui/components/toast";
import { Shell } from "@amends/ui/patterns/shell";
import { ChangeName } from "@amends/ui/screens/account";
import { agentStatus } from "@amends/ui/screens/agents";
import { connectionStatus, type ConnectionCapability } from "@amends/ui/screens/connections";
import {
  capabilityLabels,
  capabilityNouns,
  connectionV2Status,
  type IntegrationCapability,
} from "@amends/ui/screens/connections-v2";
import { environmentStatus } from "@amends/ui/screens/environments";
import { NewMessage } from "@amends/ui/screens/direct";
import { CreateGroup, ThreadPane } from "@amends/ui/screens/group";
import { JumpTo, type JumpToItem } from "@amends/ui/screens/jump-to";
import {
  DestinationSidebar,
  HomeSidebar,
  WorkspaceNavigation,
  type Destination,
  type NavigationSection,
} from "@amends/ui/screens/workspace-navigation";
import {
  IconMarkAgents,
  IconMarkChannel,
  IconMarkConnections,
  IconMarkEnvironments,
  IconMarkMail,
  IconMarkMarketplace,
  IconMarkSettings,
  IconMessage,
  IconUsers,
} from "@amends/icons";
import { useLocation, useMatch, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import {
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  type ParentProps,
} from "solid-js";
import { TurnLog } from "./turn-log.tsx";
import { WorkspaceActionsContext, useWorkspaceActions } from "./workspace-actions.ts";

const href = (path: string) => path;
/** A workspace member or agent, as the member pickers show them. */
export const pickerPerson = (candidate: MentionCandidate): PickerPerson => ({
  id: candidate.id,
  name: candidate.name,
  kind: candidate.agent ? "Agent" : "Person",
});

/** The workspace frame: navigation, the page, and a thread open beside it. Keyed by workspace. */
export function WorkspaceLayout(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Frame workspaceId={workspaceId}>{props.children}</Frame>}
    </Show>
  );
}

function Frame(props: ParentProps<{ readonly workspaceId: string }>) {
  const workspaceId = props.workspaceId;
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const appearance = useAppearance();
  const membership = useWorkspace(() => workspaceId);
  const groups = useWorkspaceGroups(workspaceId);
  const directs = useDirectMessages(workspaceId);
  const pending = useInboxPending(workspaceId);
  const activity = useTurnActivity(workspaceId);
  const creator = useWorkspacePermission(workspaceId, "group.create");
  const live = useChangeFeedStatus();
  const conversation = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/*rest");
  const opened = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/threads/:threadId");
  const fromInbox = useMatch(
    () => "/workspaces/:workspaceId/inbox/groups/:groupId/threads/:threadId",
  );
  const browsing = useMatch(() => "/workspaces/:workspaceId/groups");
  const [search, setSearch] = useSearchParams<{ at?: string; to?: string; log?: string }>();
  const drafting = useMatch(() => "/workspaces/:workspaceId/direct");
  const [dialog, setDialog] = createSignal<"create-group" | "new-message" | "name" | "jump">();
  // ⌘K, or Ctrl+K, jumps anywhere in the workspace, from wherever the reader is.
  onMount(() => {
    const jump = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setDialog("jump");
    };
    document.addEventListener("keydown", jump);
    onCleanup(() => document.removeEventListener("keydown", jump));
  });
  const [toasts, setToasts] = createSignal<ReadonlyArray<{ id: number; text: string }>>([]);
  let toastId = 0;
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }]);

  const path = (page: WorkspacePage) => paths.workspacePage(workspaceId, page);
  const at = (page: WorkspacePage) => {
    const current = location.pathname.replace(/\/$/, "");
    return current === path(page) || current.startsWith(`${path(page)}/`);
  };
  const destination = (): Destination | undefined =>
    at("agents")
      ? "agents"
      : at("environments")
        ? "environments"
        : at("connections")
          ? "connections"
          : at("connections-v2")
            ? "connections-v2"
            : at("settings")
              ? undefined
              : "home";
  const groupId = () => conversation()?.params.groupId;
  // A thread opens beside its group's stream, or beside the inbox it was opened from.
  const panel = createMemo(
    () => {
      const { groupId, threadId } = (opened() ?? fromInbox())?.params ?? {};
      return groupId && threadId ? { groupId, threadId } : undefined;
    },
    undefined,
    { equals: (left, right) => left?.threadId === right?.threadId },
  );
  const closePanel = () => {
    const group = groupId();
    navigate(group ? paths.group(workspaceId, group) : path("inbox"));
  };
  const ownName = () => membership()?.member.name ?? session.session?.humanId ?? "";

  const people = useWorkspacePeople(workspaceId);
  const creation = useCreateGroup(workspaceId, (id) => {
    setDialog(undefined);
    navigate(paths.group(workspaceId, id));
    toast("Group created");
  });
  const openCreate = () => {
    creation.reset();
    setDialog("create-group");
  };
  const [recipients, setRecipients] = createSignal<string[]>([]);
  const existing = () => (recipients().length > 0 ? groups.directWith(recipients()) : undefined);
  const name = useMemberName(workspaceId, () => setDialog(undefined));
  const profiles = useMemberProfiles(workspaceId);
  const agentStates = useAgentStates(workspaceId);
  /** An agent's state as its status, for its profile card and its direct message row. */
  const agentStatusOf = (memberId: string) => {
    const state = agentStates(memberId);
    return state && agentStatus(state.issues, state.activity);
  };
  /** A one-to-one conversation's status: the other member's. People have none until presence. */
  const soleStatus = (memberIds: readonly string[]) => {
    const [only, ...others] = memberIds;
    return only !== undefined && others.length === 0 ? agentStatusOf(only) : undefined;
  };

  return (
    <WorkspaceActionsContext.Provider
      value={{
        // Read when used: the permission loads after the layout mounts.
        get createGroup() {
          return creator() ? openCreate : undefined;
        },
        toast,
      }}
    >
      <Profiles.Root
        profile={(memberId) => {
          const profile = profiles(memberId);
          const status = agentStatusOf(memberId);
          return profile && status ? { ...profile, status } : profile;
        }}
        onMessage={(memberId) => {
          // Their conversation with the reader, or a first message to them.
          const existing = groups.directWith([memberId]);
          navigate(
            existing
              ? paths.group(workspaceId, existing.id)
              : paths.directDraft(workspaceId, [memberId]),
          );
        }}
        onOpenAgent={(memberId) => {
          const agentId = profiles(memberId)?.agentId;
          if (agentId) navigate(paths.agent(workspaceId, agentId));
        }}
        onChangeName={() => {
          name.reset();
          setDialog("name");
        }}
      >
        <Shell.Root>
          <WorkspaceNavigation
            workspace={{ name: membership()?.workspace.name ?? "" }}
            account={{
              name: ownName(),
              menu: {
                identity: session.session?.humanId ?? "",
                appearance: appearance.preference(),
                onAppearanceChange: appearance.setPreference,
                palette: appearance.palette(),
                onPaletteChange: appearance.setPalette,
                onOpenSettings: () => navigate(path("settings")),
                onChangeName: () => {
                  name.reset();
                  setDialog("name");
                },
                onSignOut: session.signOut,
              },
            }}
            homeHref={href(path("home"))}
            destinations={["home", "agents", "environments", "connections", "connections-v2"]}
            destination={destination()}
            destinationHref={(target) => href(path(target))}
            settings={{ href: href(path("settings")), current: at("settings") }}
            onSearch={() => setDialog("jump")}
            onSwitchWorkspace={() => navigate(paths.workspaces)}
          >
            <Switch
              fallback={
                <HomeSidebar
                  inbox={{ href: href(path("inbox")), current: at("inbox"), unread: pending() }}
                  triage={{ href: href(path("triage")), current: at("triage") }}
                  tasks={{ href: href(path("tasks")), current: at("tasks") }}
                  groupsDirectory={{
                    href: href(paths.groups(workspaceId)),
                    current: browsing() !== undefined,
                  }}
                  groups={groups.teams().map((group) => ({
                    id: group.id,
                    name: group.name,
                    href: href(paths.group(workspaceId, group.id)),
                    current: groupId() === group.id,
                    pending: group.pending,
                    unread: group.unread,
                    activity: activity.inGroup(group.id),
                  }))}
                  groupsLoading={groups.all() === undefined}
                  directMessages={directs().map((entry) =>
                    entry.kind === "conversation"
                      ? {
                          id: entry.id,
                          name: entry.name,
                          href: href(paths.group(workspaceId, entry.id)),
                          current: groupId() === entry.id,
                          pending: entry.pending,
                          unread: entry.unread,
                          status: soleStatus(entry.memberIds),
                        }
                      : {
                          id: entry.id,
                          name: entry.name,
                          // A first message; the conversation starts when it is sent.
                          href: href(paths.directDraft(workspaceId, entry.memberIds)),
                          current: drafting() !== undefined && search.to === entry.id,
                          status: soleStatus(entry.memberIds),
                        },
                  )}
                  onBrowseGroups={() => navigate(`${paths.groups(workspaceId)}?tab=discover`)}
                  onCreateGroup={creator() ? openCreate : undefined}
                  onNewMessage={() => {
                    setRecipients([]);
                    setDialog("new-message");
                  }}
                />
              }
            >
              <Match when={at("settings")}>
                <DestinationSidebar
                  sections={[
                    {
                      id: "settings",
                      title: "Settings",
                      entries: [
                        {
                          id: "workspace",
                          name: "Workspace",
                          href: href(paths.settingsSection(workspaceId, "workspace")),
                          current: at("settings") && !location.pathname.endsWith("/members"),
                          icon: IconMarkSettings,
                        },
                        {
                          id: "members",
                          name: "Members",
                          href: href(paths.settingsSection(workspaceId, "members")),
                          current: location.pathname.endsWith("/settings/members"),
                          icon: IconUsers,
                        },
                      ],
                    },
                  ]}
                />
              </Match>
              <Match when={destination() === "agents"}>
                <AgentsSidebar workspaceId={workspaceId} />
              </Match>
              <Match when={destination() === "environments"}>
                <EnvironmentsSidebar workspaceId={workspaceId} />
              </Match>
              <Match when={destination() === "connections"}>
                <ConnectionsSidebar workspaceId={workspaceId} />
              </Match>
              <Match when={destination() === "connections-v2"}>
                <ConnectionsV2Sidebar workspaceId={workspaceId} />
              </Match>
            </Switch>
          </WorkspaceNavigation>
          <Shell.Main>{props.children}</Shell.Main>
          <Show when={panel()} keyed>
            {(thread) => (
              <ThreadPanel
                workspaceId={workspaceId}
                groupId={thread.groupId}
                threadId={thread.threadId}
                // Opened from the inbox, the thread opens at the message that notified the reader.
                focus={fromInbox() && search.at ? Number(search.at) || undefined : undefined}
                fromInbox={fromInbox() !== undefined}
                onClose={closePanel}
                log={search.log}
                onOpenLog={(turnId) => setSearch({ log: turnId })}
                onCloseLog={() => setSearch({ log: undefined })}
              />
            )}
          </Show>
          <CreateGroup
            open={dialog() === "create-group"}
            onClose={() => setDialog(undefined)}
            name={creation.name()}
            onNameChange={creation.setName}
            visibility={creation.visibility() === "Public" ? "public" : "private"}
            onVisibilityChange={(value) =>
              creation.setVisibility(value === "public" ? "Public" : "Private")
            }
            you={{ id: membership()?.member.id ?? "you", name: "You", kind: "Person" }}
            candidates={people().map(pickerPerson)}
            selected={[...creation.members()]}
            onSelectedChange={creation.setMembers}
            creating={creation.pending()}
            error={creation.error()}
            onCreate={creation.create}
          />
          <NewMessage
            open={dialog() === "new-message"}
            onClose={() => setDialog(undefined)}
            candidates={people().map(pickerPerson)}
            selected={recipients()}
            onSelectedChange={setRecipients}
            existing={existing() !== undefined}
            onConfirm={() => {
              const group = existing();
              setDialog(undefined);
              navigate(
                group
                  ? paths.group(workspaceId, group.id)
                  : paths.directDraft(workspaceId, recipients()),
              );
            }}
          />
          <ChangeName
            open={dialog() === "name"}
            onClose={() => setDialog(undefined)}
            workspaceName={membership()?.workspace.name ?? ""}
            name={name.name()}
            onNameChange={name.setName}
            ready={name.ready()}
            pending={name.pending()}
            error={name.error()}
            onSave={name.save}
          />
          <Show when={dialog() === "jump"}>
            <JumpToDialog workspaceId={workspaceId} onClose={() => setDialog(undefined)} />
          </Show>
          <LiveStatus status={live()} />
          <Toast.Region>
            <For each={toasts()}>
              {(item) => (
                <Toast.Item
                  onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}
                >
                  {item.text}
                </Toast.Item>
              )}
            </For>
          </Toast.Region>
        </Shell.Root>
      </Profiles.Root>
    </WorkspaceActionsContext.Provider>
  );
}

/** A place Jump to offers, and the path it leads to. */
type Place = JumpToItem & { readonly path: string };

/**
 * Jump to: pages, groups, conversations, people, and the workspace's agents, environments, and
 * connections, by name. The lists it offers load while it is open.
 */
function JumpToDialog(props: { readonly workspaceId: string; readonly onClose: () => void }) {
  const workspaceId = props.workspaceId;
  const navigate = useNavigate();
  const groups = useWorkspaceGroups(workspaceId);
  const people = useWorkspacePeople(workspaceId);
  const agents = useAgentList(workspaceId);
  const environments = useEnvironmentList(workspaceId);
  const connections = useConnectionList(workspaceId);
  const connectionsV2 = useConnectionV2List(workspaceId);
  const page = (target: WorkspacePage) => paths.workspacePage(workspaceId, target);
  const places = createMemo((): readonly Place[] => {
    const humans = new Set(people().flatMap((person) => (person.agent ? [] : [person.id])));
    return [
      {
        id: "page:inbox",
        label: "Inbox",
        section: "Go to",
        icon: IconMarkMail,
        path: page("inbox"),
      },
      {
        id: "page:groups",
        label: "Groups",
        section: "Go to",
        detail: "Browse",
        icon: IconMarkChannel,
        path: paths.groups(workspaceId),
      },
      {
        id: "page:agents",
        label: "Agents",
        section: "Go to",
        icon: IconMarkAgents,
        path: page("agents"),
      },
      {
        id: "page:environments",
        label: "Environments",
        section: "Go to",
        icon: IconMarkEnvironments,
        path: page("environments"),
      },
      {
        id: "page:connections",
        label: "Connections",
        section: "Go to",
        icon: IconMarkConnections,
        path: page("connections"),
      },
      {
        id: "page:connections-v2",
        label: "Connections v2",
        section: "Go to",
        icon: IconMarkMarketplace,
        path: page("connections-v2"),
      },
      {
        id: "page:settings",
        label: "Settings",
        section: "Go to",
        icon: IconMarkSettings,
        path: paths.settingsSection(workspaceId, "workspace"),
      },
      {
        id: "page:members",
        label: "Members",
        section: "Go to",
        detail: "Settings",
        icon: IconUsers,
        path: paths.settingsSection(workspaceId, "members"),
      },
      ...groups.teams().map((group) => ({
        id: `group:${group.id}`,
        label: group.name,
        section: "Groups",
        icon: IconMarkChannel,
        path: paths.group(workspaceId, group.id),
      })),
      // A conversation with one person is under People; with several, or with an agent, here.
      ...groups
        .directs()
        .filter((group) => !(group.memberIds.length === 1 && humans.has(group.memberIds[0]!)))
        .map((group) => ({
          id: `group:${group.id}`,
          label: group.name,
          section: "Direct messages",
          icon: IconMessage,
          path: paths.group(workspaceId, group.id),
        })),
      ...people()
        .filter((person) => !person.agent)
        .map((person) => {
          const existing = groups.directWith([person.id]);
          return {
            id: `person:${person.id}`,
            label: person.name,
            section: "People",
            detail: "Direct message",
            person: { name: person.name },
            path: existing
              ? paths.group(workspaceId, existing.id)
              : paths.directDraft(workspaceId, [person.id]),
          };
        }),
      ...agents.agents().map((agent) => ({
        id: `agent:${agent.id}`,
        label: agent.name,
        section: "Agents",
        person: {
          name: agent.name,
          initials: agent.name.trim().charAt(0).toUpperCase(),
          tone: "lilac" as const,
        },
        path: paths.agent(workspaceId, agent.id),
      })),
      ...environments.environments().map((environment) => ({
        id: `environment:${environment.id}`,
        label: environment.name,
        section: "Environments",
        icon: IconMarkEnvironments,
        path: paths.environment(workspaceId, environment.id),
      })),
      ...connections.connections().map((connection) => ({
        id: `connection:${connection.id}`,
        label: connection.name,
        section: "Connections",
        icon: IconMarkConnections,
        path: paths.connection(workspaceId, connection.id),
      })),
      ...connectionsV2.connections().map((connection) => ({
        id: `connection-v2:${connection.id}`,
        label: connection.name,
        section: "Connections v2",
        icon: IconMarkConnections,
        path: paths.connectionV2(workspaceId, connection.id),
      })),
    ];
  });
  return (
    <JumpTo
      open
      onClose={props.onClose}
      items={places()}
      loading={groups.all() === undefined || agents.loading() || environments.loading()}
      onOpen={(id) => {
        const place = places().find((entry) => entry.id === id);
        props.onClose();
        if (place) navigate(place.path);
      }}
    />
  );
}

/**
 * The Agents sidebar: each agent with its status patch, and the logo while it is at work. The title and Browse
 * open the list; + opens Add agent over the current page, by `?add=agent`.
 */
function AgentsSidebar(props: { readonly workspaceId: string }) {
  const navigate = useNavigate();
  const [, setSearch] = useSearchParams<{ add?: string }>();
  const list = useAgentList(props.workspaceId);
  const open = useMatch(() => "/workspaces/:workspaceId/agents/:agentId/*rest");
  const base = paths.workspacePage(props.workspaceId, "agents");
  return (
    <DestinationSidebar
      sections={[
        {
          id: "agents",
          title: "Agents",
          href: href(base),
          current: open() === undefined,
          browse: { label: "Browse agents", onBrowse: () => navigate(base) },
          create: list.canCreate()
            ? { label: "Add agent", onCreate: () => setSearch({ add: "agent" }) }
            : undefined,
          entries: list.agents().map((agent) => ({
            id: agent.id,
            name: agent.name,
            href: href(paths.agent(props.workspaceId, agent.id)),
            current: open()?.params.agentId === agent.id,
            person: {
              name: agent.name,
              initials: agent.name.trim().charAt(0).toUpperCase(),
              tone: "lilac" as const,
            },
            activity: agent.activity?.state,
            status: agentStatus(agent.issues, agent.activity),
          })),
          loading: list.loading(),
          empty: "No agents yet",
        },
      ]}
    />
  );
}

/**
 * The Environments sidebar: each environment, marked when it needs setup. The title and Browse open
 * the list; + opens Add environment over the current page, by `?add=environment`.
 */
function EnvironmentsSidebar(props: { readonly workspaceId: string }) {
  const navigate = useNavigate();
  const [, setSearch] = useSearchParams<{ add?: string }>();
  const list = useEnvironmentList(props.workspaceId);
  const open = useMatch(() => "/workspaces/:workspaceId/environments/:environmentId/*rest");
  const base = paths.workspacePage(props.workspaceId, "environments");
  return (
    <DestinationSidebar
      sections={[
        {
          id: "environments",
          title: "Environments",
          href: href(base),
          current: open() === undefined,
          browse: { label: "Browse environments", onBrowse: () => navigate(base) },
          create: list.canCreate()
            ? { label: "Add environment", onCreate: () => setSearch({ add: "environment" }) }
            : undefined,
          entries: list.environments().map((environment) => ({
            id: environment.id,
            name: environment.name,
            href: href(paths.environment(props.workspaceId, environment.id)),
            current: open()?.params.environmentId === environment.id,
            icon: IconMarkEnvironments,
            status: environmentStatus(environment.issues),
          })),
          loading: list.loading(),
          empty: "No environments yet",
        },
      ]}
    />
  );
}

/**
 * The Connections sidebar: model providers, then the accounts sandboxes run under, each marked when
 * it needs setup. A section's title and Browse open the list of that kind; its + opens Add
 * connection over the current page for that kind, by `?add=`.
 */
function ConnectionsSidebar(props: { readonly workspaceId: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams<{ add?: string; kind?: string }>();
  const list = useConnectionList(props.workspaceId);
  const open = useMatch(() => "/workspaces/:workspaceId/connections/:connectionId");
  const browsing = useMatch(() => "/workspaces/:workspaceId/connections");
  const base = paths.workspacePage(props.workspaceId, "connections");
  const section = (
    kind: ConnectionCapability | undefined,
    title: string,
    create?: string,
  ): NavigationSection => ({
    id: kind ?? "other",
    title,
    href: kind && href(`${base}?kind=${kind}`),
    current: kind !== undefined && browsing() !== undefined && search.kind === kind,
    browse: kind && {
      label: `Browse ${title.toLowerCase()}`,
      onBrowse: () => navigate(`${base}?kind=${kind}`),
    },
    create:
      kind && create && list.canCreate()
        ? { label: create, onCreate: () => setSearch({ add: kind }) }
        : undefined,
    entries: list
      .connections()
      .filter((connection) => connection.capability === kind)
      .map((connection) => ({
        id: connection.id,
        name: connection.name,
        href: href(paths.connection(props.workspaceId, connection.id)),
        current: open()?.params.connectionId === connection.id,
        icon: IconMarkConnections,
        status: connectionStatus(connection),
      })),
    loading: list.loading(),
    empty: kind && "None yet",
  });
  return (
    <DestinationSidebar
      sections={[
        section("model-access", "Model providers", "Add model provider"),
        section("sandboxes", "Sandbox accounts", "Add sandbox account"),
        // Connections whose provider this host no longer installs give nothing it knows.
        ...(list.connections().some((connection) => connection.capability === undefined)
          ? [section(undefined, "Unavailable")]
          : []),
      ]}
    />
  );
}

/**
 * The Connections v2 sidebar: the connections that give models, tools, sandboxes, and harnesses,
 * each marked when its integration refuses its setup. A connection whose integration this host no
 * longer installs gives none of them, so it shows only in the full list. A section's title and
 * Browse open the list of that capability; its + opens Add connection over the current page for
 * it, by `?add=`.
 */
function ConnectionsV2Sidebar(props: { readonly workspaceId: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams<{ add?: string; tab?: string }>();
  const list = useConnectionV2List(props.workspaceId);
  const open = useMatch(() => "/workspaces/:workspaceId/connections-v2/:connectionId");
  const browsing = useMatch(() => "/workspaces/:workspaceId/connections-v2");
  const base = paths.workspacePage(props.workspaceId, "connections-v2");
  const section = (capability: IntegrationCapability): NavigationSection => ({
    id: capability,
    title: capabilityLabels[capability],
    href: href(`${base}?tab=${capability}`),
    current: browsing() !== undefined && search.tab === capability,
    browse: {
      label: `Browse ${capabilityLabels[capability].toLowerCase()}`,
      onBrowse: () => navigate(`${base}?tab=${capability}`),
    },
    create: list.canCreate()
      ? {
          label: `Add ${capabilityNouns[capability]} connection`,
          onCreate: () => setSearch({ add: capability }),
        }
      : undefined,
    entries: list
      .connections()
      .filter((connection) => connection.provides.includes(capability))
      .map((connection) => ({
        id: connection.id,
        name: connection.name,
        href: href(paths.connectionV2(props.workspaceId, connection.id)),
        current: open()?.params.connectionId === connection.id,
        icon: IconMarkConnections,
        status: connectionV2Status(connection),
      })),
    loading: list.loading(),
    empty: "None yet",
  });
  return (
    <DestinationSidebar
      sections={(["models", "tools", "sandboxes", "harnesses"] as const).map(section)}
    />
  );
}

/**
 * One thread beside the page: its timeline, its agents' turns, following, and a composer for
 * replying; or one of its turns' logs in its place, keeping the reply being written.
 */
function ThreadPanel(props: {
  readonly workspaceId: string;
  readonly groupId: string;
  readonly threadId: string;
  readonly focus?: number;
  /** Opened from the inbox: it says why the notification came, and Back leads to the inbox. */
  readonly fromInbox?: boolean;
  readonly onClose: () => void;
  /** The turn whose log shows in place of the thread. */
  readonly log?: string;
  readonly onOpenLog: (turnId: string) => void;
  readonly onCloseLog: () => void;
}) {
  const groups = useWorkspaceGroups(props.workspaceId);
  const group = () => groups.group(props.groupId);
  const thread = useThreadConversation(props.workspaceId, props.threadId, () => props.focus);
  const reply = useReply(props.workspaceId, props.threadId);
  const candidates = useMentionCandidates(props.workspaceId, props.groupId);
  const actions = useWorkspaceActions();
  const follow = useThreadFollow(props.workspaceId, props.groupId, props.threadId, {
    changed: (following) =>
      actions.toast(following ? "Following this thread" : "Unfollowed this thread"),
    failed: (following) =>
      actions.toast(
        following
          ? "Couldn’t follow the thread. Try again."
          : "Couldn’t unfollow the thread. Try again.",
      ),
  });
  const turns = useThreadTurnControls(props.workspaceId, props.threadId);
  // An agent's reply names the turn that posted it, whose log its actions open. A turn shows where
  // its agent took on the work until it replies, with where to fix the agent's setup.
  const entries = () =>
    thread
      .entries()
      .map((entry) =>
        entry.kind === "turn" && entry.agentId !== undefined
          ? { ...entry, agentHref: href(paths.agent(props.workspaceId, entry.agentId)) }
          : entry,
      );
  return (
    <Show
      when={props.log}
      keyed
      fallback={
        <ThreadPane
          title="Thread"
          groupName={group()?.name ?? ""}
          groupKind={group()?.kind}
          reason={props.fromInbox ? thread.focusReason() : undefined}
          backLabel={props.fromInbox ? "Inbox" : undefined}
          entries={entries()}
          onOpenTurnLog={props.onOpenLog}
          turns={{
            onStop: turns.stop,
            onRetry: turns.retry,
            onOpenLog: props.onOpenLog,
            acting: turns.acting(),
            problem: turns.problem(),
          }}
          days
          repliesDivider
          status={thread.status()}
          onRetry={thread.retry}
          earlier={
            thread.earlier()
              ? {
                  loading: thread.loadingEarlier(),
                  failed: thread.earlierFailed(),
                  onLoad: thread.loadEarlier,
                }
              : undefined
          }
          focusId={thread.focusId()}
          typing={thread.typing()}
          follow={
            !follow.followable() || follow.following() === undefined
              ? undefined
              : {
                  following: follow.following() ?? false,
                  pending: follow.pending(),
                  onToggle: follow.toggle,
                }
          }
          onClose={props.onClose}
          placeholder="Reply in thread"
          commands={
            follow.followable() && follow.following() !== undefined
              ? [
                  follow.following()
                    ? { name: "unfollow", description: "Stop following this thread" }
                    : { name: "follow", description: "Follow this thread to hear of its replies" },
                ]
              : []
          }
          onCommand={(command) => {
            if ((command === "follow") !== follow.following()) follow.toggle();
          }}
          draft={reply.draft()}
          onDraftChange={reply.setDraft}
          onSend={() => reply.send()}
          sending={reply.pending()}
          sendError={reply.error()}
          mentionCandidates={candidates()}
        />
      }
    >
      {(turnId) => (
        <TurnLog
          workspaceId={props.workspaceId}
          turnId={turnId}
          onBack={props.onCloseLog}
          onClose={props.onClose}
          onRetried={props.onOpenLog}
        />
      )}
    </Show>
  );
}
