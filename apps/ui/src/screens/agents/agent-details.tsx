import { For, Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { calendarDate } from "../../internal/when.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { SectionHeading } from "../environments/sandbox-fields.tsx";
import { AgentAvatar } from "./agents-pane.tsx";
import {
  ConfigurationSummary,
  InstructionsField,
  ModelFields,
  type ModelFieldsProps,
} from "./configuration-fields.tsx";
import {
  AgentsAlert,
  SetupStatus,
  issueMessage,
  type AgentIssue,
  type AgentProblem,
  type AgentSummary,
  type AgentsAction,
  type AgentsError,
} from "./wording.tsx";
import * as s from "./agents.css.ts";

export type AgentDetailsTab = "overview" | "configuration";

export interface AgentDetailsProps {
  readonly agent: AgentSummary;
  readonly onClose: () => void;
  readonly tab: AgentDetailsTab;
  readonly onTabChange: (tab: AgentDetailsTab) => void;
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
  /** Asks to remove the agent. */
  readonly onRemove?: () => void;
  /** The change running, if any. */
  readonly pending?: AgentsAction | "refresh";
  /** A failed change made here, or a read that failed. */
  readonly failure?: {
    readonly action: AgentsAction | "refresh";
    readonly error: AgentsError;
    readonly problems: readonly AgentProblem[];
  };
  readonly onRefresh?: () => void;
}

/**
 * An agent in the side panel. Overview shows its readiness and what brings it back, its name, its
 * saved configuration, and who created it; Configuration holds its instructions, model access, and
 * environment, saved together. A reader who may not configure it sees the same values without
 * inputs. On phones it fills the screen.
 */
export function AgentDetails(props: AgentDetailsProps) {
  const nameForm = `agent-name-${createUniqueId()}`;
  const configurationForm = `agent-configuration-${createUniqueId()}`;
  const configurable = () => props.agent.configurable;
  const busy = () => props.pending !== undefined;
  const configurationTab = () => props.tab === "configuration";
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
      configurable() ? { label, run: () => props.onTabChange("configuration") } : undefined;
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
  return (
    <Shell.Aside aria-label="Agent details" onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back onClick={() => props.onClose()}>Agents</Pane.Back>
          <Pane.Title>Agent details</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close agent details" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Tabs>
            <Tabs.List aria-label="Agent details">
              <Tabs.Tab current={!configurationTab()} onClick={() => props.onTabChange("overview")}>
                Overview
              </Tabs.Tab>
              <Tabs.Tab
                current={configurationTab()}
                onClick={() => props.onTabChange("configuration")}
              >
                Configuration
              </Tabs.Tab>
            </Tabs.List>
          </Pane.Tabs>
        </Pane.Header>
        <Pane.Body>
          <Show
            when={configurationTab()}
            fallback={
              <div class={s.details}>
                <div class={s.identity}>
                  <div class={s.identityRow}>
                    <AgentAvatar name={props.agent.name} size={40} />
                    <div class={s.identityText}>
                      <h3 class={s.identityName}>{props.agent.name}</h3>
                      <span class={s.identityDetail}>
                        {props.agent.role ? `Agent · ${props.agent.role}` : "Agent"}
                      </span>
                    </div>
                  </div>
                  <div class={s.status}>
                    <SetupStatus issues={props.agent.issues} />
                    <Show
                      when={props.agent.issues.length > 0}
                      fallback={
                        <p class={s.note}>The saved model and environment work together.</p>
                      }
                    >
                      <For each={props.agent.issues}>
                        {(issue) => <p class={s.note}>{issueMessage(issue, props.agent)}</p>}
                      </For>
                    </Show>
                    <Show when={recovery(props.agent.issues[0])}>
                      {(action) => (
                        <Button class={s.start} disabled={busy()} onClick={() => action().run()}>
                          {action().label}
                        </Button>
                      )}
                    </Show>
                  </div>
                </div>
                {alert("refresh", "remove")}
                <Show
                  when={configurable()}
                  fallback={
                    <div class={s.field}>
                      <span class={s.factLabel}>Agent name</span>
                      <p class={s.nameValue}>{props.agent.name}</p>
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
                    <Button type="submit" class={s.end} disabled={!props.nameChanged || busy()}>
                      Save name
                    </Button>
                  </form>
                </Show>
                <section class={s.section} aria-label="Configuration">
                  <SectionHeading>Configuration</SectionHeading>
                  <div class={s.summary}>
                    <p class={s.note}>{props.agent.connection.name ?? "Unavailable connection"}</p>
                    <p class={s.summaryModel}>{props.agent.model}</p>
                    <p class={s.note}>
                      {props.agent.environment.name ?? "Unavailable environment"}
                    </p>
                  </div>
                </section>
                <section class={s.section} aria-label="Created by">
                  <SectionHeading>Created by</SectionHeading>
                  <p class={s.note}>
                    {`${props.agent.createdBy ?? "A former member"} · ${calendarDate(props.agent.createdAt)}`}
                  </p>
                </section>
              </div>
            }
          >
            <Show
              when={configurable() && props.configuration}
              fallback={
                <ConfigurationSummary
                  instructions={props.agent.instructions}
                  connection={props.agent.connection.name}
                  connectionReady={props.connectionReady}
                  model={props.agent.model}
                  environment={props.agent.environment.name}
                  runtime={props.agent.environment.runtime}
                  issues={props.agent.issues}
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
          </Show>
        </Pane.Body>
        <Show
          when={configurationTab() && configurable() && props.configuration}
          fallback={
            <Show
              when={!configurationTab() && props.agent.removable && props.onRemove}
              fallback={
                <Modal.Actions>
                  <Button onClick={() => props.onClose()}>Close</Button>
                </Modal.Actions>
              }
            >
              {(remove) => (
                <div class={s.danger}>
                  <Button variant="quiet" disabled={busy()} onClick={() => remove()()}>
                    Remove agent
                  </Button>
                </div>
              )}
            </Show>
          }
        >
          <Modal.Actions>
            <Button
              class={s.leading}
              disabled={busy()}
              onClick={() => props.onDiscardConfiguration()}
            >
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
      </Pane.Root>
    </Shell.Aside>
  );
}
