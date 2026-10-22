/**
 * What the connections say, in the words of `@amends-dev/ui`: what each tab, integration, and way of authenticating is
 * called, how a connection that can't be used stands, what a check found, and what went wrong with a change or a
 * check, for the place it was made.
 */

import type { Connection as ConnectionContract, Integration } from "@amends-dev/connection"
import { Connection } from "@amends-dev/core/connection"
import type { NoticeBoxTone } from "@amends-dev/design/control"
import type { MarkStatus } from "@amends-dev/design/mark"
import * as Option from "effect/Option"
import { type ConnectionItem, isUninstalled } from "../../data/connections.ts"
import type { ConnectionsAction, ConnectionsTab, Failure, Reason } from "./definition.ts"

export const capabilityLabels: Readonly<Record<Integration.Capability, string>> = {
  models: "Models",
  tools: "Tools",
  sandboxes: "Sandboxes",
  harnesses: "Harnesses",
  channels: "Channels"
}

/** "model", "tool", "sandbox", "harness", or "channel", as in "Add tool connection". */
export const capabilityNouns: Readonly<Record<Integration.Capability, string>> = {
  models: "model",
  tools: "tool",
  sandboxes: "sandbox",
  harnesses: "harness",
  channels: "channel"
}

/**
 * What adds a connection is called, and the dialog it opens: "Add connection", or, from one section, "Add tool
 * connection".
 */
export const addLabel = (capability: Option.Option<Integration.Capability>): string =>
  Option.match(capability, {
    onNone: () => "Add connection",
    onSome: (wanted) => `Add ${capabilityNouns[wanted]} connection`
  })

/** How a tab of the list is called: All, or what its connections give. */
export const tabLabel = (tab: ConnectionsTab): string => (tab === "all" ? "All" : capabilityLabels[tab])

export const authLabels: Readonly<Record<ConnectionContract.AuthMethod, string>> = {
  apiKey: "API key",
  none: "No authentication"
}

/** "API key", or "API key or no authentication". */
export const authOptionsLabel = (methods: ReadonlyArray<ConnectionContract.AuthMethod>): string => {
  const [first, ...rest] = methods.map((method) => authLabels[method])
  return [first, ...rest.map((label) => label.toLowerCase())].filter(Boolean).join(" or ")
}

/** "Tools", or "Models and tools". */
export const providesLabel = (provides: ReadonlyArray<Integration.Capability>): string => {
  const [first, ...rest] = provides.map((capability) => capabilityLabels[capability])
  return [first, ...rest.map((label) => label.toLowerCase())].filter(Boolean).join(" and ")
}

/**
 * "MCP server · Tools", or "Integration not installed" when the host does not install the connection's integration.
 * Nothing while the host has not listed its integrations, which say what a connection's integration is called and gives.
 */
export const integrationLine = (
  integration: Option.Option<Pick<Connection.IntegrationView, "name" | "provides">>,
  item: ConnectionItem
): Option.Option<string> =>
  Option.match(integration, {
    onNone: () => (isUninstalled(item) ? Option.some("Integration not installed") : Option.none()),
    onSome: ({ name, provides }) => Option.some(provides.length === 0 ? name : `${name} · ${providesLabel(provides)}`)
  })

/**
 * A connection's state when it cannot be used: Unavailable when this host lacks its integration, else Needs setup
 * with why the integration refuses it. Nothing while it is ready, or while a change to it is on its way.
 */
export const connectionStatus = ({ connection, pending }: ConnectionItem): MarkStatus | undefined =>
  pending
    ? undefined
    : Connection.Readiness.match(connection.readiness, {
        Ready: () => undefined,
        Invalid: ({ description }): MarkStatus => ({ kind: "attention", label: "Needs setup", detail: description }),
        Uninstalled: (): MarkStatus => ({
          kind: "blocked",
          label: "Unavailable",
          detail: "Its integration isn’t installed on this host."
        })
      })

/** What a check found, as a heading and its line, and the tone of the note that says it. */
export const healthWording: Readonly<
  Record<ConnectionContract.Health["status"], { title: string; line: string; tone: NoticeBoxTone }>
> = {
  healthy: { title: "Working", line: "The check found nothing wrong.", tone: "success" },
  unauthorized: { title: "Key refused", line: "The system refused this connection’s key.", tone: "danger" },
  misconfigured: {
    title: "Settings don’t work",
    line: "The settings lead nowhere this integration works.",
    tone: "danger"
  },
  unavailable: { title: "Couldn’t reach it", line: "The system didn’t answer. It may answer later.", tone: "caution" }
}

const changedMessages: Readonly<Record<ConnectionsAction, string>> = {
  Create: "The integrations on this host changed. Refresh, then try again.",
  Rename: "This connection was renamed meanwhile. Refresh to review it, then save again.",
  Configure: "This connection changed meanwhile. Refresh to review it, then save again.",
  ReplaceKey: "This connection changed meanwhile. Refresh to review it, then try again.",
  Check: "This connection changed meanwhile. Refresh to review it, then check again.",
  Remove: "This connection changed meanwhile. Refresh to review it."
}

const invalidMessages: Readonly<Record<ConnectionsAction, string>> = {
  Create: "Check the name and settings, then try again.",
  Rename: "Use 1 to 80 characters, with no invisible ones.",
  Configure: "Check the settings, then save again.",
  ReplaceKey: "Enter the key as the system issued it.",
  Check: "This connection can’t be checked as it is.",
  Remove: "That change isn’t possible."
}

const failedMessages: Readonly<Record<ConnectionsAction, string>> = {
  Create: "The connection couldn’t be created. Try again when the host is available; it won’t be created twice.",
  Rename: "The name couldn’t be saved. Try again when the host is available.",
  Configure: "The settings couldn’t be saved. Try again when the host is available.",
  ReplaceKey: "The key couldn’t be saved. Try again when the host is available.",
  Check: "The connection couldn’t be checked. Try again when the host is available.",
  Remove: "The connection couldn’t be removed. Try again when the host is available."
}

const messageOfReason: Readonly<Record<Reason, (failure: Failure) => string>> = {
  Invalid: ({ action }) => invalidMessages[action],
  Failed: ({ action }) => failedMessages[action],
  Denied: () => "You no longer have permission to do this. Refresh to review your access.",
  Gone: ({ action }) =>
    action === "Create"
      ? "This workspace is no longer available to you."
      : "This connection is no longer available. Refresh to see the latest.",
  Changed: ({ action }) => changedMessages[action],
  Uninstalled: () => "This integration isn’t installed on this host anymore.",
  Refused: ({ description }) =>
    Option.getOrElse(description, () => "The integration refuses these settings. Check them, then try again."),
  StorageUnavailable: () =>
    "This host keeps no keys. Ask your administrator to enable credential storage, then try again."
}

/** What went wrong, for the place the change or the check was made. */
export const connectionsMessage = (failure: Failure): string => messageOfReason[failure.reason](failure)

/** Whether the person must refresh before changing anything more: what they see is out of date. */
export const needsRefresh = (reason: Reason): boolean =>
  reason === "Changed" || reason === "Denied" || reason === "Gone" || reason === "Uninstalled"

/** What confirms a change that was made, for a toast: `created` and `removed` say which connection by its name. */
export const connectionsToast = {
  created: (name: string) => `${name} created`,
  nameSaved: "Name saved",
  settingsSaved: "Settings saved",
  keyReplaced: "API key replaced",
  removed: (name: string) => `${name} removed`
}
