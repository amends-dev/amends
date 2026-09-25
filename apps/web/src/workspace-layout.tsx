import { paths, useWorkspace, type WorkspacePage } from "@amends/client";
import { Account } from "@amends/features/account";
import { Shell } from "@amends/ui/compositions/shell";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { Text } from "@amends/ui/primitives/text";
import { Row } from "@amends/ui/primitives/layout";
import {
  IconMarkHome,
  IconMarkTriage,
  IconMarkTasks,
  IconMarkEnvironments,
  IconMarkConnections,
  IconMarkSettings,
} from "@amends/icons";
import { useLocation, useParams } from "@solidjs/router";
import { createEffect, on, type JSX, type ParentProps } from "solid-js";

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
      aria-current={location.pathname.replace(/\/$/, "") === path() ? "page" : undefined}
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
/** App-owned composition. The route guard keeps this instance alive while membership remains active. */
export function WorkspaceLayout(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>(),
    location = useLocation(),
    shell = Shell.useShell();
  const membership = useWorkspace(() => params.workspaceId);
  const title = () => {
    const page = (Object.keys(labels) as WorkspacePage[]).find(
      (page) =>
        paths.workspacePage(params.workspaceId, page) === location.pathname.replace(/\/$/, ""),
    );
    return page ? labels[page] : "Page not found";
  };
  createEffect(
    on(
      () => location.pathname,
      () => shell.closeNavigation(),
      { defer: true },
    ),
  );
  const close: JSX.EventHandler<HTMLAnchorElement, MouseEvent> = (event) => {
    if (ordinary(event)) shell.closeNavigation();
  };
  return (
    <>
      <Shell.Sidebar aria-label="Workspace sidebar">
        <Shell.SidebarHeader>
          <Row gap={2} wrap={false}>
            <WorkspaceMark variant="brand" decorative>
              {Array.from(membership()?.workspace.name ?? "?")[0]?.toLocaleUpperCase() ?? "?"}
            </WorkspaceMark>
            <Shell.SidebarLabel>{membership()?.workspace.name}</Shell.SidebarLabel>
          </Row>
        </Shell.SidebarHeader>
        <Shell.SidebarUtility>
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
            </Navigation.Section>
          </Navigation.Root>
        </Shell.SidebarContent>
        <Shell.SidebarFooter>
          <Navigation.Root aria-label="Workspace settings">
            <WorkspaceLink page="settings" label="Settings">
              <IconMarkSettings />
            </WorkspaceLink>
          </Navigation.Root>
        </Shell.SidebarFooter>
      </Shell.Sidebar>
      <Shell.Body>
        <Shell.Header>
          <Row gap={3}>
            <Shell.NavigationToggle />
            <Text as="h1" variant="heading">
              {title()}
            </Text>
          </Row>
        </Shell.Header>
        <Shell.Main aria-label={title()}>
          <Shell.Content>{props.children}</Shell.Content>
        </Shell.Main>
      </Shell.Body>
    </>
  );
}
