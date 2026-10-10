import { Show } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import type { FormField } from "../../components/form-fields/index.ts";
import type { Status } from "../../components/status-mark/index.ts";
import * as s from "./connections.css.ts";

/** What an integration's connections give: models, tools, sandboxes, harnesses, or channels. */
export type IntegrationCapability = "models" | "tools" | "sandboxes" | "harnesses" | "channels";
/** How a connection authenticates, chosen when it is created. */
export type AuthMethod = "apiKey" | "none";

/** An integration this host installs, which a new connection goes through. */
export interface IntegrationOption {
  readonly id: string;
  readonly name: string;
  /** Where its documentation is. */
  readonly docs?: string;
  readonly provides: readonly IntegrationCapability[];
  /** The ways its connections may authenticate, preferred first. */
  readonly auth: readonly AuthMethod[];
  /** Its settings, as its form asks for them. */
  readonly fields: readonly FormField[];
}

/**
 * Whether a connection can be used as it is set up: `ready`, `invalid` when its integration now
 * refuses its settings or how it authenticates, saying why, or `uninstalled` when this host no
 * longer installs its integration. Ready never means the system accepts its key.
 */
export type ConnectionReadiness =
  | { readonly state: "ready" }
  | { readonly state: "invalid"; readonly description: string }
  | { readonly state: "uninstalled" };

/** A connection, as the list and its page show it. Its key never reaches the screen. */
export interface ConnectionSummary {
  readonly id: string;
  readonly name: string;
  readonly integrationId: string;
  /** Undefined when this host no longer installs its integration. */
  readonly integration:
    | {
        readonly name: string;
        readonly docs?: string;
        readonly provides: readonly IntegrationCapability[];
      }
    | undefined;
  /** Its settings' fields, from its integration's form; none once its integration is gone. */
  readonly fields: readonly FormField[];
  /** Its saved settings as text, by key. */
  readonly settings: Readonly<Record<string, string>>;
  readonly auth: AuthMethod;
  readonly readiness: ConnectionReadiness;
  /** The reader may rename it, change its settings and key, check it, and remove it. */
  readonly manageable: boolean;
  /** Who added it, by name. */
  readonly createdBy: string;
  readonly createdAt: Date;
}

/**
 * What checking a connection found: nothing wrong that the check could see, a refused key,
 * settings that lead nowhere the integration works, or a system that could not answer, which may
 * pass.
 */
export interface ConnectionHealth {
  readonly status: "healthy" | "unauthorized" | "misconfigured" | "unavailable";
  readonly description?: string;
}

/** A change made to connections, or a check of one. */
export type ConnectionsAction =
  | "create"
  | "rename"
  | "configure"
  | "replace-key"
  | "check"
  | "remove";

/**
 * Why a change or read failed: `changed`, `denied`, and `gone` mean what the reader sees is out
 * of date; `uninstalled` that this host no longer installs the integration; `refused` that the
 * integration refuses the settings or way of authenticating, saying why; `storage-unavailable`
 * that the host keeps no keys; `refresh-failed` that a change completed but its result could not
 * be loaded; and `outdated` that a live refresh failed.
 */
export type ConnectionsError =
  | "changed"
  | "denied"
  | "gone"
  | "invalid"
  | "failed"
  | "uninstalled"
  | "refused"
  | "storage-unavailable"
  | "refresh-failed"
  | "outdated";
/** A change's failure, or a refresh's, with the action it belongs to. */
export interface ConnectionsFailure {
  readonly action: ConnectionsAction | "refresh";
  readonly error: ConnectionsError;
  /** What the integration said, for `refused`. */
  readonly description?: string;
}

export const capabilityLabels = {
  models: "Models",
  tools: "Tools",
  sandboxes: "Sandboxes",
  harnesses: "Harnesses",
  channels: "Channels",
} as const satisfies Record<IntegrationCapability, string>;

/** "model", "tool", "sandbox", or "harness", as in "Add tool connection". */
export const capabilityNouns = {
  models: "model",
  tools: "tool",
  sandboxes: "sandbox",
  harnesses: "harness",
  channels: "channel",
} as const satisfies Record<IntegrationCapability, string>;

export const authLabels = {
  apiKey: "API key",
  none: "No authentication",
} as const satisfies Record<AuthMethod, string>;

/** "API key", or "API key or no authentication". */
export const authOptionsLabel = (methods: readonly AuthMethod[]) => {
  const [first, ...rest] = methods.map((method) => authLabels[method]);
  return [first, ...rest.map((label) => label.toLowerCase())].filter(Boolean).join(" or ");
};

/** "Tools", or "Models and tools". */
export const providesLabel = (provides: readonly IntegrationCapability[]) => {
  const [first, ...rest] = provides.map((capability) => capabilityLabels[capability]);
  return [first, ...rest.map((label) => label.toLowerCase())].filter(Boolean).join(" and ");
};

/** "MCP server · Tools", or "Integration not installed". */
export const integrationLine = (connection: ConnectionSummary) =>
  connection.integration
    ? `${connection.integration.name} · ${providesLabel(connection.integration.provides)}`
    : "Integration not installed";

/**
 * A connection's state when it cannot be used: Unavailable when this host lacks its integration,
 * else Needs setup with why the integration refuses it. Undefined while it is ready, which shows
 * nothing.
 */
export function connectionStatus(connection: {
  readonly readiness: ConnectionReadiness;
}): Status | undefined {
  switch (connection.readiness.state) {
    case "ready":
      return undefined;
    case "uninstalled":
      return {
        mark: "blocked",
        label: "Unavailable",
        detail: "Its integration isn’t installed on this host.",
      };
    case "invalid":
      return { mark: "attention", label: "Needs setup", detail: connection.readiness.description };
  }
}

/** What a check found, as a heading and its line. */
export const healthWording = {
  healthy: { title: "Working", line: "The check found nothing wrong." },
  unauthorized: { title: "Key refused", line: "The system refused this connection’s key." },
  misconfigured: {
    title: "Settings don’t work",
    line: "The settings lead nowhere this integration works.",
  },
  unavailable: {
    title: "Couldn’t reach it",
    line: "The system didn’t answer. It may answer later.",
  },
} as const satisfies Record<ConnectionHealth["status"], { title: string; line: string }>;

const changed: { readonly [Action in ConnectionsAction]: string } = {
  create: "The integrations on this host changed. Refresh, then try again.",
  rename: "This connection was renamed meanwhile. Refresh to review it, then save again.",
  configure: "This connection changed meanwhile. Refresh to review it, then save again.",
  "replace-key": "This connection changed meanwhile. Refresh to review it, then try again.",
  check: "This connection changed meanwhile. Refresh to review it, then check again.",
  remove: "This connection changed meanwhile. Refresh to review it.",
};
const invalid: { readonly [Action in ConnectionsAction]: string } = {
  create: "Check the name and settings, then try again.",
  rename: "Use 1 to 80 characters, with no invisible ones.",
  configure: "Check the settings, then save again.",
  "replace-key": "Enter the key as the system issued it.",
  check: "This connection can’t be checked as it is.",
  remove: "That change isn’t possible.",
};
const failed: { readonly [Action in ConnectionsAction]: string } = {
  create:
    "The connection couldn’t be created. Try again when the host is available; it won’t be created twice.",
  rename: "The name couldn’t be saved. Try again when the host is available.",
  configure: "The settings couldn’t be saved. Try again when the host is available.",
  "replace-key": "The key couldn’t be saved. Try again when the host is available.",
  check: "The connection couldn’t be checked. Try again when the host is available.",
  remove: "The connection couldn’t be removed. Try again when the host is available.",
};

/** What went wrong, for the place the change was made; `refresh` covers reads. */
export function connectionsMessage(failure: ConnectionsFailure) {
  const { action, error } = failure;
  if (error === "outdated")
    return "The latest connections could not be loaded. Refresh to try again.";
  if (error === "refresh-failed")
    return action === "create"
      ? "The connection was created, but the latest connections could not be loaded. Refresh to see it."
      : "Saved, but the latest connections could not be loaded. Refresh to continue.";
  if (error === "storage-unavailable")
    return "This host keeps no keys. Ask your administrator to enable credential storage, then try again.";
  if (error === "uninstalled") return "This integration isn’t installed on this host anymore.";
  if (error === "refused")
    return (
      failure.description ?? "The integration refuses these settings. Check them, then try again."
    );
  if (error === "denied")
    return "You no longer have permission to do this. Refresh to review your access.";
  if (action === "refresh")
    return error === "changed" || error === "gone"
      ? "Connections changed meanwhile. Refresh to see the latest."
      : "The latest connections could not be loaded. Try again when the host is available.";
  if (error === "gone")
    return action === "create"
      ? "This workspace is no longer available to you."
      : "This connection is no longer available. Refresh to see the latest.";
  if (error === "changed") return changed[action];
  if (error === "invalid") return invalid[action];
  return failed[action];
}

/** Whether the reader must reload before changing anything more. */
export const needsRefresh = (error: ConnectionsError) =>
  error === "changed" ||
  error === "denied" ||
  error === "gone" ||
  error === "uninstalled" ||
  error === "refresh-failed" ||
  error === "outdated";

/** A change that completed, for a confirming toast; a check shows its result in place. */
export function connectionsToast(action: Exclude<ConnectionsAction, "check">, subject?: string) {
  switch (action) {
    case "create":
      return subject ? `${subject} created` : "Connection created";
    case "rename":
      return "Name saved";
    case "configure":
      return "Settings saved";
    case "replace-key":
      return "API key replaced";
    case "remove":
      return subject ? `${subject} removed` : "Connection removed";
  }
}

export interface ConnectionsAlertProps {
  readonly failure: ConnectionsFailure;
  /** Reloads the connections; offered when what the reader sees is out of date. */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** A failed change or read, with Refresh when what the reader sees is out of date. */
export function ConnectionsAlert(props: ConnectionsAlertProps) {
  return (
    <div class={s.alert}>
      <Field.Alert>{connectionsMessage(props.failure)}</Field.Alert>
      <Show when={props.onRefresh && needsRefresh(props.failure.error)}>
        <Button
          variant="quiet"
          class={s.alertAction}
          disabled={props.refreshing}
          onClick={() => props.onRefresh?.()}
        >
          {props.refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </Show>
    </div>
  );
}
