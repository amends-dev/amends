import { NavigationItem, NavigationSection, Shell } from "@amends/ui/components";
import { A, useMatch } from "@solidjs/router";
import { href, workspace, workspaceRoot } from "../../routes.tsx";
import { useWorkspace } from "../../workspace/context.tsx";

/** Destinations inside the opened workspace; sections fill in as their domains arrive. */
export function WorkspaceNavigation() {
  const sidebar = Shell.useSidebar();
  const opened = useWorkspace();
  const matches = (path: string, nested = false) =>
    useMatch(() => `${workspaceRoot}${path === "/" ? "" : path}${nested ? "/*" : ""}`);
  const isHome = matches(workspace.home.path);
  const isTriage = matches(workspace.triage.path, true);
  const isTasks = matches(workspace.tasks.path, true);
  const isAgents = matches(workspace.agents.path, true);
  const isChannels = matches(workspace.channels.path, true);
  const isEnvironments = matches(workspace.environments.path, true);
  const isConnections = matches(workspace.connections.path, true);
  const isSettings = matches(workspace.settings.path, true);
  const id = () => opened().workspace.id;
  return (
    <nav aria-label="Main navigation">
      <NavigationItem
        href={href.home(id())}
        label={workspace.home.title}
        icon="⌂"
        compact={sidebar.compact()}
        active={!!isHome()}
        onClick={sidebar.close}
        renderLink={(link) => <A {...link} end />}
      />
      <NavigationItem
        href={href.triage(id())}
        label={workspace.triage.title}
        icon="⟁"
        compact={sidebar.compact()}
        active={!!isTriage()}
        onClick={sidebar.close}
        renderLink={(link) => <A {...link} />}
      />
      <NavigationItem
        href={href.tasks(id())}
        label={workspace.tasks.title}
        icon="⌗"
        compact={sidebar.compact()}
        active={!!isTasks()}
        onClick={sidebar.close}
        renderLink={(link) => <A {...link} />}
      />
      <NavigationSection label="Configure" compact={sidebar.compact()}>
        <NavigationItem
          href={href.agents(id())}
          label={workspace.agents.title}
          icon="◎"
          compact={sidebar.compact()}
          active={!!isAgents()}
          onClick={sidebar.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.channels(id())}
          label={workspace.channels.title}
          icon="#"
          compact={sidebar.compact()}
          active={!!isChannels()}
          onClick={sidebar.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.environments(id())}
          label={workspace.environments.title}
          icon="▣"
          compact={sidebar.compact()}
          active={!!isEnvironments()}
          onClick={sidebar.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.connections(id())}
          label={workspace.connections.title}
          icon="⚭"
          compact={sidebar.compact()}
          active={!!isConnections()}
          onClick={sidebar.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.settings(id())}
          label={workspace.settings.title}
          icon="⚙"
          compact={sidebar.compact()}
          active={!!isSettings()}
          onClick={sidebar.close}
          renderLink={(link) => <A {...link} />}
        />
      </NavigationSection>
    </nav>
  );
}
