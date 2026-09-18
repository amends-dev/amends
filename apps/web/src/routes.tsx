import { lazy } from "solid-js";
import { PickerPage } from "./pages/entry/picker.tsx";
import { SignInPage } from "./pages/entry/sign-in.tsx";
import { placeholder } from "./pages/placeholder.tsx";
import { SettingsPage } from "./pages/settings/page.tsx";

/** Screens before a workspace exists. */
export const entry = {
  signIn: { path: "/sign-in", title: "Sign in", component: SignInPage },
  picker: { path: "/", title: "Where are you working?", component: PickerPage },
} as const;

/** Route paths, page components, and titles inside one workspace have one owner. */
export const workspace = {
  home: { path: "/", title: "Home", component: placeholder("Home") },
  triage: { path: "/triage", title: "Triage", component: placeholder("Triage") },
  tasks: { path: "/tasks", title: "Tasks", component: placeholder("Tasks") },
  agents: { path: "/agents", title: "Agents", component: placeholder("Agents") },
  channels: { path: "/channels", title: "Channels", component: placeholder("Channels") },
  environments: {
    path: "/environments",
    title: "Environments",
    component: placeholder("Environments"),
  },
  connections: {
    path: "/connections",
    title: "Connections",
    component: placeholder("Connections"),
  },
  settings: { path: "/settings", title: "Settings", component: SettingsPage },
  notFound: {
    path: "*unmatched",
    title: "Page not found",
    component: lazy(() =>
      import("./pages/not-found.tsx").then((module) => ({ default: module.NotFound })),
    ),
  },
} as const;

/** Where workspace routes mount; the ID travels in the path like it does in the API. */
export const workspaceRoot = "/workspaces/:workspaceId";

const inWorkspace = (workspaceId: string, path: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}${path === "/" ? "" : path}`;

/** Build links from the same paths used by the router. */
export const href = {
  signIn: () => entry.signIn.path,
  picker: (options?: { choose: boolean }) =>
    options?.choose ? `${entry.picker.path}?choose` : entry.picker.path,
  home: (workspaceId: string) => inWorkspace(workspaceId, workspace.home.path),
  triage: (workspaceId: string) => inWorkspace(workspaceId, workspace.triage.path),
  tasks: (workspaceId: string) => inWorkspace(workspaceId, workspace.tasks.path),
  agents: (workspaceId: string) => inWorkspace(workspaceId, workspace.agents.path),
  channels: (workspaceId: string) => inWorkspace(workspaceId, workspace.channels.path),
  environments: (workspaceId: string) => inWorkspace(workspaceId, workspace.environments.path),
  connections: (workspaceId: string) => inWorkspace(workspaceId, workspace.connections.path),
  settings: (workspaceId: string) => inWorkspace(workspaceId, workspace.settings.path),
};
