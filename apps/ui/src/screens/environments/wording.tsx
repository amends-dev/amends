import { Show } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import type { Status } from "../../components/status-mark/index.ts";
import * as s from "./environments.css.ts";

/** Where a harness's loop runs: in amends, or as a program inside the sandbox. */
export type Placement = "in-process" | "in-sandbox";
/** What releasing a sandbox does: stop it and keep its files, or destroy it. */
export type Retention = "stop" | "destroy";
/**
 * What keeps an environment from running now: its harness or provider is no longer installed,
 * its account connection is gone, or that account still needs its key.
 */
export type EnvironmentIssue =
  | "harness-unavailable"
  | "sandbox-unavailable"
  | "connection-unavailable"
  | "connection-incomplete";

/** A harness the server installed. */
export interface HarnessOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly placements: readonly Placement[];
}
/** A sandbox provider the server installed. */
export interface SandboxProviderOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Its sandboxes run under an account connection. */
  readonly account: boolean;
  readonly template:
    | { readonly label: string; readonly description?: string; readonly placeholder?: string }
    | undefined;
}
/** A connection a sandbox can run under. */
export interface SandboxAccountOption {
  readonly id: string;
  readonly name: string;
  /** Its key is saved. */
  readonly ready: boolean;
}

/** An environment, as the list and its details show it. */
export interface EnvironmentSummary {
  readonly id: string;
  readonly name: string;
  readonly harnessId: string;
  /** Undefined when the server no longer installs the harness. */
  readonly harness: { readonly name: string } | undefined;
  readonly sandbox:
    | {
        readonly providerId: string;
        /** Undefined when the server no longer installs the provider. */
        readonly provider: SandboxProviderOption | undefined;
        readonly placement: Placement;
        readonly account: { readonly id: string; readonly name: string | undefined } | undefined;
        readonly template: string | undefined;
        readonly variables: ReadonlyArray<{ readonly key: string; readonly value: string }>;
        readonly commands: readonly string[];
        readonly retention: Retention;
      }
    | undefined;
  /** What keeps it from running now; empty when it is ready. */
  readonly issues: readonly EnvironmentIssue[];
  readonly manageable: boolean;
  /** Who added it, by name; undefined for the one the workspace started with. */
  readonly createdBy: string | undefined;
  readonly createdAt: Date;
}

/** A change made to environments. */
export type EnvironmentsAction = "create" | "rename" | "configure" | "remove";
/**
 * Why a change or read failed: `changed`, `denied`, and `gone` mean what the reader sees is out
 * of date; `refresh-failed` that a change completed but its result could not be loaded; and
 * `outdated` that a live refresh failed.
 */
export type EnvironmentsError =
  | "changed"
  | "denied"
  | "gone"
  | "invalid"
  | "failed"
  | "refresh-failed"
  | "outdated";
/** What the server refused, beyond a workspace failure. */
export type EnvironmentProblem =
  | "unknown-harness"
  | "unknown-sandbox-provider"
  | "unsupported-placement"
  | "connection-required"
  | "connection-not-allowed"
  | "connection-unavailable"
  | "connection-mismatch"
  | "template-not-allowed"
  | "no-sandbox";

export const placementLabels = {
  "in-process": "In-process",
  "in-sandbox": "Inside sandbox",
} as const satisfies Record<Placement, string>;

export const retentionLabels = {
  stop: "Stop and keep files",
  destroy: "Destroy sandbox",
} as const satisfies Record<Retention, string>;

export const retentionDescriptions = {
  stop: "Stop processes and keep files for reuse.",
  destroy: "Delete the sandbox and its files when released.",
} as const satisfies Record<Retention, string>;

/** An issue this server cannot fix by setup: its harness or provider is not installed. */
const unavailable = (issue: EnvironmentIssue) =>
  issue === "harness-unavailable" || issue === "sandbox-unavailable";

/** What each issue means in a sentence without names, for a hover. */
const issueSummaries = {
  "harness-unavailable": "Its harness isn’t installed on this server.",
  "sandbox-unavailable": "Its sandbox provider isn’t installed on this server.",
  "connection-unavailable": "Its sandbox account is no longer available.",
  "connection-incomplete": "Its sandbox account needs an API key.",
} as const satisfies Record<EnvironmentIssue, string>;

/**
 * An environment's state when anything keeps it from running: Unavailable when this server
 * lacks its harness or provider, else Needs setup. Undefined while it is ready, which shows
 * nothing.
 */
export function environmentStatus(issues: readonly EnvironmentIssue[]): Status | undefined {
  const first = issues.find(unavailable) ?? issues[0];
  if (first === undefined) return undefined;
  return unavailable(first)
    ? { mark: "blocked", label: "Unavailable", detail: issueSummaries[first] }
    : { mark: "attention", label: "Needs setup", detail: issueSummaries[first] };
}

/** "Daytona", or the provider's ID when the server no longer installs it. */
export const providerName = (environment: EnvironmentSummary) =>
  environment.sandbox?.provider?.name ?? environment.sandbox?.providerId ?? "";

/** "Amends · Daytona", or "Amends · No sandbox". */
export const runtimeLine = (environment: EnvironmentSummary) =>
  `${environment.harness?.name ?? environment.harnessId} · ${
    environment.sandbox ? providerName(environment) : "No sandbox"
  }`;

/** What one issue means for this environment, and what brings it back. */
export function issueMessage(issue: EnvironmentIssue, environment: EnvironmentSummary) {
  switch (issue) {
    case "harness-unavailable":
      return `${environment.harness?.name ?? environment.harnessId} is not installed on this server. Ask an administrator to restore it.`;
    case "sandbox-unavailable":
      return `${providerName(environment)} is not installed on this server. Ask an administrator to restore it.`;
    case "connection-unavailable":
      return `The ${providerName(environment)} account is no longer available. Choose another connection.`;
    case "connection-incomplete": {
      const account = environment.sandbox?.account?.name;
      return account
        ? `${account} needs an API key. Add it to make this environment ready.`
        : `This ${providerName(environment)} account needs an API key before the environment is ready.`;
    }
  }
}

/** What the server refused, worded for the field it concerns. */
export function problemMessage(problem: EnvironmentProblem, provider: string) {
  switch (problem) {
    case "unknown-harness":
      return "This harness is no longer installed on this server. Refresh and choose an available harness.";
    case "unknown-sandbox-provider":
      return "This sandbox provider is no longer installed on this server. Refresh and choose another provider.";
    case "unsupported-placement":
      return "This harness can’t run in the selected location. Choose a supported location.";
    case "connection-required":
      return `Choose a ${provider} account to continue.`;
    case "connection-not-allowed":
      return `${provider} does not use an account connection. Remove the account selection.`;
    case "connection-unavailable":
      return `This account is no longer available to you. Choose another ${provider} connection.`;
    case "connection-mismatch":
      return `This connection is for another provider. Choose a ${provider} connection.`;
    case "template-not-allowed":
      return `${provider} does not use a template. Remove the template to continue.`;
    case "no-sandbox":
      return "This environment has no sandbox to configure. Create a new environment to use a sandbox.";
  }
}

const changed: { readonly [Action in EnvironmentsAction]: string } = {
  create: "The harnesses or providers on this server changed. Refresh, then try again.",
  rename: "This environment was renamed meanwhile. Refresh to review it, then save again.",
  configure: "This environment changed meanwhile. Refresh to review it, then save again.",
  remove: "This environment changed meanwhile. Refresh to review it.",
};
const invalid: { readonly [Action in EnvironmentsAction]: string } = {
  create: "Check the name and settings, then try again.",
  rename: "Use 1 to 80 characters, with no invisible ones.",
  configure: "Check the settings, then save again.",
  remove: "That change isn’t possible.",
};
const failed: { readonly [Action in EnvironmentsAction]: string } = {
  create:
    "The environment couldn’t be created. Try again when the host is available; it won’t be created twice.",
  rename: "The name couldn’t be saved. Try again when the host is available.",
  configure: "The sandbox settings couldn’t be saved. Try again when the host is available.",
  remove: "The environment couldn’t be removed. Try again when the host is available.",
};

/** What went wrong, for the place the change was made; `refresh` covers reads. */
export function environmentsMessage(
  action: EnvironmentsAction | "refresh",
  error: EnvironmentsError,
) {
  if (error === "outdated")
    return "The latest environments could not be loaded. Refresh to try again.";
  if (error === "refresh-failed")
    return action === "create"
      ? "The environment was created, but the latest environments could not be loaded. Refresh to see it."
      : "Saved, but the latest environments could not be loaded. Refresh to continue.";
  if (error === "denied")
    return "You no longer have permission to do this. Refresh to review your access.";
  if (action === "refresh")
    return error === "changed" || error === "gone"
      ? "Environments changed meanwhile. Refresh to see the latest."
      : "The latest environments could not be loaded. Try again when the host is available.";
  if (error === "gone")
    return action === "create"
      ? "This workspace is no longer available to you."
      : "This environment is no longer available. Refresh to see the latest.";
  if (error === "changed") return changed[action];
  if (error === "invalid") return invalid[action];
  return failed[action];
}

/** Whether the reader must reload before changing anything more. */
export const needsRefresh = (error: EnvironmentsError) => error !== "invalid" && error !== "failed";

/** A change that completed, for a confirming toast. */
export function environmentsToast(action: EnvironmentsAction, subject?: string) {
  switch (action) {
    case "create":
      return subject ? `${subject} created` : "Environment created";
    case "rename":
      return "Name saved";
    case "configure":
      return "Sandbox settings saved";
    case "remove":
      return subject ? `${subject} removed` : "Environment removed";
  }
}

export interface EnvironmentsAlertProps {
  readonly action: EnvironmentsAction | "refresh";
  readonly error: EnvironmentsError;
  /** What the server refused, worded instead of the general message. */
  readonly problems?: readonly EnvironmentProblem[];
  readonly provider?: string;
  /** Reloads the environments; offered when what the reader sees is out of date. */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** A failed change or read, with Refresh when what the reader sees is out of date. */
export function EnvironmentsAlert(props: EnvironmentsAlertProps) {
  const refreshable = () =>
    needsRefresh(props.error) ||
    (props.problems ?? []).some(
      (problem) => problem === "unknown-harness" || problem === "unknown-sandbox-provider",
    );
  return (
    <div class={s.alert}>
      <Show
        when={(props.problems ?? []).length > 0}
        fallback={<Field.Alert>{environmentsMessage(props.action, props.error)}</Field.Alert>}
      >
        <div class={s.alertMessages}>
          {(props.problems ?? []).map((problem) => (
            <Field.Alert>{problemMessage(problem, props.provider ?? "This provider")}</Field.Alert>
          ))}
        </div>
      </Show>
      <Show when={props.onRefresh && refreshable()}>
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
