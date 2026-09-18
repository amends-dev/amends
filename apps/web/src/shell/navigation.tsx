import { NavigationItem, NavigationSection } from "@amends/ui/components";
import { A, useMatch } from "@solidjs/router";
import { href, workspace, workspaceRoot } from "../routes.tsx";
import { useWorkspace } from "../workspace/context.tsx";

/** Destinations inside the opened workspace; sections fill in as their domains arrive. */
export function Navigation(props: { compact: boolean; close: () => void }) {
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
  const id = () => opened().id;
  return (
    <>
      <NavigationItem
        href={href.home(id())}
        label={workspace.home.title}
        icon="⌂"
        compact={props.compact}
        active={!!isHome()}
        onClick={props.close}
        renderLink={(link) => <A {...link} end />}
      />
      <NavigationItem
        href={href.triage(id())}
        label={workspace.triage.title}
        icon="⟁"
        compact={props.compact}
        active={!!isTriage()}
        onClick={props.close}
        renderLink={(link) => <A {...link} />}
      />
      <NavigationItem
        href={href.tasks(id())}
        label={workspace.tasks.title}
        icon="⌗"
        compact={props.compact}
        active={!!isTasks()}
        onClick={props.close}
        renderLink={(link) => <A {...link} />}
      />
      <NavigationSection label="Configure" compact={props.compact}>
        <NavigationItem
          href={href.agents(id())}
          label={workspace.agents.title}
          icon="◎"
          compact={props.compact}
          active={!!isAgents()}
          onClick={props.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.channels(id())}
          label={workspace.channels.title}
          icon="#"
          compact={props.compact}
          active={!!isChannels()}
          onClick={props.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.environments(id())}
          label={workspace.environments.title}
          icon="▣"
          compact={props.compact}
          active={!!isEnvironments()}
          onClick={props.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.connections(id())}
          label={workspace.connections.title}
          icon="⚭"
          compact={props.compact}
          active={!!isConnections()}
          onClick={props.close}
          renderLink={(link) => <A {...link} />}
        />
        <NavigationItem
          href={href.settings(id())}
          label={workspace.settings.title}
          icon="⚙"
          compact={props.compact}
          active={!!isSettings()}
          onClick={props.close}
          renderLink={(link) => <A {...link} />}
        />
      </NavigationSection>
    </>
  );
}
