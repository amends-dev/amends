import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconAlertTriangle, IconCheck } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import type { EnvironmentIssue } from "../environments/wording.tsx";
import * as s from "./agents.css.ts";

/**
 * Why an agent cannot run as saved: its model connection needs its key or is gone, its
 * environment is gone or needs setup, or the environment cannot run the model access at all.
 */
export type AgentIssue =
  | "connection-not-ready"
  | "connection-unavailable"
  | "environment-unavailable"
  | "environment-not-ready"
  | "no-model-inference"
  | "interface-unsupported"
  | "reasoning-unsupported";
/** The reasons an environment cannot run a model access at all; the others are setup. */
export type AgentBlocker = Extract<
  AgentIssue,
  "no-model-inference" | "interface-unsupported" | "reasoning-unsupported"
>;

/** An agent, as the list and its details show it. */
export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  /** The role its membership holds, by name, when the reader may read its access. */
  readonly role: string | undefined;
  readonly instructions: string;
  /** Its model connection, by name when the reader may still read it. */
  readonly connection: { readonly id: string; readonly name: string | undefined };
  readonly model: string;
  readonly reasoning: string | undefined;
  /** The environment it starts in, by name and runtime when the reader may still read it. */
  readonly environment: {
    readonly id: string;
    readonly name: string | undefined;
    readonly runtime: string | undefined;
  };
  /** What keeps it from running now; empty when it is ready. */
  readonly issues: readonly AgentIssue[];
  readonly configurable: boolean;
  readonly removable: boolean;
  /** Who added it, by name. */
  readonly createdBy: string | undefined;
  readonly createdAt: Date;
  /**
   * Where it is at work now, apart from its setup: its most pressing turn state, and each thread
   * it works on, such as "#general". Unset while it is idle.
   */
  readonly activity?: {
    readonly state: "queued" | "working" | "stopping";
    readonly places: readonly string[];
  };
}

/** An agent's current activity in a few words: "Working · 2" and "#general + 1 more". */
export const activityWords = (activity: NonNullable<AgentSummary["activity"]>) => {
  const count = activity.places.length;
  const state = { queued: "Queued", working: "Working", stopping: "Stopping" }[activity.state];
  const [first] = activity.places;
  return {
    status: count > 1 ? `${state} · ${count}` : state,
    where: first === undefined ? "" : count > 1 ? `${first} + ${count - 1} more` : first,
  };
};

/** A connection that provides model access, as the connection field offers it. */
export interface ModelConnectionOption {
  readonly id: string;
  readonly name: string;
  /** Its key is saved. */
  readonly ready: boolean;
  /** The models its provider suggests. */
  readonly models: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

/** How an environment fits the chosen model access. */
export type EnvironmentFit =
  | { readonly kind: "works" }
  | {
      readonly kind: "needs-setup";
      readonly issues: readonly EnvironmentIssue[];
      /** The model connection still needs its key. */
      readonly connection: boolean;
    }
  | { readonly kind: "cant-run"; readonly reasons: readonly AgentBlocker[] };

/** An environment an agent can start in. */
export interface AgentEnvironmentOption {
  readonly id: string;
  readonly name: string;
  /** "Amends · Daytona", or "Amends · No sandbox". */
  readonly runtime: string;
  /** Its harness, by name. */
  readonly harness: string;
  /** Its sandbox provider, by name. */
  readonly provider: string | undefined;
  /** The reasoning levels its harness takes. */
  readonly reasoningLevels: readonly string[];
  /** Undefined while the fit is checked. */
  readonly fit: EnvironmentFit | undefined;
}

/** A role an agent can start with. */
export interface AgentRoleOption {
  readonly id: string;
  readonly name: string;
}

/** A change made to agents. */
export type AgentsAction = "create" | "rename" | "configure" | "remove";
/**
 * Why a change or read failed: `changed`, `denied`, and `gone` mean what the reader sees is out
 * of date; `refresh-failed` that a change completed but its result could not be loaded; and
 * `outdated` that a live refresh failed.
 */
export type AgentsError =
  | "changed"
  | "denied"
  | "gone"
  | "invalid"
  | "failed"
  | "refresh-failed"
  | "outdated";
/** What the server refused, worded at the field it concerns. */
export type AgentProblem =
  | { readonly kind: "connection-unavailable" }
  | { readonly kind: "environment-unavailable" }
  | { readonly kind: "incompatible"; readonly reasons: readonly AgentIssue[] }
  | { readonly kind: "role-denied" };

export const blocker = (issue: AgentIssue): issue is AgentBlocker =>
  issue === "no-model-inference" ||
  issue === "interface-unsupported" ||
  issue === "reasoning-unsupported";

/** "Ready", "Needs setup", or "Can’t run" when anything stops it outright. */
export const setupLabel = (issues: readonly AgentIssue[]) =>
  issues.length === 0 ? "Ready" : issues.some(blocker) ? "Can’t run" : "Needs setup";

/** "Anthropic · Team · claude-sonnet-5": the connection and the model. */
export const modelLine = (agent: AgentSummary) =>
  `${agent.connection.name ?? "Unavailable connection"} · ${agent.model}`;

/** What one issue means for this agent. */
export function issueMessage(issue: AgentIssue, agent: AgentSummary) {
  switch (issue) {
    case "connection-not-ready":
      return agent.connection.name
        ? `${agent.connection.name} needs an API key before this agent is ready.`
        : "The model connection needs its API key.";
    case "connection-unavailable":
      return "The model connection is no longer available. Choose another connection.";
    case "environment-unavailable":
      return "The environment is no longer available. Choose another environment.";
    case "environment-not-ready":
      return "This environment needs setup before the agent can use it.";
    case "no-model-inference":
      return "This connection doesn’t provide model access. Choose a model connection.";
    case "interface-unsupported":
      return "This environment’s harness doesn’t support the connection’s model provider.";
    case "reasoning-unsupported":
      return "This harness doesn’t support the saved reasoning level. Use a supported level or clear it.";
  }
}

/** Why an environment cannot run the model access, beside the option or the field. */
export const blockerMessages = {
  "no-model-inference": "This connection doesn’t provide model access.",
  "interface-unsupported": "The harness doesn’t support this connection’s model provider.",
  "reasoning-unsupported": "The harness doesn’t support this reasoning level.",
} as const satisfies Record<AgentBlocker, string>;

/** What an environment still needs before an agent can use it. */
export function setupMessages(
  fit: EnvironmentFit & { readonly kind: "needs-setup" },
  provider?: string,
) {
  const account = provider ? `${provider} account` : "The sandbox account";
  return [
    ...fit.issues.map((issue) => {
      switch (issue) {
        case "harness-unavailable":
          return "Its harness isn’t installed on this server.";
        case "sandbox-unavailable":
          return `${provider ?? "Its sandbox provider"} isn’t installed on this server.`;
        case "connection-unavailable":
          return `${account} is no longer available.`;
        case "connection-incomplete":
          return `${account} needs its API key.`;
      }
    }),
    ...(fit.connection ? ["The model connection needs its API key."] : []),
  ];
}

/** A problem the server refused, worded for its field. */
export function problemMessage(problem: AgentProblem) {
  switch (problem.kind) {
    case "connection-unavailable":
      return "This model connection is no longer available to you. Choose another connection.";
    case "environment-unavailable":
      return "This environment is no longer available to you. Choose another environment.";
    case "role-denied":
      return "Only the workspace owner can give an agent the Administrator role. Choose Member or ask the owner.";
    case "incompatible":
      return problem.reasons
        .filter(blocker)
        .map((reason) => blockerMessages[reason])
        .join(" ");
  }
}

const changed: { readonly [Action in AgentsAction]: string } = {
  create: "The connections or environments changed. Refresh, then try again.",
  rename: "This agent was renamed meanwhile. Refresh to review its name, then save again.",
  configure: "This agent changed meanwhile. Refresh to review it, then save again.",
  remove: "This agent changed meanwhile. Refresh to review it.",
};
const invalid: { readonly [Action in AgentsAction]: string } = {
  create: "Check the name and configuration, then try again.",
  rename: "Use 1 to 80 characters, with no invisible ones.",
  configure: "Check the configuration, then save again.",
  remove: "That change isn’t possible.",
};
const failed: { readonly [Action in AgentsAction]: string } = {
  create:
    "The agent couldn’t be created. Try again when the host is available; it won’t be created twice.",
  rename: "The name couldn’t be saved. Try again when the host is available.",
  configure: "The configuration couldn’t be saved. Try again when the host is available.",
  remove: "The agent couldn’t be removed. Try again when the host is available.",
};

/** What went wrong, for the place the change was made; `refresh` covers reads. */
export function agentsMessage(action: AgentsAction | "refresh", error: AgentsError) {
  if (error === "outdated") return "The latest agents could not be loaded. Refresh to try again.";
  if (error === "refresh-failed")
    return action === "create"
      ? "The agent was created, but the latest agents could not be loaded. Refresh to see it."
      : "Saved, but the latest agents could not be loaded. Refresh to continue.";
  if (error === "denied")
    return action === "remove"
      ? "You can’t remove this agent. Only the workspace owner removes an agent with more than the Member role."
      : "You no longer have permission to do this. Refresh to review your access.";
  if (action === "refresh")
    return error === "changed" || error === "gone"
      ? "Agents changed meanwhile. Refresh to see the latest."
      : "The latest agents could not be loaded. Try again when the host is available.";
  if (error === "gone")
    return action === "create"
      ? "This workspace is no longer available to you."
      : "This agent is no longer available. Refresh to see the latest.";
  if (error === "changed") return changed[action];
  if (error === "invalid") return invalid[action];
  return failed[action];
}

/** Whether the reader must reload before changing anything more. */
export const needsRefresh = (error: AgentsError) => error !== "invalid" && error !== "failed";

/** A change that completed, for a confirming toast. */
export function agentsToast(action: AgentsAction, subject?: string) {
  switch (action) {
    case "create":
      return subject ? `${subject} created` : "Agent created";
    case "rename":
      return "Name saved";
    case "configure":
      return "Configuration saved";
    case "remove":
      return subject ? `${subject} removed` : "Agent removed";
  }
}

export interface AgentsAlertProps {
  readonly action: AgentsAction | "refresh";
  readonly error: AgentsError;
  /** Reloads the agents; offered when what the reader sees is out of date. */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** A failed change or read, with Refresh when what the reader sees is out of date. */
export function AgentsAlert(props: AgentsAlertProps) {
  return (
    <div class={s.alert}>
      <Field.Alert>{agentsMessage(props.action, props.error)}</Field.Alert>
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

/** A state with a check, or a warning in the caution color. */
export function StatusLabel(props: { readonly label: string; readonly ready: boolean }) {
  return (
    <span class={s.readiness} data-ready={props.ready ? "" : undefined}>
      <Dynamic component={props.ready ? IconCheck : IconAlertTriangle} class={s.readinessIcon} />
      {props.label}
    </span>
  );
}

/** An agent's setup: Ready, Needs setup, or Can’t run. */
export function SetupStatus(props: { readonly issues: readonly AgentIssue[] }) {
  return <StatusLabel label={setupLabel(props.issues)} ready={props.issues.length === 0} />;
}
