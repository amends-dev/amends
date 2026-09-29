import { For, Show } from "solid-js";
import { IconMarkClose, IconMarkMore } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Choice } from "../../components/choice/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Field } from "../../components/field/index.ts";
import { IconButton } from "../../components/icon-button/index.ts";
import { Input } from "../../components/input/index.ts";
import { Menu } from "../../components/menu/index.ts";
import { Select } from "../../components/select/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import {
  problemMessage,
  retentionDescriptions,
  retentionLabels,
  type EnvironmentProblem,
  type Retention,
  type SandboxAccountOption,
  type SandboxProviderOption,
} from "./wording.tsx";
import * as s from "./environments.css.ts";

/** A variable row being edited; its ID keeps the row across edits. */
export interface VariableRowView {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}
/** A setup command row being edited. */
export interface CommandRowView {
  readonly id: string;
  readonly command: string;
}

/** The most variables and setup commands an environment holds. */
const limit = 50;

export interface SandboxFieldsProps {
  readonly provider: SandboxProviderOption;
  /** Connections the sandbox can run under, when the provider takes one. */
  readonly accounts: readonly SandboxAccountOption[];
  readonly accountId: string | undefined;
  readonly onAccountChange: (accountId: string) => void;
  /** Starts creating an account connection, keeping this draft. */
  readonly onCreateAccount?: () => void;
  readonly template: string;
  readonly onTemplateChange: (template: string) => void;
  readonly variables: readonly VariableRowView[];
  readonly onAddVariable: () => void;
  readonly onVariableChange: (
    id: string,
    change: { readonly key?: string; readonly value?: string },
  ) => void;
  readonly onRemoveVariable: (id: string) => void;
  /** Why a variable row would be refused. */
  readonly variableIssue?: (id: string) => "invalid" | "duplicate" | undefined;
  readonly commands: readonly CommandRowView[];
  readonly onAddCommand: () => void;
  readonly onCommandChange: (id: string, command: string) => void;
  readonly onMoveCommand: (id: string, by: -1 | 1) => void;
  readonly onRemoveCommand: (id: string) => void;
  readonly retention: Retention;
  readonly onRetentionChange: (retention: Retention) => void;
  /** What the server refused, shown beside the field it concerns. */
  readonly problems?: readonly EnvironmentProblem[];
  readonly disabled?: boolean;
}

const variableMessages = {
  invalid: "Use letters, digits, and underscores, not starting with a digit.",
  duplicate: "This variable is already set above.",
} as const;

/** A section heading with its running stitch. */
export function SectionHeading(props: { readonly children: string }) {
  return (
    <div class={s.heading}>
      <h4 class={s.headingText}>{props.children}</h4>
      <Divider class={s.headingStitch} />
    </div>
  );
}

/**
 * A sandbox's settings as a form: the account it runs under, its starting point, non-secret
 * variables, setup commands in order, and what releasing it does. A provider without an account
 * or template shows neither.
 */
export function SandboxFields(props: SandboxFieldsProps) {
  const has = (...problems: EnvironmentProblem[]) =>
    (props.problems ?? []).find((problem) => problems.includes(problem));
  const accountProblem = () =>
    has(
      "connection-required",
      "connection-not-allowed",
      "connection-unavailable",
      "connection-mismatch",
    );
  const selected = () => props.accounts.find((account) => account.id === props.accountId);
  return (
    <div class={s.sandboxFields}>
      <Show
        when={props.provider.account}
        fallback={
          <Show when={!props.provider.template}>
            <p class={s.note}>
              {props.provider.name} {lowerFirst(props.provider.description)} It uses no account or
              template.
            </p>
          </Show>
        }
      >
        <Show
          when={props.accounts.length > 0}
          fallback={
            <div class={s.field}>
              <span class={s.label}>{props.provider.name} account</span>
              <div class={s.emptyAccounts}>
                <p class={s.emptyAccountsTitle}>No {props.provider.name} connections yet</p>
                <p class={s.note}>Create one, then return to this environment.</p>
                <Show when={props.onCreateAccount}>
                  {(create) => (
                    <Button class={s.start} disabled={props.disabled} onClick={() => create()()}>
                      Create {props.provider.name} connection
                    </Button>
                  )}
                </Show>
              </div>
              <Show when={accountProblem()}>
                {(problem) => (
                  <Field.Alert>{problemMessage(problem(), props.provider.name)}</Field.Alert>
                )}
              </Show>
            </div>
          }
        >
          <Field.Root
            hint={
              selected() && !selected()!.ready
                ? "Needs API key · Can finish setup later"
                : undefined
            }
          >
            <div class={s.labelRow}>
              <Field.Label>{props.provider.name} account</Field.Label>
              <Show when={props.onCreateAccount}>
                {(create) => (
                  <Button
                    variant="quiet"
                    class={s.labelAction}
                    disabled={props.disabled}
                    onClick={() => create()()}
                  >
                    Create connection
                  </Button>
                )}
              </Show>
            </div>
            <Select
              options={props.accounts.map((account) =>
                account.ready
                  ? { value: account.id, label: account.name }
                  : {
                      value: account.id,
                      label: account.name,
                      description: "Needs API key",
                      status: { mark: "attention" as const, label: "Needs setup" },
                    },
              )}
              value={props.accountId}
              onChange={props.onAccountChange}
              placeholder={`Choose a ${props.provider.name} account`}
              disabled={props.disabled}
              action={
                props.onCreateAccount
                  ? {
                      label: `Create ${props.provider.name} connection`,
                      onSelect: props.onCreateAccount,
                    }
                  : undefined
              }
            />
          </Field.Root>
          <Show when={accountProblem()}>
            {(problem) => (
              <Field.Alert class={s.fieldAlert}>
                {problemMessage(problem(), props.provider.name)}
              </Field.Alert>
            )}
          </Show>
        </Show>
      </Show>
      <Show when={props.provider.template}>
        {(template) => (
          <Field.Root
            hint={template().description}
            error={
              has("template-not-allowed") &&
              problemMessage("template-not-allowed", props.provider.name)
            }
          >
            <Field.Label>{template().label} · Optional</Field.Label>
            <Input
              value={props.template}
              onInput={(event) => props.onTemplateChange(event.currentTarget.value)}
              placeholder={template().placeholder}
              autocomplete="off"
              spellcheck={false}
              disabled={props.disabled}
            />
          </Field.Root>
        )}
      </Show>
      <section class={s.section} aria-label="Environment variables">
        <SectionHeading>Environment variables</SectionHeading>
        <p class={s.note}>Visible to workspace members. Keep credentials in connections.</p>
        <Show when={props.variables.length > 0}>
          <ul class={s.variables}>
            <Keyed each={props.variables} by={(row) => row.id}>
              {(row) => {
                const index = () => props.variables.findIndex((other) => other.id === row().id);
                return (
                  <li class={s.variable}>
                    <Field.Root
                      class={s.variableKey}
                      error={
                        props.variableIssue?.(row().id) &&
                        variableMessages[props.variableIssue(row().id)!]
                      }
                    >
                      <Input
                        class={s.variableName}
                        aria-label={`Variable ${index() + 1} name`}
                        value={row().key}
                        onInput={(event) =>
                          props.onVariableChange(row().id, { key: event.currentTarget.value })
                        }
                        placeholder="NAME"
                        autocomplete="off"
                        spellcheck={false}
                        disabled={props.disabled}
                      />
                    </Field.Root>
                    <Input
                      class={s.variableValue}
                      aria-label={`Variable ${index() + 1} value`}
                      value={row().value}
                      onInput={(event) =>
                        props.onVariableChange(row().id, { value: event.currentTarget.value })
                      }
                      placeholder="value"
                      autocomplete="off"
                      spellcheck={false}
                      disabled={props.disabled}
                    />
                    <IconButton
                      icon={IconMarkClose}
                      label={`Remove variable ${row().key || index() + 1}`}
                      class={s.variableRemove}
                      disabled={props.disabled}
                      onClick={() => props.onRemoveVariable(row().id)}
                    />
                  </li>
                );
              }}
            </Keyed>
          </ul>
        </Show>
        <Show when={props.variables.length < limit}>
          <Button
            variant="quiet"
            class={s.start}
            disabled={props.disabled}
            onClick={() => props.onAddVariable()}
          >
            Add variable
          </Button>
        </Show>
      </section>
      <section class={s.section} aria-label="Setup commands">
        <SectionHeading>Setup commands</SectionHeading>
        <p class={s.note}>
          Run in order before the harness starts, including when reusing a sandbox. Make commands
          safe to repeat.
        </p>
        <Show when={props.commands.length > 0}>
          <ol class={s.commands}>
            <Keyed each={props.commands} by={(row) => row.id}>
              {(row) => {
                const index = () => props.commands.findIndex((other) => other.id === row().id);
                return (
                  <li class={s.command}>
                    <span class={s.commandIndex} aria-hidden="true">
                      {index() + 1}
                    </span>
                    <textarea
                      class={s.commandInput}
                      aria-label={`Command ${index() + 1}`}
                      value={row().command}
                      onInput={(event) =>
                        props.onCommandChange(row().id, event.currentTarget.value)
                      }
                      rows={2}
                      spellcheck={false}
                      disabled={props.disabled}
                    />
                    <Menu.Root placement="bottom-end">
                      <Menu.PlainTrigger
                        class={s.commandMenu}
                        aria-label={`Command ${index() + 1} options`}
                      >
                        <IconMarkMore class={s.commandMenuIcon} />
                      </Menu.PlainTrigger>
                      <Menu.Content aria-label={`Command ${index() + 1} options`}>
                        <Menu.Item
                          disabled={index() === 0}
                          onSelect={() => props.onMoveCommand(row().id, -1)}
                        >
                          Move up
                        </Menu.Item>
                        <Menu.Item
                          disabled={index() === props.commands.length - 1}
                          onSelect={() => props.onMoveCommand(row().id, 1)}
                        >
                          Move down
                        </Menu.Item>
                        <Menu.Item onSelect={() => props.onRemoveCommand(row().id)}>
                          Remove
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Root>
                  </li>
                );
              }}
            </Keyed>
          </ol>
        </Show>
        <Show when={props.commands.length < limit}>
          <Button
            variant="quiet"
            class={s.start}
            disabled={props.disabled}
            onClick={() => props.onAddCommand()}
          >
            Add command
          </Button>
        </Show>
      </section>
      <section class={s.section} aria-label="Retention">
        <SectionHeading>Retention</SectionHeading>
        <Choice.Group
          label="Retention"
          class={s.hiddenLegend}
          value={props.retention}
          onChange={(value) => props.onRetentionChange(value as Retention)}
          variant="card"
          disabled={props.disabled}
        >
          <For each={["stop", "destroy"] as const}>
            {(retention) => (
              <Choice.Option value={retention} description={retentionDescriptions[retention]}>
                {retentionLabels[retention]}
              </Choice.Option>
            )}
          </For>
        </Choice.Group>
      </section>
    </div>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export interface SandboxSummaryProps {
  readonly provider: string;
  /** The account's name, when it runs under one. */
  readonly account?: string;
  readonly template?: string;
  readonly templateLabel?: string;
  readonly variables: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  readonly commands: readonly string[];
  readonly retention: Retention;
}

/** A sandbox's settings for a reader who may not change them. */
export function SandboxSummary(props: SandboxSummaryProps) {
  return (
    <div class={s.sandboxFields}>
      <p class={s.note}>You can view these settings. Ask an administrator to change them.</p>
      <dl class={s.facts}>
        <div class={s.fact}>
          <dt class={s.factLabel}>Provider</dt>
          <dd class={s.factValue}>{props.provider}</dd>
        </div>
        <Show when={props.account}>
          <div class={s.fact}>
            <dt class={s.factLabel}>{props.provider} account</dt>
            <dd class={s.factValue}>{props.account}</dd>
          </div>
        </Show>
        <Show when={props.template}>
          <div class={s.fact}>
            <dt class={s.factLabel}>{props.templateLabel ?? "Template"}</dt>
            <dd class={s.factValue}>{props.template}</dd>
          </div>
        </Show>
      </dl>
      <section class={s.section} aria-label="Environment variables">
        <SectionHeading>Environment variables</SectionHeading>
        <Show when={props.variables.length > 0} fallback={<p class={s.note}>No variables.</p>}>
          <dl class={s.readVariables}>
            <For each={props.variables}>
              {(variable) => (
                <div class={s.readVariable}>
                  <dt class={s.readKey}>{variable.key}</dt>
                  <dd class={s.readValue}>{variable.value}</dd>
                </div>
              )}
            </For>
          </dl>
        </Show>
      </section>
      <section class={s.section} aria-label="Setup commands">
        <SectionHeading>Setup commands</SectionHeading>
        <Show when={props.commands.length > 0} fallback={<p class={s.note}>No setup commands.</p>}>
          <ol class={s.commands}>
            <For each={props.commands}>
              {(command, index) => (
                <li class={s.command}>
                  <span class={s.commandIndex} aria-hidden="true">
                    {index() + 1}
                  </span>
                  <code class={s.readCommand}>{command}</code>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </section>
      <div class={s.fact}>
        <span class={s.factLabel}>Retention</span>
        <span class={s.factValue}>{retentionLabels[props.retention]}</span>
      </div>
    </div>
  );
}
