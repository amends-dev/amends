import { For, Match, Show, Switch, createUniqueId } from "solid-js";
import { IconMarkEnvironments } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
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
  type EnvironmentIssue,
  type EnvironmentProblem,
  type EnvironmentSummary,
  type EnvironmentsAction,
  type EnvironmentsError,
} from "./wording.tsx";
import * as s from "./environments.css.ts";

export type EnvironmentTab = "overview" | "sandbox";

export interface EnvironmentPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  /** The environment, once it has loaded. */
  readonly environment?: EnvironmentSummary;
  /** In place of the page, while it loads or when it cannot show. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** Opens the full list of environments, from one that is gone. */
  readonly onBrowse?: () => void;
  readonly tab: EnvironmentTab;
  readonly tabHref: (tab: EnvironmentTab) => string;
  /** Switches tabs in place of following their links. */
  readonly onTabChange?: (tab: EnvironmentTab) => void;
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
 * An environment's page in the main content. Overview reads in one column: its readiness, its
 * name, its runtime, which is fixed once created, its details, and removal. Sandbox holds its
 * sandbox settings, saved together from the bar under them; an environment without a sandbox has
 * no Sandbox tab. A reader who may not manage it sees the same values without inputs or actions.
 */
export function EnvironmentPane(props: EnvironmentPaneProps) {
  const nameForm = `environment-name-${createUniqueId()}`;
  const sandboxForm = `environment-sandbox-${createUniqueId()}`;
  const manageable = () => props.environment?.manageable ?? false;
  const busy = () => props.pending !== undefined;
  const sandboxTab = () => props.environment?.sandbox !== undefined && props.tab === "sandbox";
  const openTab = (tab: EnvironmentTab) => (event: MouseEvent) => {
    if (!props.onTabChange) return;
    event.preventDefault();
    props.onTabChange(tab);
  };
  const failureOf = (...actions: ReadonlyArray<EnvironmentsAction | "refresh">) => {
    const failure = props.failure;
    return failure && actions.includes(failure.action) ? failure : undefined;
  };
  const alert = (environment: EnvironmentSummary, action: EnvironmentsAction | "refresh") => (
    <Show when={failureOf(action)}>
      {(failure) => (
        <EnvironmentsAlert
          action={failure().action}
          error={failure().error}
          problems={failure().problems.filter(
            (problem) => !(failure().action === "configure" && sandboxProblem(problem)),
          )}
          provider={providerName(environment)}
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
        ? { label: "Choose account", run: () => props.onTabChange?.("sandbox") }
        : undefined;
    return props.onOpenAccount && { label: "Open connection", run: props.onOpenAccount };
  };
  return (
    <Pane.Root class={s.pane}>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkEnvironments} context={props.workspaceName}>
          {props.environment?.name ?? "Environment"}
        </Pane.Title>
        <Show when={props.environment}>
          {(environment) => (
            <Pane.Tabs>
              <Tabs.List aria-label="Environment">
                <Tabs.Tab
                  href={props.tabHref("overview")}
                  current={!sandboxTab()}
                  onClick={openTab("overview")}
                >
                  Overview
                </Tabs.Tab>
                <Show when={environment().sandbox}>
                  <Tabs.Tab
                    href={props.tabHref("sandbox")}
                    current={sandboxTab()}
                    onClick={openTab("sandbox")}
                  >
                    Sandbox
                  </Tabs.Tab>
                </Show>
              </Tabs.List>
            </Pane.Tabs>
          )}
        </Show>
      </Pane.Header>
      <Switch>
        <Match when={props.status === "loading"}>
          <Pane.Body>
            <p class={s.visuallyHidden} role="status">
              Loading environment…
            </p>
          </Pane.Body>
        </Match>
        <Match when={props.status === "unavailable"}>
          <Pane.Body>
            <EmptyState
              art="held-back"
              title="Environments aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState
              art="came-apart"
              title="Couldn’t load environments"
              lines={["Try again once the host is reachable."]}
            >
              <Show when={props.onRetry}>
                {(retry) => <Button onClick={() => retry()()}>Retry</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={!props.environment}>
          <Pane.Body>
            <EmptyState
              art="lost-thread"
              title="This environment isn’t here"
              lines={["It may have been removed, or you can no longer see it."]}
            >
              <Show when={props.onBrowse}>
                {(browse) => <Button onClick={() => browse()()}>Show all environments</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={sandboxTab() && props.environment}>
          {(environment) => {
            const sandbox = () => environment().sandbox!;
            const editable = () => manageable() && sandbox().provider !== undefined;
            return (
              <>
                <Pane.Body>
                  <Pane.Column>
                    <Show
                      when={editable() && props.sandbox}
                      fallback={
                        <SandboxSummary
                          provider={providerName(environment())}
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
                          {alert(environment(), "configure")}
                        </form>
                      )}
                    </Show>
                  </Pane.Column>
                </Pane.Body>
                <Show when={editable() && props.sandbox}>
                  <Modal.Actions>
                    <Button disabled={busy()} onClick={() => props.onDiscardSandbox()}>
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
              </>
            );
          }}
        </Match>
        <Match when={props.environment}>
          {(environment) => (
            <Pane.Body>
              <Pane.Column>
                <div class={s.status}>
                  <ReadinessStatus issues={environment().issues} />
                  <Show
                    when={environment().issues.length > 0}
                    fallback={<p class={s.note}>Setup is complete.</p>}
                  >
                    <For each={environment().issues}>
                      {(issue) => <p class={s.note}>{issueMessage(issue, environment())}</p>}
                    </For>
                  </Show>
                  <Show when={recovery(environment().issues[0])}>
                    {(action) => (
                      <Button class={s.start} disabled={busy()} onClick={() => action().run()}>
                        {action().label}
                      </Button>
                    )}
                  </Show>
                  {alert(environment(), "refresh")}
                  {alert(environment(), "remove")}
                </div>
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
                  {alert(environment(), "rename")}
                  <Show when={manageable()}>
                    <Button type="submit" class={s.start} disabled={!props.nameChanged || busy()}>
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
                        {environment().harness?.name ?? environment().harnessId}
                      </dd>
                    </div>
                    <div class={s.runtimeRow}>
                      <dt class={s.runtimeLabel}>Sandbox</dt>
                      <dd class={s.runtimeValue}>
                        {environment().sandbox ? providerName(environment()) : "No sandbox"}
                      </dd>
                    </div>
                    <div class={s.runtimeRow}>
                      <dt class={s.runtimeLabel}>Harness runs</dt>
                      <dd class={s.runtimeValue}>
                        {placementLabels[environment().sandbox?.placement ?? "in-process"]}
                      </dd>
                    </div>
                  </dl>
                  <p class={s.note}>Harness and sandbox choice are fixed after creation.</p>
                </section>
                <section class={s.section} aria-label="Details">
                  <SectionHeading>Details</SectionHeading>
                  <dl class={s.detailList}>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Created by</dt>
                      <dd class={s.detailValue}>
                        {environment().createdBy === undefined
                          ? "Created with this workspace"
                          : `${environment().createdBy} · ${calendarDate(environment().createdAt)}`}
                      </dd>
                    </div>
                  </dl>
                </section>
                <Show when={manageable() && props.onRemove}>
                  {(remove) => (
                    <section class={s.section} aria-label="Removal">
                      <SectionHeading>Removal</SectionHeading>
                      <p class={s.note}>
                        Removing this environment makes it unavailable in the workspace. Its record
                        stays in history.
                      </p>
                      <Button class={s.start} disabled={busy()} onClick={() => remove()()}>
                        Remove environment
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

/** Problems the sandbox fields show beside the field they concern. */
export const sandboxProblem = (problem: EnvironmentProblem) =>
  problem.startsWith("connection-") || problem === "template-not-allowed";
