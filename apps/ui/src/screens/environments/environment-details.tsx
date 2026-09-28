import { For, Show, createUniqueId } from "solid-js";
import { IconMarkEnvironments } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { calendarDate } from "../../internal/when.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  SandboxFields,
  SandboxSummary,
  SectionHeading,
  type SandboxFieldsProps,
} from "./sandbox-fields.tsx";
import {
  EnvironmentsAlert,
  ReadinessStatus,
  issueMessage,
  placementLabels,
  providerName,
  runtimeLine,
  type EnvironmentIssue,
  type EnvironmentProblem,
  type EnvironmentSummary,
  type EnvironmentsAction,
  type EnvironmentsError,
} from "./wording.tsx";
import * as s from "./environments.css.ts";

export type EnvironmentDetailsTab = "overview" | "sandbox";

export interface EnvironmentDetailsProps {
  readonly environment: EnvironmentSummary;
  readonly onClose: () => void;
  readonly tab: EnvironmentDetailsTab;
  readonly onTabChange: (tab: EnvironmentDetailsTab) => void;
  /** The name being edited. */
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** The name differs from the saved one and can be saved. */
  readonly nameChanged: boolean;
  readonly onSaveName: () => void;
  /**
   * The sandbox settings being edited, for a reader who may change them; the provider comes from
   * the environment. Absent when its provider is no longer installed.
   */
  readonly sandbox?: Omit<SandboxFieldsProps, "provider" | "problems" | "disabled">;
  /** The sandbox settings differ from the saved ones and can be saved. */
  readonly sandboxChanged: boolean;
  readonly onSaveSandbox: () => void;
  /** Sets aside unsaved sandbox settings. */
  readonly onDiscardSandbox: () => void;
  /** Opens the account connection, such as to add its key. */
  readonly onOpenAccount?: () => void;
  /** Asks to remove the environment. */
  readonly onRemove?: () => void;
  /** The change running, if any. */
  readonly pending?: EnvironmentsAction | "refresh";
  /** A failed change made here, or a read that failed. */
  readonly failure?: {
    readonly action: EnvironmentsAction | "refresh";
    readonly error: EnvironmentsError;
    readonly problems: readonly EnvironmentProblem[];
  };
  readonly onRefresh?: () => void;
}

/**
 * An environment in the side panel. Overview shows its readiness, its name, and its runtime, which
 * is fixed once created; Sandbox holds its sandbox settings, saved together. A reader who may not
 * manage it sees the same values without inputs or actions. On phones it fills the screen.
 */
export function EnvironmentDetails(props: EnvironmentDetailsProps) {
  const nameForm = `environment-name-${createUniqueId()}`;
  const sandboxForm = `environment-sandbox-${createUniqueId()}`;
  const manageable = () => props.environment.manageable;
  const busy = () => props.pending !== undefined;
  const sandboxTab = () => props.environment.sandbox !== undefined && props.tab === "sandbox";
  const failureOf = (...actions: ReadonlyArray<EnvironmentsAction | "refresh">) => {
    const failure = props.failure;
    return failure && actions.includes(failure.action) ? failure : undefined;
  };
  const alert = (...actions: ReadonlyArray<EnvironmentsAction | "refresh">) => (
    <Show when={failureOf(...actions)}>
      {(failure) => (
        <EnvironmentsAlert
          action={failure().action}
          error={failure().error}
          problems={failure().problems.filter(
            (problem) => !(failure().action === "configure" && sandboxProblem(problem)),
          )}
          provider={providerName(props.environment)}
          onRefresh={props.onRefresh}
          refreshing={props.pending === "refresh"}
        />
      )}
    </Show>
  );
  /** What brings the first issue back: reloading, choosing an account, or adding its key. */
  const recovery = (issue: EnvironmentIssue | undefined) => {
    if (issue === undefined) return undefined;
    if (issue === "harness-unavailable" || issue === "sandbox-unavailable")
      return props.onRefresh && { label: "Refresh", run: props.onRefresh };
    if (issue === "connection-unavailable")
      return manageable()
        ? { label: "Choose account", run: () => props.onTabChange("sandbox") }
        : undefined;
    return props.onOpenAccount && { label: "Open connection", run: props.onOpenAccount };
  };
  return (
    <Shell.Aside aria-label="Environment details" onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back onClick={() => props.onClose()}>Environments</Pane.Back>
          <Pane.Title>Environment details</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close environment details" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Tabs>
            <Tabs.List aria-label="Environment details">
              <Tabs.Tab current={!sandboxTab()} onClick={() => props.onTabChange("overview")}>
                Overview
              </Tabs.Tab>
              <Show when={props.environment.sandbox}>
                <Tabs.Tab current={sandboxTab()} onClick={() => props.onTabChange("sandbox")}>
                  Sandbox
                </Tabs.Tab>
              </Show>
            </Tabs.List>
          </Pane.Tabs>
        </Pane.Header>
        <Pane.Body>
          <Show
            when={sandboxTab() && props.environment.sandbox}
            fallback={
              <div class={s.details}>
                <div class={s.identity}>
                  <div class={s.identityRow}>
                    <span class={s.identityTile} aria-hidden="true">
                      <IconMarkEnvironments class={s.identityIcon} />
                    </span>
                    <div class={s.identityText}>
                      <h3 class={s.identityName}>{props.environment.name}</h3>
                      <span class={s.identityDetail}>{runtimeLine(props.environment)}</span>
                    </div>
                  </div>
                  <div class={s.status}>
                    <ReadinessStatus issues={props.environment.issues} />
                    <Show
                      when={props.environment.issues.length > 0}
                      fallback={<p class={s.note}>Setup is complete.</p>}
                    >
                      <For each={props.environment.issues}>
                        {(issue) => <p class={s.note}>{issueMessage(issue, props.environment)}</p>}
                      </For>
                    </Show>
                    <Show when={recovery(props.environment.issues[0])}>
                      {(action) => (
                        <Button class={s.start} disabled={busy()} onClick={() => action().run()}>
                          {action().label}
                        </Button>
                      )}
                    </Show>
                  </div>
                </div>
                {alert("refresh", "remove")}
                <form
                  id={nameForm}
                  class={s.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (props.nameChanged && !busy()) props.onSaveName();
                  }}
                >
                  <Field.Root>
                    <Field.Label>Environment name</Field.Label>
                    <Input
                      value={props.name}
                      onInput={(event) => props.onNameChange(event.currentTarget.value)}
                      maxLength={80}
                      disabled={!manageable() || busy()}
                      required
                    />
                  </Field.Root>
                  {alert("rename")}
                  <Show when={manageable()}>
                    <Button type="submit" class={s.end} disabled={!props.nameChanged || busy()}>
                      Save name
                    </Button>
                  </Show>
                </form>
                <section class={s.section} aria-label="Runtime">
                  <SectionHeading>Runtime</SectionHeading>
                  <dl class={s.runtime}>
                    <div class={s.runtimeRow}>
                      <dt class={s.runtimeLabel}>Harness</dt>
                      <dd class={s.runtimeValue}>
                        {props.environment.harness?.name ?? props.environment.harnessId}
                      </dd>
                    </div>
                    <div class={s.runtimeRow}>
                      <dt class={s.runtimeLabel}>Sandbox</dt>
                      <dd class={s.runtimeValue}>
                        {props.environment.sandbox ? providerName(props.environment) : "No sandbox"}
                      </dd>
                    </div>
                    <div class={s.runtimeRow}>
                      <dt class={s.runtimeLabel}>Harness runs</dt>
                      <dd class={s.runtimeValue}>
                        {placementLabels[props.environment.sandbox?.placement ?? "in-process"]}
                      </dd>
                    </div>
                  </dl>
                  <p class={s.note}>Harness and sandbox choice are fixed after creation.</p>
                </section>
                <section class={s.section} aria-label="Created by">
                  <SectionHeading>Created by</SectionHeading>
                  <p class={s.note}>
                    {props.environment.createdBy === undefined
                      ? "Created with this workspace"
                      : `${props.environment.createdBy} · ${calendarDate(props.environment.createdAt)}`}
                  </p>
                </section>
              </div>
            }
          >
            {(sandbox) => (
              <Show
                when={manageable() && sandbox().provider && props.sandbox}
                fallback={
                  <SandboxSummary
                    provider={providerName(props.environment)}
                    account={
                      sandbox().account
                        ? (sandbox().account?.name ?? "Unavailable connection")
                        : undefined
                    }
                    template={sandbox().template}
                    templateLabel={sandbox().provider?.template?.label}
                    variables={sandbox().variables}
                    commands={sandbox().commands}
                    retention={sandbox().retention}
                  />
                }
              >
                {(editor) => (
                  <form
                    id={sandboxForm}
                    class={s.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (props.sandboxChanged && !busy()) props.onSaveSandbox();
                    }}
                  >
                    <SandboxFields
                      {...editor()}
                      provider={sandbox().provider!}
                      problems={failureOf("configure")?.problems}
                      disabled={busy()}
                    />
                    {alert("configure")}
                  </form>
                )}
              </Show>
            )}
          </Show>
        </Pane.Body>
        <Show
          when={sandboxTab()}
          fallback={
            <Show when={manageable() && props.onRemove}>
              {(remove) => (
                <div class={s.danger}>
                  <Button variant="quiet" disabled={busy()} onClick={() => remove()()}>
                    Remove environment
                  </Button>
                </div>
              )}
            </Show>
          }
        >
          <Show
            when={manageable() && props.environment.sandbox?.provider}
            fallback={
              <Modal.Actions>
                <Button onClick={() => props.onClose()}>Close</Button>
              </Modal.Actions>
            }
          >
            <Modal.Actions>
              <Button class={s.leading} disabled={busy()} onClick={() => props.onDiscardSandbox()}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={sandboxForm}
                variant="primary"
                class={s.primary}
                disabled={!props.sandboxChanged || busy()}
              >
                Save sandbox settings
              </Button>
            </Modal.Actions>
          </Show>
        </Show>
      </Pane.Root>
    </Shell.Aside>
  );
}

/** Problems the sandbox fields show beside the field they concern. */
export const sandboxProblem = (problem: EnvironmentProblem) =>
  problem.startsWith("connection-") || problem === "template-not-allowed";
