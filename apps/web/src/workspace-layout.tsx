import { paths, useWorkspace, type WorkspacePage } from "@amends/client";
import { Account } from "@amends/features/account";
import { GroupName, GroupsNavigation, ThreadPanel } from "@amends/features/conversations";
import { Live } from "@amends/features/live";
import { Shell } from "@amends/ui/compositions/shell";
import { PageHeader } from "@amends/ui/compositions/page-header";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { Column, Row } from "@amends/ui/primitives/layout";
import {
  IconMarkHome,
  IconMarkTriage,
  IconMarkTasks,
  IconMarkEnvironments,
  IconMarkConnections,
  IconMarkSettings,
} from "@amends/icons";
import { useLocation, useMatch, useNavigate, useParams } from "@solidjs/router";
import { createEffect, on, Show, type JSX, type ParentProps } from "solid-js";

const labels: Record<WorkspacePage, string> = {
  home: "Home",
  triage: "Triage",
  tasks: "Tasks",
  environments: "Environments",
  connections: "Connections",
  settings: "Settings",
};
const href = (path: string) => path;
function WorkspaceLink(props: ParentProps<{ page: WorkspacePage; label: string }>) {
  const params = useParams<{ workspaceId: string }>(),
    location = useLocation(),
    shell = Shell.useShell();
  const path = () => paths.workspacePage(params.workspaceId, props.page);
  return (
    <Navigation.Link
      href={href(path())}
      aria-current={
        location.pathname.replace(/\/$/, "") === path() ||
        (props.page === "settings" && location.pathname.startsWith(`${path()}/`))
          ? "page"
          : undefined
      }
      onClick={(event) => {
        if (ordinary(event)) shell.closeNavigation();
      }}
    >
      <Navigation.Icon>{props.children}</Navigation.Icon>
      <Navigation.Label>{props.label}</Navigation.Label>
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
  const groupId = () => conversation()?.params.groupId;
  const threadId = () => opened()?.params.threadId;
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
        (name === "settings" &&
          location.pathname.startsWith(`${paths.workspacePage(params.workspaceId, name)}/`)),
    );
  const title = () => {
    if (groupId()) return "Conversation";
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
    if (groupId()) return "Workspace / Groups";
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
                <Show when={groupId()} fallback={title()}>
                  {(id) => <GroupName workspaceId={params.workspaceId} groupId={id()} />}
                </Show>
              </PageHeader.Title>
              <PageHeader.Actions>
                <Live.Status />
              </PageHeader.Actions>
            </PageHeader.Heading>
          </PageHeader.Root>
        </Shell.Header>
        <Shell.Main workspace aria-label={title()}>
          <Shell.Content fill={groupId() !== undefined}>{props.children}</Shell.Content>
        </Shell.Main>
      </Shell.Body>
      <Shell.Inspector
        title="Thread"
        open={threadId() !== undefined}
        onOpenChange={(open) => {
          const group = groupId();
          if (!open && group) navigate(paths.group(params.workspaceId, group));
        }}
      >
        <Show when={groupId() && threadId()} keyed>
          {(id) => (
            <ThreadPanel
              workspaceId={params.workspaceId}
              groupId={groupId()!}
              threadId={id}
              onClose={() => {
                const group = groupId();
                if (group) navigate(paths.group(params.workspaceId, group));
              }}
            />
          )}
        </Show>
      </Shell.Inspector>
    </>
  );
}
