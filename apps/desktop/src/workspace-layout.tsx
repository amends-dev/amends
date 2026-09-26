import {
  paths,
  useGroups,
  useInboxPending,
  useWorkspace,
  type WorkspacePage,
} from "@amends/client";
import { Account } from "@amends/features/account";
import {
  DirectDraftName,
  GroupFollowAction,
  GroupFollowNote,
  GroupMembersAction,
  GroupName,
  GroupsNavigation,
  ThreadPanel,
} from "@amends/features/conversations";
import { Live } from "@amends/features/live";
import { Shell } from "@amends/ui/compositions/shell";
import { PageHeader } from "@amends/ui/compositions/page-header";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { Column, Row } from "@amends/ui/primitives/layout";
import {
  IconMarkHome,
  IconMarkMail,
  IconMarkTriage,
  IconMarkTasks,
  IconMarkEnvironments,
  IconMarkConnections,
  IconMarkSettings,
} from "@amends/icons";
import { useLocation, useMatch, useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, on, Show, type JSX, type ParentProps } from "solid-js";

const labels: Record<WorkspacePage, string> = {
  home: "Home",
  inbox: "Inbox",
  triage: "Triage",
  tasks: "Tasks",
  environments: "Environments",
  connections: "Connections",
  settings: "Settings",
};
/** Pages whose own subpaths, such as a thread opened from the inbox, are still that page. */
const nested = new Set<WorkspacePage>(["inbox", "settings"]);
const href = (path: string) => `#${path}`;
function WorkspaceLink(
  props: ParentProps<{ page: WorkspacePage; label: string; count?: number | undefined }>,
) {
  const params = useParams<{ workspaceId: string }>(),
    location = useLocation(),
    shell = Shell.useShell();
  const path = () => paths.workspacePage(params.workspaceId, props.page);
  return (
    <Navigation.Link
      href={href(path())}
      aria-current={
        location.pathname.replace(/\/$/, "") === path() ||
        (nested.has(props.page) && location.pathname.startsWith(`${path()}/`))
          ? "page"
          : undefined
      }
      onClick={(event) => {
        if (ordinary(event)) shell.closeNavigation();
      }}
    >
      <Navigation.Icon>{props.children}</Navigation.Icon>
      <Navigation.Label>{props.label}</Navigation.Label>
      <Show when={props.count}>
        {(count) => (
          <Navigation.Count aria-label={`${count()} unread`}>{String(count())}</Navigation.Count>
        )}
      </Show>
    </Navigation.Link>
  );
}
function ordinary(event: MouseEvent) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
function AccountControl() {
  const params = useParams<{ workspaceId: string }>();
  const shell = Shell.useShell();
  const close: JSX.EventHandler<HTMLAnchorElement, MouseEvent> = (event) => {
    if (ordinary(event)) shell.closeNavigation();
  };
  return (
    <Account.Root>
      <Account.Trigger />
      <Account.Content>
        <Account.Identity />
        <Divider.Line />
        <Account.Appearance />
        <Divider.Line />
        <Account.Actions>
          <Account.Link href={href(paths.workspaces)} onClick={close}>
            Switch workspace
          </Account.Link>
          <Account.Link
            href={href(paths.workspacePage(params.workspaceId, "settings"))}
            onClick={close}
          >
            Settings
          </Account.Link>
          <Account.SignOut />
        </Account.Actions>
      </Account.Content>
    </Account.Root>
  );
}
/** App-owned composition. The route guard keeps this instance alive while membership remains active. */
export function WorkspaceLayout(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>(),
    location = useLocation(),
    shell = Shell.useShell();
  const membership = useWorkspace(() => params.workspaceId);
  const navigate = useNavigate();
  const conversation = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/*rest");
  const opened = useMatch(() => "/workspaces/:workspaceId/groups/:groupId/threads/:threadId");
  const fromInbox = useMatch(
    () => "/workspaces/:workspaceId/inbox/groups/:groupId/threads/:threadId",
  );
  const drafting = useMatch(() => "/workspaces/:workspaceId/direct");
  const [search] = useSearchParams<{ to?: string }>();
  const pending = useInboxPending(params.workspaceId);
  const groups = useGroups(params.workspaceId);
  const groupId = () => conversation()?.params.groupId;
  const direct = () =>
    groups.value()?.find((item) => item.group.id === groupId())?.group.kind === "Direct";
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
    navigate(
      group
        ? paths.group(params.workspaceId, group)
        : paths.workspacePage(params.workspaceId, "inbox"),
    );
  };
  const settings = () =>
    location.pathname.startsWith(paths.workspacePage(params.workspaceId, "settings"));
  const settingsSection = () => {
    const section = location.pathname.split("/").at(-1);
    return section === "members" || section === "invites" ? section : "workspace";
  };
  const page = () =>
    (Object.keys(labels) as WorkspacePage[]).find(
      (name) =>
        paths.workspacePage(params.workspaceId, name) === location.pathname.replace(/\/$/, "") ||
        (nested.has(name) &&
          location.pathname.startsWith(`${paths.workspacePage(params.workspaceId, name)}/`)),
    );
  const title = () => {
    if (groupId()) return "Conversation";
    if (drafting()) return "New message";
    if (settings())
      return settingsSection() === "members"
        ? "People"
        : settingsSection() === "invites"
          ? "Invites"
          : "Workspace";
    const current = page();
    return current ? labels[current] : "Page not found";
  };
  const crumbs = () => {
    if (groupId()) return direct() ? "Workspace / Direct" : "Workspace / Groups";
    if (drafting()) return "Workspace / Direct";
    if (settings()) return "Configure / Settings";
    const configure = page() === "environments" || page() === "connections";
    return `${configure ? "Configure" : "Workspace"} / ${title()}`;
  };
  createEffect(
    on(
      () => location.pathname,
      () => shell.closeNavigation(),
      { defer: true },
    ),
  );
  return (
    <>
      <Shell.Sidebar aria-label="Workspace sidebar">
        <Shell.SidebarHeader>
          <Row gap={2} wrap={false}>
            <WorkspaceMark variant="brand" decorative>
              {Array.from(membership()?.workspace.name ?? "?")[0]?.toLocaleUpperCase() ?? "?"}
            </WorkspaceMark>
            <Column gap={0}>
              <Shell.SidebarLabel>{membership()?.workspace.name}</Shell.SidebarLabel>
              <Shell.SidebarSubtitle>workspace</Shell.SidebarSubtitle>
            </Column>
          </Row>
        </Shell.SidebarHeader>
        <Shell.SidebarUtility>
          <AccountControl />
        </Shell.SidebarUtility>
        <Shell.SidebarContent>
          <Navigation.Root aria-label="Workspace">
            <Navigation.Section>
              <WorkspaceLink page="home" label="Home">
                <IconMarkHome />
              </WorkspaceLink>
              <WorkspaceLink page="inbox" label="Inbox" count={pending()}>
                <IconMarkMail />
              </WorkspaceLink>
              <WorkspaceLink page="triage" label="Triage">
                <IconMarkTriage />
              </WorkspaceLink>
              <WorkspaceLink page="tasks" label="Tasks">
                <IconMarkTasks />
              </WorkspaceLink>
            </Navigation.Section>
            <GroupsNavigation
              workspaceId={params.workspaceId}
              href={(id) => href(paths.group(params.workspaceId, id))}
              current={groupId()}
              onCreated={(id) => navigate(paths.group(params.workspaceId, id))}
              onMessage={(target) =>
                navigate(
                  "groupId" in target
                    ? paths.group(params.workspaceId, target.groupId)
                    : paths.directDraft(params.workspaceId, target.memberIds),
                )
              }
            />
            <Navigation.Section>
              <Navigation.SectionHeader>
                <Navigation.SectionLabel>Configure</Navigation.SectionLabel>
                <Divider.Line />
              </Navigation.SectionHeader>
              <WorkspaceLink page="environments" label="Environments">
                <IconMarkEnvironments />
              </WorkspaceLink>
              <WorkspaceLink page="connections" label="Connections">
                <IconMarkConnections />
              </WorkspaceLink>
              <WorkspaceLink page="settings" label="Settings">
                <IconMarkSettings />
              </WorkspaceLink>
            </Navigation.Section>
          </Navigation.Root>
        </Shell.SidebarContent>
      </Shell.Sidebar>
      <Shell.Rail aria-label="Workspace rail">
        <WorkspaceMark variant="brand" decorative>
          {Array.from(membership()?.workspace.name ?? "?")[0]?.toLocaleUpperCase() ?? "?"}
        </WorkspaceMark>
        <Shell.NavigationToggle mode="tablet" />
        <Shell.RailContent>
          <Navigation.Root compact aria-label="Workspace shortcuts">
            <WorkspaceLink page="home" label="Home">
              <IconMarkHome />
            </WorkspaceLink>
            <WorkspaceLink page="inbox" label="Inbox" count={pending()}>
              <IconMarkMail />
            </WorkspaceLink>
            <WorkspaceLink page="triage" label="Triage">
              <IconMarkTriage />
            </WorkspaceLink>
            <WorkspaceLink page="tasks" label="Tasks">
              <IconMarkTasks />
            </WorkspaceLink>
            <WorkspaceLink page="environments" label="Environments">
              <IconMarkEnvironments />
            </WorkspaceLink>
            <WorkspaceLink page="connections" label="Connections">
              <IconMarkConnections />
            </WorkspaceLink>
            <WorkspaceLink page="settings" label="Settings">
              <IconMarkSettings />
            </WorkspaceLink>
          </Navigation.Root>
        </Shell.RailContent>
        <Shell.RailFooter>
          <AccountControl />
        </Shell.RailFooter>
      </Shell.Rail>
      <Shell.Body>
        <Shell.Header workspace>
          <PageHeader.Root>
            <PageHeader.Crumbs>
              <PageHeader.Navigation>
                <Shell.NavigationToggle mode="phone" />
              </PageHeader.Navigation>
              {crumbs()}
            </PageHeader.Crumbs>
            <PageHeader.Heading>
              <PageHeader.Title>
                <Show
                  when={groupId()}
                  fallback={
                    <Show when={drafting()} fallback={title()}>
                      <DirectDraftName
                        workspaceId={params.workspaceId}
                        memberIds={(search.to ?? "").split(",").filter(Boolean)}
                      />
                    </Show>
                  }
                >
                  {(id) => <GroupName workspaceId={params.workspaceId} groupId={id()} />}
                </Show>
              </PageHeader.Title>
              <PageHeader.Actions>
                <Show when={groupId()} keyed>
                  {(id) => (
                    <>
                      <GroupMembersAction
                        workspaceId={params.workspaceId}
                        groupId={id}
                        onLeft={() => navigate(paths.workspace(params.workspaceId))}
                      />
                      <GroupFollowAction workspaceId={params.workspaceId} groupId={id} />
                    </>
                  )}
                </Show>
                <Live.Status />
              </PageHeader.Actions>
            </PageHeader.Heading>
            <Show when={groupId()} keyed>
              {(id) => (
                <PageHeader.Meta>
                  <GroupFollowNote workspaceId={params.workspaceId} groupId={id} />
                </PageHeader.Meta>
              )}
            </Show>
          </PageHeader.Root>
        </Shell.Header>
        <Shell.Main workspace aria-label={title()}>
          <Shell.Content fill={groupId() !== undefined || drafting() !== undefined}>
            {props.children}
          </Shell.Content>
        </Shell.Main>
      </Shell.Body>
      <Shell.Inspector
        title="Thread"
        open={panel() !== undefined}
        onOpenChange={(open) => {
          if (!open && panel()) closePanel();
        }}
      >
        <Show when={panel()} keyed>
          {(thread) => (
            <ThreadPanel
              workspaceId={params.workspaceId}
              groupId={thread.groupId}
              threadId={thread.threadId}
              onClose={closePanel}
            />
          )}
        </Show>
      </Shell.Inspector>
    </>
  );
}
