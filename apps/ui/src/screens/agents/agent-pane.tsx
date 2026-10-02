import { For, Match, Show, Switch, createUniqueId } from "solid-js";
import { Button, ButtonLink } from "../../components/button/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Notice } from "../../components/notice/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { TurnActivity } from "../../components/turn-status/index.ts";
import { calendarDate } from "../../internal/when.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { SectionHeading } from "../environments/sandbox-fields.tsx";
import {
  ConfigurationSummary,
  InstructionsField,
  ModelFields,
  type ModelFieldsProps,
} from "./configuration-fields.tsx";
import {
  AgentsAlert,
  agentStatus,
  blocker,
  issueMessage,
  type AgentIssue,
  type AgentSummary,
  type AgentsAction,
  type AgentsFailure,
} from "./wording.tsx";
import * as s from "./agents.css.ts";

export type AgentTab = "overview" | "configuration";

/** One of the agent's turns in progress, by where it works, opening its log beside the page. */
export interface AgentTurnSummary {
  readonly id: string;
  readonly state: "queued" | "working" | "stopping";
  /** The thread's group, such as "#general", or the people of a direct conversation. */
  readonly where: string;
}

export interface AgentPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  /** The agent, once it has loaded. */
  readonly agent?: AgentSummary;
  /** In place of the page, while it loads or when it cannot show. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** Opens the full list of agents, from an agent that is gone. */
  readonly onBrowse?: () => void;
  readonly tab: AgentTab;
  readonly tabHref: (tab: AgentTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: AgentTab) => void;
  /** The name being edited. */
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** The name differs from the saved one and can be saved. */
  readonly nameChanged: boolean;
  readonly onSaveName: () => void;
  /** Whether its model connection's key is saved, when the reader may read the connection. */
  readonly connectionReady?: boolean;
  /** The configuration being edited, for a reader who may change it. */
  readonly configuration?: Omit<ModelFieldsProps, "problems" | "purpose" | "disabled"> & {
    readonly instructions: string;
    readonly onInstructionsChange: (instructions: string) => void;
  };
  /** The configuration differs from the saved one and can be saved. */
  readonly configurationChanged: boolean;
  readonly onSaveConfiguration: () => void;
  /** Sets aside unsaved configuration. */
  readonly onDiscardConfiguration: () => void;
  /** Opens the model connection, such as to add its key. */
  readonly onOpenConnection?: () => void;
  /** Opens the environment, such as to finish its setup. */
  readonly onOpenEnvironment?: () => void;
  /** Its turns in progress; each opens its log in the side panel. */
  readonly turns?: readonly AgentTurnSummary[];
  readonly onOpenTurn?: (turnId: string) => void;
  /** Asks to remove the agent. */
  readonly onRemove?: () => void;
  /** The change running, if any. */
  readonly pending?: AgentsAction | "refresh";
  /** A failed change made here, or a read that failed. */
  readonly failure?: AgentsFailure;
  readonly onRefresh?: () => void;
}

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "configuration", label: "Configuration" },
] as const;

const turnStates = { queued: "Queued", working: "Working", stopping: "Stopping" } as const;

/**
 * An agent's page in the main content. Overview reads in one column: a notice with the fix when
 * something keeps it from running, then its name, its saved configuration, its details, and
 * removal. A ready agent shows no status there; its title avatar carries the patch. Configuration holds its
 * instructions, model access, and environment, saved together from the bar under them. A reader
 * who may not configure it sees the same values without inputs.
 */
export function AgentPane(props: AgentPaneProps) {
  const nameForm = `agent-name-${createUniqueId()}`;
  const configurationForm = `agent-configuration-${createUniqueId()}`;
  const configurable = () => props.agent?.configurable ?? false;
  const busy = () => props.pending !== undefined;
  const configurationTab = () => props.tab === "configuration";
  const openTab = (tab: AgentTab) => (event: MouseEvent) => {
    if (!props.onTabChange) return;
    event.preventDefault();
    props.onTabChange(tab);
  };
  const failureOf = (...actions: ReadonlyArray<AgentsAction | "refresh">) => {
    const failure = props.failure;
    return failure && actions.includes(failure.action) ? failure : undefined;
  };
  const alert = (...actions: ReadonlyArray<AgentsAction | "refresh">) => (
    <Show when={failureOf(...actions)}>
      {(failure) => (
        <Show when={failure().problems.length === 0}>
          <AgentsAlert
            action={failure().action}
            error={failure().error}
            onRefresh={props.onRefresh}
            refreshing={props.pending === "refresh"}
          />
        </Show>
      )}
    </Show>
  );
  /** What brings the first issue back: opening what needs setup, or choosing another. */
  const recovery = (issue: AgentIssue | undefined) => {
    const configure = (label: string) =>
      configurable() ? { label, run: () => props.onTabChange?.("configuration") } : undefined;
    switch (issue) {
      case undefined:
        return undefined;
      case "connection-not-ready":
        return props.onOpenConnection && { label: "Open connection", run: props.onOpenConnection };
      case "environment-not-ready":
        return (
          props.onOpenEnvironment && { label: "Open environment", run: props.onOpenEnvironment }
        );
      case "connection-unavailable":
      case "no-model-inference":
        return configure("Choose connection");
      case "environment-unavailable":
      case "interface-unsupported":
        return configure("Choose environment");
      case "reasoning-unsupported":
        return configure("Change configuration");
    }
  };
  /** The first issue's recovery, as its notice's action. */
  const fix = (issue: AgentIssue) => {
    const action = recovery(issue);
    return action && { label: action.label, onClick: action.run, disabled: busy() };
  };
  /** Where it is at work: from the list's summary, or from its turns in progress here. */
  const activity = () => {
    const turns = props.turns ?? [];
    const [first] = turns;
    return (
      props.agent?.activity ??
      (first && { state: first.state, places: turns.map((turn) => turn.where) })
    );
  };
  return (
    <Pane.Root class={s.pane}>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title
          person={
            props.agent && {
              name: props.agent.name,
              initials: props.agent.name.trim().charAt(0).toUpperCase(),
              tone: "lilac",
            }
          }
          status={props.agent && agentStatus(props.agent.issues, activity())}
          context={props.workspaceName}
        >
          {props.agent?.name ?? "Agent"}
        </Pane.Title>
        <Show when={props.agent}>
          <Pane.Tabs>
            <Tabs.List aria-label="Agent">
              <For each={tabs}>
                {(tab) => (
                  <Tabs.Tab
                    href={props.tabHref(tab.id)}
                    current={props.tab === tab.id}
                    onClick={openTab(tab.id)}
                  >
                    {tab.label}
                  </Tabs.Tab>
                )}
              </For>
            </Tabs.List>
          </Pane.Tabs>
        </Show>
      </Pane.Header>
      <Switch>
        <Match when={props.status === "loading"}>
          <Pane.Body>
            <p class={s.visuallyHidden} role="status">
              Loading agent…
            </p>
          </Pane.Body>
        </Match>
        <Match when={props.status === "unavailable"}>
          <Pane.Body>
            <EmptyState
              art="held-back"
              title="Agents aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState
              art="came-apart"
              title="Couldn’t load agents"
              lines={["Try again once the host is reachable."]}
            >
              <Show when={props.onRetry}>
                {(retry) => <Button onClick={() => retry()()}>Retry</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={!props.agent}>
          <Pane.Body>
            <EmptyState
              art="lost-thread"
              title="This agent isn’t here"
              lines={["It may have been removed, or you can no longer see it."]}
            >
              <Show when={props.onBrowse}>
                {(browse) => <Button onClick={() => browse()()}>Show all agents</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={configurationTab() && props.agent}>
          {(agent) => (
            <>
              <Pane.Body>
                <Pane.Column>
                  <Show
                    when={configurable() && props.configuration}
                    fallback={
                      <ConfigurationSummary
                        instructions={agent().instructions}
                        connection={agent().connection.name}
                        connectionReady={props.connectionReady}
                        model={agent().model}
                        environment={agent().environment.name}
                        runtime={agent().environment.runtime}
                        issues={agent().issues}
                      />
                    }
                  >
                    {(editor) => (
                      <form
                        id={configurationForm}
                        class={s.fields}
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (props.configurationChanged && !busy()) props.onSaveConfiguration();
                        }}
                      >
                        <InstructionsField
                          value={editor().instructions}
                          onChange={editor().onInstructionsChange}
                          disabled={busy()}
                        />
                        <ModelFields
                          {...editor()}
                          purpose="configure"
                          problems={failureOf("configure")?.problems}
                          disabled={busy()}
                        />
                        {alert("configure")}
                      </form>
                    )}
                  </Show>
                </Pane.Column>
              </Pane.Body>
              <Show when={configurable() && props.configuration}>
                <Modal.Actions>
                  <Button disabled={busy()} onClick={() => props.onDiscardConfiguration()}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form={configurationForm}
                    variant="primary"
                    class={s.primary}
                    disabled={!props.configurationChanged || busy()}
                  >
                    Save configuration
                  </Button>
                </Modal.Actions>
              </Show>
            </>
          )}
        </Match>
        <Match when={props.agent}>
          {(agent) => (
            <Pane.Body>
              <Pane.Column>
                <Show when={agent().issues[0]}>
                  {(first) => (
                    <Notice
                      tone={agent().issues.some(blocker) ? "danger" : "caution"}
                      title={issueMessage(first(), agent())}
                      action={fix(first())}
                    >
                      {agent()
                        .issues.slice(1)
                        .map((issue) => issueMessage(issue, agent()))
                        .join(" ")}
                    </Notice>
                  )}
                </Show>
                {alert("refresh", "remove")}
                <Show
                  when={configurable()}
                  fallback={
                    <div class={s.field}>
                      <span class={s.factLabel}>Agent name</span>
                      <p class={s.nameValue}>{agent().name}</p>
                      <p class={s.note}>
                        You can view this agent. Ask an administrator to make changes.
                      </p>
                    </div>
                  }
                >
                  <form
                    id={nameForm}
                    class={s.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (props.nameChanged && !busy()) props.onSaveName();
                    }}
                  >
                    <Field.Root>
                      <Field.Label>Agent name</Field.Label>
                      <Input
                        value={props.name}
                        onInput={(event) => props.onNameChange(event.currentTarget.value)}
                        maxLength={80}
                        disabled={busy()}
                        required
                      />
                    </Field.Root>
                    {alert("rename")}
                    <Button type="submit" class={s.start} disabled={!props.nameChanged || busy()}>
                      Save name
                    </Button>
                  </form>
                </Show>
                <section class={s.section} aria-label="Configuration">
                  <SectionHeading>Configuration</SectionHeading>
                  <div class={s.summary}>
                    <p class={s.note}>{agent().connection.name ?? "Unavailable connection"}</p>
                    <p class={s.summaryModel}>{agent().model}</p>
                    <p class={s.note}>{agent().environment.name ?? "Unavailable environment"}</p>
                  </div>
                  <ButtonLink
                    href={props.tabHref("configuration")}
                    class={s.start}
                    onClick={openTab("configuration")}
                  >
                    {configurable() ? "Edit configuration" : "View configuration"}
                  </ButtonLink>
                </section>
                <section class={s.section} aria-label="Details">
                  <SectionHeading>Details</SectionHeading>
                  <dl class={s.detailList}>
                    <Show when={agent().role}>
                      {(role) => (
                        <div class={s.detail}>
                          <dt class={s.detailName}>Role</dt>
                          <dd class={s.detailValue}>{role()}</dd>
                        </div>
                      )}
                    </Show>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Current activity</dt>
                      <dd class={s.detailValue}>
                        <Show when={(props.turns ?? []).length > 0} fallback="Idle">
                          <ul class={s.turns}>
                            <For each={props.turns}>
                              {(turn) => (
                                <li>
                                  <button
                                    type="button"
                                    class={s.turn}
                                    onClick={() => props.onOpenTurn?.(turn.id)}
                                    aria-label={`${turnStates[turn.state]} in ${turn.where}: open its log`}
                                  >
                                    <TurnActivity state={turn.state}>
                                      {turnStates[turn.state]}
                                    </TurnActivity>
                                    <span class={s.turnWhere}>{turn.where}</span>
                                  </button>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </dd>
                    </div>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Created by</dt>
                      <dd class={s.detailValue}>
                        {`${agent().createdBy ?? "A former member"} · ${calendarDate(agent().createdAt)}`}
                      </dd>
                    </div>
                  </dl>
                </section>
                <Show when={agent().removable && props.onRemove}>
                  {(remove) => (
                    <section class={s.section} aria-label="Membership">
                      <SectionHeading>Membership</SectionHeading>
                      <p class={s.note}>
                        Removing this agent ends its membership in the workspace and its groups. Its
                        record stays in history.
                      </p>
                      <Button class={s.start} disabled={busy()} onClick={() => remove()()}>
                        Remove agent
                      </Button>
                    </section>
                  )}
                </Show>
              </Pane.Column>
            </Pane.Body>
          )}
        </Match>
      </Switch>
    </Pane.Root>
  );
}
