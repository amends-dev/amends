import { For, Match, Show, Switch } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Combobox } from "../../components/combobox/index.ts";
import { Field } from "../../components/field/index.ts";
import { TextArea } from "../../components/input/index.ts";
import { Select, type SelectOption } from "../../components/select/index.ts";
import {
  StatusLabel,
  blockerMessages,
  problemMessage,
  setupLabel,
  setupMessages,
  type AgentEnvironmentOption,
  type AgentIssue,
  type AgentProblem,
  type EnvironmentFit,
  type ModelConnectionOption,
} from "./wording.tsx";
import * as s from "./agents.css.ts";

export interface InstructionsFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

/** An agent's instructions: what it works by, as several lines. */
export function InstructionsField(props: InstructionsFieldProps) {
  return (
    <Field.Root>
      <Field.Label>Instructions</Field.Label>
      <TextArea
        value={props.value}
        onInput={(event) => props.onChange(event.currentTarget.value)}
        rows={6}
        maxLength={20_000}
        disabled={props.disabled}
      />
    </Field.Root>
  );
}

export interface ModelFieldsProps {
  readonly connections: readonly ModelConnectionOption[];
  readonly connectionId: string | undefined;
  readonly onConnectionChange: (connectionId: string) => void;
  /** Starts creating a model connection, returning to this draft. */
  readonly onCreateConnection?: () => void;
  readonly model: string;
  readonly onModelChange: (model: string) => void;
  /** The environments the reader may use, with how each fits the chosen model access. */
  readonly environments: readonly AgentEnvironmentOption[];
  readonly environmentId: string | undefined;
  readonly onEnvironmentChange: (environmentId: string) => void;
  /** The reasoning level; undefined for the harness's default. */
  readonly reasoning: string | undefined;
  readonly onReasoningChange: (reasoning: string | undefined) => void;
  /** What the server refused, worded at its field. */
  readonly problems?: readonly AgentProblem[];
  /** Creating an agent, or saving one's configuration: words what setup can wait. */
  readonly purpose: "create" | "configure";
  readonly disabled?: boolean;
}

const unavailable = (value: string, label: string): SelectOption => ({
  value,
  label,
  disabled: true,
});

/**
 * An agent's model access and where it starts: a model connection, a suggested or entered model,
 * and an environment, each environment showing whether it can run that model. A reasoning level
 * shows only for a harness that takes one, or to clear one it no longer takes.
 */
export function ModelFields(props: ModelFieldsProps) {
  const connection = () => props.connections.find((option) => option.id === props.connectionId);
  const environment = () => props.environments.find((option) => option.id === props.environmentId);
  const problem = (kind: AgentProblem["kind"]) =>
    (props.problems ?? []).find((candidate) => candidate.kind === kind);
  const connectionOptions = (): readonly SelectOption[] => [
    ...props.connections.map((option) => ({
      value: option.id,
      label: option.name,
      description: option.ready ? "Configured" : "Needs API key",
    })),
    ...(props.connectionId !== undefined && connection() === undefined
      ? [unavailable(props.connectionId, "Previous connection · Unavailable")]
      : []),
  ];
  const environmentOptions = (): readonly SelectOption[] => [
    ...props.environments.map((option) => ({
      value: option.id,
      label: option.name,
      description: option.runtime,
      ...fitOption(option),
    })),
    ...(props.environmentId !== undefined && environment() === undefined
      ? [unavailable(props.environmentId, "Previous environment · Unavailable")]
      : []),
  ];
  const environmentError = () => {
    const found = problem("environment-unavailable") ?? problem("incompatible");
    return found && problemMessage(found);
  };
  const levels = () => environment()?.reasoningLevels ?? [];
  return (
    <>
      <Field.Root
        hint={
          connection()
            ? connection()!.ready
              ? "Configured · Model access"
              : "Needs API key · Can finish setup later"
            : props.connectionId === undefined
              ? undefined
              : "Choose another connection."
        }
        error={
          problem("connection-unavailable") && problemMessage(problem("connection-unavailable")!)
        }
      >
        <Field.Label>Model connection</Field.Label>
        <Select
          heading="Model connections"
          options={connectionOptions()}
          value={props.connectionId}
          onChange={props.onConnectionChange}
          placeholder={
            props.connections.length === 0 ? "No model connections yet" : "Choose a connection"
          }
          disabled={props.disabled}
          action={
            props.onCreateConnection && {
              label: "Create model connection",
              onSelect: props.onCreateConnection,
            }
          }
        />
      </Field.Root>
      <Field.Root hint="Choose a suggestion or enter a model ID.">
        <Field.Label>Model</Field.Label>
        <Combobox
          value={props.model}
          onChange={props.onModelChange}
          suggestions={(connection()?.models ?? []).map((model) => ({
            value: model.id,
            label: model.name,
          }))}
          heading="Suggested models"
          footer="Or enter another model ID."
          custom={{
            label: (text) => `Use “${text}”`,
            description: "Use this model ID as entered.",
          }}
          placeholder="Model ID"
          monospace
          disabled={props.disabled}
        />
      </Field.Root>
      <div class={s.field}>
        <Field.Root error={environmentError()}>
          <Field.Label>Environment</Field.Label>
          <Select
            heading="For this model"
            options={environmentOptions()}
            value={props.environmentId}
            onChange={props.onEnvironmentChange}
            placeholder="Choose an environment"
            disabled={props.disabled}
          />
        </Field.Root>
        <Show when={environment()}>
          {(chosen) => <FitState environment={chosen()} purpose={props.purpose} />}
        </Show>
      </div>
      <Switch>
        <Match when={levels().length > 0}>
          <Field.Root>
            <Field.Label>Reasoning</Field.Label>
            <Select
              options={[
                { value: "", label: "Default" },
                ...levels().map((level) => ({ value: level, label: level })),
              ]}
              value={props.reasoning ?? ""}
              onChange={(value) => props.onReasoningChange(value === "" ? undefined : value)}
              disabled={props.disabled}
            />
          </Field.Root>
        </Match>
        <Match when={props.reasoning !== undefined && environment() && props.reasoning}>
          {(saved) => (
            <div class={s.repair}>
              <p class={s.repairTitle}>Saved reasoning: {saved()}</p>
              <p class={s.note}>
                {environment()?.harness ?? "This harness"} doesn’t support this reasoning level. Use
                the default setting or choose a compatible environment.
              </p>
              <Button disabled={props.disabled} onClick={() => props.onReasoningChange(undefined)}>
                Use default reasoning
              </Button>
            </div>
          )}
        </Match>
      </Switch>
    </>
  );
}

/** How an environment option shows its fit: a status, the reasons, and whether it can be chosen. */
function fitOption(option: AgentEnvironmentOption): Partial<SelectOption> {
  const fit = option.fit;
  if (fit === undefined) return {};
  switch (fit.kind) {
    case "works":
      return { status: { label: "Works", tone: "ready" } };
    case "needs-setup":
      return {
        status: { label: "Needs setup", tone: "caution" },
        detail: setupMessages(fit, option.provider).join(" "),
      };
    case "cant-run":
      return {
        status: { label: "Can’t run this model", tone: "caution" },
        detail: fit.reasons.map((reason) => blockerMessages[reason]).join(" "),
        disabled: true,
      };
  }
}

/** Under the environment field: whether the chosen one works, what it still needs, or why not. */
function FitState(props: {
  readonly environment: AgentEnvironmentOption;
  readonly purpose: "create" | "configure";
}) {
  const later = (fit: EnvironmentFit & { readonly kind: "needs-setup" }) => {
    const keyOnly = fit.issues.length === 0 && fit.connection;
    if (props.purpose === "create")
      return keyOnly
        ? "You can create this agent now and add the key later."
        : "You can create this agent now and finish setup later.";
    return keyOnly
      ? "You can save this configuration now and add the key later."
      : "You can save this configuration now and finish setup later.";
  };
  return (
    <div class={s.fieldState}>
      <Switch fallback={<p class={s.note}>{props.environment.runtime}</p>}>
        <Match when={props.environment.fit?.kind === "works"}>
          <StatusLabel label="Works" ready />
          <p class={s.note}>{props.environment.runtime}</p>
        </Match>
        <Match when={props.environment.fit?.kind === "needs-setup" && props.environment.fit}>
          {(fit) => {
            const pending = fit() as EnvironmentFit & { readonly kind: "needs-setup" };
            return (
              <>
                <StatusLabel label="Needs setup" ready={false} />
                <For
                  each={
                    pending.issues.length > 0
                      ? setupMessages(pending, props.environment.provider)
                      : []
                  }
                >
                  {(message) => <p class={s.note}>{message}</p>}
                </For>
                <p class={s.note}>{later(pending)}</p>
              </>
            );
          }}
        </Match>
        <Match when={props.environment.fit?.kind === "cant-run" && props.environment.fit}>
          {(fit) => (
            <>
              <StatusLabel label="Can’t run this model" ready={false} />
              <For each={(fit() as EnvironmentFit & { readonly kind: "cant-run" }).reasons}>
                {(reason) => <p class={s.note}>{blockerMessages[reason]}</p>}
              </For>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}

export interface ConfigurationSummaryProps {
  readonly instructions: string;
  /** The connection's name; undefined when the reader may no longer read it. */
  readonly connection: string | undefined;
  readonly connectionReady: boolean | undefined;
  readonly model: string;
  readonly environment: string | undefined;
  readonly runtime: string | undefined;
  readonly issues: readonly AgentIssue[];
}

/** A member's read-only view of an agent's configuration. */
export function ConfigurationSummary(props: ConfigurationSummaryProps) {
  return (
    <div class={s.fields}>
      <div class={s.field}>
        <span class={s.factLabel}>Instructions</span>
        <p class={s.instructions}>{props.instructions}</p>
      </div>
      <div class={s.field}>
        <span class={s.factLabel}>Model connection</span>
        <p class={s.note}>{props.connection ?? "Unavailable connection"}</p>
        <Show when={props.connectionReady !== undefined}>
          <p class={s.note}>
            {props.connectionReady ? "Configured · Model access" : "Needs API key"}
          </p>
        </Show>
      </div>
      <div class={s.field}>
        <span class={s.factLabel}>Model</span>
        <p class={s.modelNote}>{props.model}</p>
      </div>
      <div class={s.field}>
        <span class={s.factLabel}>Environment</span>
        <p class={s.note}>{props.environment ?? "Unavailable environment"}</p>
        <StatusLabel
          label={props.issues.length === 0 ? "Works" : setupLabel(props.issues)}
          ready={props.issues.length === 0}
        />
        <Show when={props.runtime}>{(runtime) => <p class={s.note}>{runtime()}</p>}</Show>
      </div>
      <p class={s.note}>You can view this configuration.</p>
    </div>
  );
}
