import { ConnectionsPage } from "./pages/connections/list.tsx";
import { EnvironmentsPage } from "./pages/environments/list.tsx";
import { ChannelsPage } from "./pages/channels/list.tsx";
import { AgentsPage } from "./pages/agents/list.tsx";
import { TasksPage } from "./pages/tasks/list.tsx";
import { TriagePage } from "./pages/triage/list.tsx";
import { HomePage } from "./pages/workspaces/home.tsx";
import { lazy } from "solid-js";
import { PickerPage } from "./pages/workspaces/picker.tsx";
import { SignInPage } from "./pages/session/sign-in.tsx";
import { NotFound } from "./pages/not-found.tsx";
const SettingsPage = lazy(() =>
  import("./pages/workspaces/settings.tsx").then((module) => ({ default: module.SettingsPage })),
);

/** Routes that do not require an opened workspace. */
export const standalone = {
  signIn: { path: "/sign-in", title: "Sign in", component: SignInPage },
  picker: { path: "/", title: "Where are you working?", component: PickerPage },
} as const;

/** Route paths, page components, and titles inside one workspace have one owner. */
export const workspace = {
  home: { path: "/", title: "Home", component: HomePage },
  triage: { path: "/triage", title: "Triage", component: TriagePage },
  tasks: { path: "/tasks", title: "Tasks", component: TasksPage },
  agents: { path: "/agents", title: "Agents", component: AgentsPage },
  channels: { path: "/channels", title: "Channels", component: ChannelsPage },
  environments: {
    path: "/environments",
    title: "Environments",
    component: EnvironmentsPage,
  },
  connections: {
    path: "/connections",
    title: "Connections",
    component: ConnectionsPage,
  },
  settings: { path: "/settings", title: "Settings", component: SettingsPage },
  notFound: {
    path: "*unmatched",
    title: "Page not found",
    component: NotFound,
  },
} as const;

/** Where workspace routes mount; the ID travels in the path like it does in the API. */
export const workspaceRoot = "/workspaces/:workspaceId";

const inWorkspace = (workspaceId: string, path: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}${path === "/" ? "" : path}`;

/** Build links from the same paths used by the router. */
export const href = {
  signIn: () => standalone.signIn.path,
  picker: (options?: { choose: boolean }) =>
    options?.choose ? `${standalone.picker.path}?choose` : standalone.picker.path,
  home: (workspaceId: string) => inWorkspace(workspaceId, workspace.home.path),
  triage: (workspaceId: string) => inWorkspace(workspaceId, workspace.triage.path),
  tasks: (workspaceId: string) => inWorkspace(workspaceId, workspace.tasks.path),
  agents: (workspaceId: string) => inWorkspace(workspaceId, workspace.agents.path),
  channels: (workspaceId: string) => inWorkspace(workspaceId, workspace.channels.path),
  environments: (workspaceId: string) => inWorkspace(workspaceId, workspace.environments.path),
  connections: (workspaceId: string) => inWorkspace(workspaceId, workspace.connections.path),
  settings: (workspaceId: string) => inWorkspace(workspaceId, workspace.settings.path),
};
