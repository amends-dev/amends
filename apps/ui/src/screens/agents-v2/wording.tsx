import { Show } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import type { Status } from "../../components/status-mark/index.ts";
import * as s from "./agents-v2.css.ts";

/** How hard a model reasons, from least to most; an agent without one takes the model's default. */
export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** The part of an agent's setup that one of the workspace's connections gives. */
export type SetupPart = "harness" | "model" | "sandbox";

/**
 * Why an agent can't run as it is set up: the connection for a part was removed, its integration
 * is not installed on this host, or it doesn't give the part as the agent takes it, as its
 * integration says; its harness works only in a sandbox and it has none; or, on Auto, no connection
 * gives a harness it can run on.
 */
export type AgentV2Issue =
  | { readonly kind: "removed"; readonly part: SetupPart }
  | { readonly kind: "uninstalled"; readonly part: SetupPart }
  | { readonly kind: "invalid"; readonly part: SetupPart; readonly description: string }
  | { readonly kind: "sandbox-required" }
  | { readonly kind: "no-harness" };

/** One of the workspace's connections, as an agent's setup names it. */
export interface SetupConnection {
  readonly id: string;
  /** Its name, while it is not removed. */
  readonly name?: string;
}

/** An agent, as the list, the sidebar, and its page show it. */
export interface AgentV2Summary {
  readonly id: string;
  /** Its membership, which names it and gives it its role. */
  readonly memberId: string;
  readonly name: string;
  readonly instructions: string;
  /** The harness connection it runs on, or Auto, for amends to choose one as it works. */
  readonly harness: { readonly kind: "auto" } | (SetupConnection & { readonly kind: "connection" });
  /** The model it runs on, by the id its provider gives it, through a connection. */
  readonly model: {
    readonly connection: SetupConnection;
    readonly id: string;
    /** The model's name, when its connection lists it. */
    readonly name?: string;
    readonly effort?: Effort;
  };
  /** Where it works, or nowhere, when it answers from its model alone. */
  readonly sandbox?: SetupConnection;
  /** Why it can't run as it is set up; empty when it can. */
  readonly issues: readonly AgentV2Issue[];
  /** The reader may rename it and change how it is set up. */
  readonly configurable: boolean;
  /** Who added it, by name. */
  readonly createdBy: string;
  readonly createdAt: Date;
  /** Where it is at work now, apart from its setup; unset while it is idle. */
  readonly activity?: AgentV2Activity;
}

/** Where an agent is at work: its most pressing turn state, and each place, such as "#general". */
export interface AgentV2Activity {
  readonly state: "queued" | "working" | "stopping";
  readonly places: readonly string[];
}

/** One of an agent's turns in progress, as its page lists it. */
export interface AgentV2Turn {
  readonly id: string;
  readonly state: "queued" | "working" | "stopping";
  /** Where it works, such as "#general". */
  readonly place: string;
  /** Where its log opens, beside its thread. */
  readonly href: string;
}

const turnStates = { queued: "Queued", working: "Working", stopping: "Stopping" } as const;

/** A turn's state in a word, such as "Working". */
export const turnStateWord = (state: AgentV2Turn["state"]) => turnStates[state];

/** Where an agent is at work, as a line: "#general", or "#general + 1 more". */
export const placesLine = (places: readonly string[]) =>
  places.length > 1 ? `${places[0]} + ${places.length - 1} more` : (places[0] ?? "");

/** A connection that gives harnesses, as the harness choice offers it. */
export interface HarnessOption {
  readonly id: string;
  readonly name: string;
  /** Its integration's name, such as "opencode". */
  readonly integrationName: string;
  /** Its agent works only in a sandbox. */
  readonly requiresSandbox: boolean;
  /** Why it can't be chosen, for the one an agent names that is removed or not installed. */
  readonly unavailable?: string;
}

/** A connection that gives models or sandboxes, as their choices offer it. */
export interface ConnectionOption {
  readonly id: string;
  readonly name: string;
  readonly integrationName: string;
  /** Why it can't be chosen, for the one an agent names that is removed or not installed. */
  readonly unavailable?: string;
}

/** A model a connection lists, with the efforts it takes; none when it doesn't reason. */
export interface ModelOption {
  readonly id: string;
  readonly name: string;
  readonly efforts: readonly Effort[];
}

/**
 * The models a connection offers: those it lists, and whether it takes a model it doesn't list,
 * which takes any effort. Loading while they are read, and failed when they couldn't be.
 */
export type ModelChoices =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | {
      readonly status: "loaded";
      readonly listed: readonly ModelOption[];
      readonly unlisted: boolean;
    };

/** A role an agent may start with, and whether the reader may give it. */
export interface AgentV2RoleOption {
  readonly id: string;
  readonly name: string;
  readonly assignable: boolean;
}

/** A change made to agents v2. */
export type AgentsV2Action = "create" | "rename" | "configure" | "remove";

/**
 * Why a change or read failed: `changed`, `denied`, and `gone` mean what the reader sees is out of
 * date; `unavailable` that a connection the setup names is gone or not the reader's to use, at
 * `part`; `incomplete` that the agent couldn't run as set up, for `issues`; `role-denied` that the
 * reader may not give the role; `refresh-failed` that a change completed but its result could not
 * be loaded; and `outdated` that a live refresh failed.
 */
export type AgentsV2Error =
  | "changed"
  | "denied"
  | "gone"
  | "invalid"
  | "failed"
  | "unavailable"
  | "incomplete"
  | "role-denied"
  | "refresh-failed"
  | "outdated";

/** A change's failure, or a refresh's, with the action it belongs to. */
export interface AgentsV2Failure {
  readonly action: AgentsV2Action | "refresh";
  readonly error: AgentsV2Error;
  /** The part whose connection is unavailable, for `unavailable`. */
  readonly part?: SetupPart;
  /** Why the setup couldn't run, for `incomplete`. */
  readonly issues?: readonly AgentV2Issue[];
}

export const effortLabels = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
} as const satisfies Record<Effort, string>;

/** Every effort, least first, as a model offered unlisted takes any of them. */
export const efforts: readonly Effort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/** What an issue means for the agent, in a sentence. */
export function issueMessage(issue: AgentV2Issue): string {
  switch (issue.kind) {
    case "removed":
      return `Its ${issue.part} connection was removed.`;
    case "uninstalled":
      return `Its ${issue.part} connection’s integration isn’t installed on this host.`;
    case "invalid":
      return issue.description.endsWith(".") ? issue.description : `${issue.description}.`;
    case "sandbox-required":
      return "Its harness works only in a sandbox, and it has none.";
    case "no-harness":
      return "No connection gives a harness it can run on.";
  }
}

/**
 * A field of an agent's setup: the model's part has two, its connection and the model it offers,
 * so a connection that is gone shows at the first and a model it doesn't take at the second.
 */
export type SetupField = "harness" | "model-connection" | "model" | "sandbox";

/** The setup field an issue belongs beside. */
export function issueField(issue: AgentV2Issue): SetupField {
  switch (issue.kind) {
    case "sandbox-required":
      return "sandbox";
    case "no-harness":
      return "harness";
    case "invalid":
      return issue.part;
    case "removed":
    case "uninstalled":
      return issue.part === "model" ? "model-connection" : issue.part;
  }
}

/**
 * An agent's state: Needs setup when it can't run, with its first issue on hover; else where it is
 * at work, such as "Working in #general", with the logo moving where the words show. Undefined
 * while it is ready and idle, which shows nothing.
 */
export function agentV2Status(
  issues: readonly AgentV2Issue[],
  activity?: AgentV2Activity,
): Status | undefined {
  const [first] = issues;
  if (first !== undefined)
    return { mark: "attention", label: "Needs setup", detail: issueMessage(first) };
  if (activity === undefined) return undefined;
  return {
    mark: "available",
    label: `${turnStateWord(activity.state)} in ${placesLine(activity.places)}`,
    activity: activity.state,
  };
}

/** The harness it runs on, as a line: "Auto", or the connection's name. */
export const harnessLine = (harness: AgentV2Summary["harness"]) =>
  harness.kind === "auto" ? "Auto" : (harness.name ?? "Removed connection");

/** The model it runs on, as a line: "Claude Opus 5.5 · OpenRouter", with its effort when set. */
export const modelLine = (model: AgentV2Summary["model"]) =>
  [
    model.name ?? model.id,
    model.connection.name ?? "Removed connection",
    ...(model.effort === undefined ? [] : [`${effortLabels[model.effort]} effort`]),
  ].join(" · ");

/** Where it works, as a line: the sandbox connection's name, or "No sandbox". */
export const sandboxLine = (sandbox: AgentV2Summary["sandbox"]) =>
  sandbox === undefined ? "No sandbox" : (sandbox.name ?? "Removed connection");

const changed: { readonly [Action in AgentsV2Action]: string } = {
  create: "The workspace changed meanwhile. Refresh, then try again.",
  rename: "This agent was renamed meanwhile. Refresh to review it, then save again.",
  configure: "This agent changed meanwhile. Refresh to review it, then save again.",
  remove: "This agent changed meanwhile. Refresh to review it.",
};
const invalid: { readonly [Action in AgentsV2Action]: string } = {
  create: "Check the name, instructions, and model, then try again.",
  rename: "Use 1 to 80 characters, with no invisible ones.",
  configure: "Check the instructions and model, then save again.",
  remove: "That change isn’t possible.",
};
const failed: { readonly [Action in AgentsV2Action]: string } = {
  create:
    "The agent couldn’t be created. Try again when the host is available; it won’t be created twice.",
  rename: "The name couldn’t be saved. Try again when the host is available.",
  configure: "The setup couldn’t be saved. Try again when the host is available.",
  remove: "The agent couldn’t be removed. Try again when the host is available.",
};

/** What went wrong, for the place the change was made; `refresh` covers reads. */
export function agentsV2Message(failure: AgentsV2Failure): string {
  const { action, error } = failure;
  if (error === "outdated") return "The latest agents could not be loaded. Refresh to try again.";
  if (error === "refresh-failed")
    return action === "create"
      ? "The agent was created, but the latest agents could not be loaded. Refresh to see it."
      : "Saved, but the latest agents could not be loaded. Refresh to continue.";
  if (error === "unavailable" || error === "incomplete")
    return "This setup can’t be saved as it is. Change what’s marked, then try again.";
  if (error === "role-denied") return "You can’t give that role. Choose another.";
  if (error === "denied")
    return "You no longer have permission to do this. Refresh to review your access.";
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

/**
 * What the host refused in a setup, at the field each belongs beside: a connection no longer the
 * reader's to use, or what would keep the agent from running.
 */
export function setupProblems(
  failure: AgentsV2Failure | undefined,
): Partial<Record<SetupField, string>> {
  if (failure?.error === "unavailable" && failure.part !== undefined)
    return {
      [failure.part === "model" ? "model-connection" : failure.part]:
        "This connection is no longer available to you. Choose another.",
    };
  if (failure?.error !== "incomplete") return {};
  const problems: Partial<Record<SetupField, string>> = {};
  for (const issue of failure.issues ?? []) problems[issueField(issue)] ??= issueMessage(issue);
  return problems;
}

/** Whether the reader must reload before changing anything more. */
export const needsRefresh = (error: AgentsV2Error) =>
  error === "changed" ||
  error === "denied" ||
  error === "gone" ||
  error === "refresh-failed" ||
  error === "outdated";

/** A change that completed, for a confirming toast. */
export function agentsV2Toast(action: AgentsV2Action, subject?: string) {
  switch (action) {
    case "create":
      return subject ? `${subject} created` : "Agent created";
    case "rename":
      return "Name saved";
    case "configure":
      return "Setup saved";
    case "remove":
      return subject ? `${subject} removed` : "Agent removed";
  }
}

export interface AgentsV2AlertProps {
  readonly failure: AgentsV2Failure;
  /** Reloads the agents; offered when what the reader sees is out of date. */
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** A failed change or read, with Refresh when what the reader sees is out of date. */
export function AgentsV2Alert(props: AgentsV2AlertProps) {
  return (
    <div class={s.alert}>
      <Field.Alert>{agentsV2Message(props.failure)}</Field.Alert>
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
