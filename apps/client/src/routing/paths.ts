import type { SettingsSection } from "../api/settings.ts";
export type WorkspacePage =
  | "home"
  | "triage"
  | "tasks"
  | "environments"
  | "connections"
  | "settings";
export const paths = {
  settingsSection: (id: string, section: SettingsSection) =>
    `/workspaces/${encodeURIComponent(id)}/settings/${section}`,
  signIn: "/sign-in",
  workspaces: "/workspaces",
  createWorkspace: "/workspaces/new",
  workspace: (id: string) => `/workspaces/${encodeURIComponent(id)}`,
  workspacePage: (id: string, page: WorkspacePage) =>
    `/workspaces/${encodeURIComponent(id)}${page === "home" ? "" : `/${page}`}`,
} as const;

/** Only internal protected destinations can be resumed after authentication. */
export function returnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value))
    return paths.workspaces;
  const url = new URL(value, "https://amends.invalid");
  if (
    url.origin !== "https://amends.invalid" ||
    !(
      url.pathname === paths.workspaces ||
      /^\/workspaces\/[^/]+(?:\/(?:triage|tasks|environments|connections|settings(?:\/(?:workspace|members|invites))?))?$/.test(
        url.pathname,
      )
    )
  )
    return paths.workspaces;
  return `${url.pathname}${url.search}${url.hash}`;
}
export const signInPath = (destination: string) =>
  `${paths.signIn}?returnTo=${encodeURIComponent(returnPath(destination))}`;
