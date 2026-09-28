import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconAlertTriangle, IconCheck, IconCircleFrame } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import * as s from "./connections.css.ts";

/**
 * Whether a connection can be used: `configured` when it has what its provider needs,
 * `needs-setup` when it lacks required settings or its key, and `unavailable` when the server no
 * longer installs its provider. Configured never means the provider accepted the key.
 */
export type ConnectionSetup = "configured" | "needs-setup" | "unavailable";
/** How a connection authenticates, chosen when it is created. */
export type ConnectionMethod = "api-key" | "none";

/** A setting a provider declares, as a form asks for it. */
export interface ConnectionSettingField {
  readonly key: string;
  readonly label: string;
  readonly kind: "text" | "url";
  readonly required: boolean;
  readonly description?: string;
  readonly placeholder?: string;
}

/** What a provider's connections give access to: model providers, or sandboxes for environments. */
export type ConnectionCapability = "model-access" | "sandboxes";

/** A provider the server installed, which a new connection goes through. */
export interface ConnectionProviderOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capability: ConnectionCapability | undefined;
  /** The ways its connections may authenticate, preferred first. */
  readonly methods: readonly ConnectionMethod[];
  readonly settings: readonly ConnectionSettingField[];
}

/** A connection, as the list and its details show it. Its key never reaches the screen. */
export interface ConnectionSummary {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  /** Undefined when the server no longer installs its provider. */
  readonly provider:
    | { readonly name: string; readonly capability: ConnectionCapability | undefined }
    | undefined;
  /** Its settings with their values; for an unavailable provider, the saved keys alone. */
  readonly settings: ReadonlyArray<ConnectionSettingField & { readonly value: string }>;
  /** Its API URL; undefined when it uses the provider's default. */
  readonly endpoint: string | undefined;
  readonly setup: ConnectionSetup;
  /** What setup still needs: required settings by label, and whether its key is missing. */
  readonly missing: { readonly settings: readonly string[]; readonly key: boolean };
  readonly method: ConnectionMethod;
  readonly keySaved: boolean;
  /** The reader may rename it, change its settings and key, and remove it. */
  readonly manageable: boolean;
  /** Who added it, by name. */
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** A change made to connections. */
export type ConnectionsAction =
  | "create"
  | "rename"
  | "configure"
  | "set-key"
  | "clear-key"
  | "remove";

/**
 * Why a change or read failed: `changed`, `denied`, and `gone` mean what the reader sees is out
 * of date; `storage-unavailable` that the server keeps no keys; `refresh-failed` that a change
 * completed but its result could not be loaded; and `outdated` that a live refresh failed.
 */
export type ConnectionsError =
  | "changed"
  | "denied"
  | "gone"
  | "invalid"
  | "failed"
  | "storage-unavailable"
  | "refresh-failed"
  | "outdated";

export const capabilityLabels = {
  "model-access": "Model access",
  sandboxes: "Sandboxes",
} as const satisfies Record<ConnectionCapability, string>;

export const setupLabels = {
  configured: "Configured",
  "needs-setup": "Needs setup",
  unavailable: "Unavailable",
} as const satisfies Record<ConnectionSetup, string>;

export const methodLabels = {
  "api-key": "API key",
  none: "No authentication",
} as const satisfies Record<ConnectionMethod, string>;

/** "API key", or "API key or no authentication". */
export const methodsLabel = (methods: readonly ConnectionMethod[]) => {
  const [first, ...rest] = methods.map((method) => methodLabels[method]);
  return [first, ...rest.map((label) => label.toLowerCase())].filter(Boolean).join(" or ");
};

/** "Anthropic · Model access", or "Provider unavailable". */
export const providerLine = (connection: ConnectionSummary) =>
  connection.provider
    ? [
        connection.provider.name,
        connection.provider.capability === undefined
          ? undefined
          : capabilityLabels[connection.provider.capability],
      ]
        .filter(Boolean)
        .join(" · ")
    : "Provider unavailable";

/** What setup still needs, or that it is complete. */
export function setupNote(connection: ConnectionSummary) {
  if (connection.setup === "unavailable")
    return "This provider is unavailable on this server. An administrator needs to restore it.";
  if (connection.setup === "configured")
    return "Setup is complete. Provider access has not been tested.";
  const needs = [...connection.missing.settings, ...(connection.missing.key ? ["an API key"] : [])];
  const listed =
    needs.length > 1 ? `${needs.slice(0, -1).join(", ")} and ${needs.at(-1)}` : needs[0];
  return listed
    ? `Add ${listed} to finish setting up this connection.`
    : "Finish setting up this connection.";
}

const changed: { readonly [Action in ConnectionsAction]: string } = {
  create: "The providers on this server changed. Refresh, then try again.",
  rename: "This connection was renamed meanwhile. Refresh to review it, then save again.",
  configure: "This connection changed meanwhile. Refresh to review it, then save again.",
  "set-key": "This connection changed meanwhile. Refresh to review it, then try again.",
  "clear-key": "This connection changed meanwhile. Refresh to review it.",
  remove: "This connection changed meanwhile. Refresh to review it.",
};
const invalid: { readonly [Action in ConnectionsAction]: string } = {
  create: "Check the name and settings, then try again.",
  rename: "Use 1 to 80 characters, with no invisible ones.",
  configure: "Check the settings, then save again.",
  "set-key": "Enter the key as the provider issued it.",
  "clear-key": "This connection doesn’t use an API key.",
  remove: "That change isn’t possible.",
};
const failed: { readonly [Action in ConnectionsAction]: string } = {
  create:
    "The connection couldn’t be created. Try again when the host is available; it won’t be created twice.",
  rename: "The name couldn’t be saved. Try again when the host is available.",
  configure: "The settings couldn’t be saved. Try again when the host is available.",
  "set-key": "Try again when the host is available.",
  "clear-key": "The key couldn’t be removed. Try again when the host is available.",
  remove: "The connection couldn’t be removed. Try again when the host is available.",
};

/** What went wrong, for the place the change was made; `refresh` covers reads. */
export function connectionsMessage(action: ConnectionsAction | "refresh", error: ConnectionsError) {
  if (error === "outdated")
    return "The latest connections could not be loaded. Refresh to try again.";
  if (error === "refresh-failed")
    return action === "create"
      ? "The connection was created, but the latest connections could not be loaded. Refresh to see it."
      : "Saved, but the latest connections could not be loaded. Refresh to continue.";
  if (error === "storage-unavailable")
    return "Credential storage is unavailable. Ask your administrator to enable it, then try again.";
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
  error !== "invalid" && error !== "failed" && error !== "storage-unavailable";

/** A change that completed, for a confirming toast. */
export function connectionsToast(action: ConnectionsAction, subject?: string) {
  switch (action) {
    case "create":
      return subject ? `${subject} created` : "Connection created";
    case "rename":
      return "Name saved";
    case "configure":
      return "Settings saved";
    case "set-key":
      return "API key saved";
    case "clear-key":
      return "API key removed";
    case "remove":
      return subject ? `${subject} removed` : "Connection removed";
  }
}

export interface ConnectionsAlertProps {
  readonly action: ConnectionsAction | "refresh";
  readonly error: ConnectionsError;
  /** Reloads the connections; offered when what the reader sees is out of date. */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** A failed change or read, with Refresh when what the reader sees is out of date. */
export function ConnectionsAlert(props: ConnectionsAlertProps) {
  return (
    <div class={s.alert}>
      <Field.Alert>{connectionsMessage(props.action, props.error)}</Field.Alert>
      <Show when={props.onRefresh && needsRefresh(props.error)}>
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

const setupIcons = {
  configured: IconCheck,
  "needs-setup": IconCircleFrame,
  unavailable: IconAlertTriangle,
} as const;

/** "Configured" with a check, or "Needs setup" and "Unavailable" in the caution color. */
export function SetupStatus(props: { readonly setup: ConnectionSetup }) {
  return (
    <span class={s.setup} data-setup={props.setup}>
      <Dynamic component={setupIcons[props.setup]} class={s.setupIcon} />
      {setupLabels[props.setup]}
    </span>
  );
}
