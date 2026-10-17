import type { SettingsTab } from "@amends-dev/ui/screens/settings"
export type WorkspacePage = "home" | "inbox" | "triage" | "tasks" | "agents" | "connections" | "settings"
export const paths = {
  settingsSection: (id: string, section: SettingsTab) => `/workspaces/${encodeURIComponent(id)}/settings/${section}`,
  signIn: "/sign-in",
  workspaces: "/workspaces",
  createWorkspace: "/workspaces/new",
  workspace: (id: string) => `/workspaces/${encodeURIComponent(id)}`,
  workspacePage: (id: string, page: WorkspacePage) =>
    `/workspaces/${encodeURIComponent(id)}${page === "home" ? "" : `/${page}`}`,
  /** The workspace's public groups, to find and join. */
  groups: (id: string) => `/workspaces/${encodeURIComponent(id)}/groups`,
  group: (id: string, groupId: string) => `/workspaces/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}`,
  thread: (id: string, groupId: string, threadId: string) =>
    `/workspaces/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(threadId)}`,
  /** A turn's log, beside its thread. */
  turnLog: (id: string, groupId: string, threadId: string, turnId: string) =>
    `/workspaces/${encodeURIComponent(id)}/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(threadId)}?log=${encodeURIComponent(turnId)}`,
  /** An agent's page in Agents. */
  agent: (id: string, agentId: string) => `/workspaces/${encodeURIComponent(id)}/agents/${encodeURIComponent(agentId)}`,
  /** A connection's page in Connections. */
  connection: (id: string, connectionId: string) =>
    `/workspaces/${encodeURIComponent(id)}/connections/${encodeURIComponent(connectionId)}`,
  /** A first message to some people who have no direct group together yet. */
  directDraft: (id: string, memberIds: ReadonlyArray<string>) =>
    `/workspaces/${encodeURIComponent(id)}/direct?to=${memberIds.map(encodeURIComponent).join(",")}`,
  /** A thread opened from the inbox, beside it, at the timeline position that notified the reader. */
  inboxThread: (id: string, groupId: string, threadId: string, at?: number) =>
    `/workspaces/${encodeURIComponent(id)}/inbox/groups/${encodeURIComponent(groupId)}/threads/${encodeURIComponent(threadId)}${at === undefined ? "" : `?at=${at}`}`
} as const

/** Only internal protected destinations can be resumed after authentication. */
export function returnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return paths.workspaces
  const url = new URL(value, "https://amends.invalid")
  if (
    url.origin !== "https://amends.invalid" ||
    !(
      url.pathname === paths.workspaces ||
      /^\/workspaces\/[^/]+(?:\/(?:triage|tasks|agents(?:\/[^/]+)?|connections(?:\/[^/]+)?|settings(?:\/(?:workspace|members))?|groups(?:\/[^/]+(?:\/threads\/[^/]+)?)?|inbox(?:\/groups\/[^/]+\/threads\/[^/]+)?|direct))?$/.test(
        url.pathname
      )
    )
  )
    return paths.workspaces
  return `${url.pathname}${url.search}${url.hash}`
}
export const signInPath = (destination: string) =>
  `${paths.signIn}?returnTo=${encodeURIComponent(returnPath(destination))}`
