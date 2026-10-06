import { For, Match, Show, Switch, createUniqueId } from "solid-js";
import { IconMarkConnections } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Field } from "../../components/field/index.ts";
import { FormFields, type FormIssue } from "../../components/form-fields/index.ts";
import { Input } from "../../components/input/index.ts";
import { Notice } from "../../components/notice/index.ts";
import { StatusMark, type StatusMarkKind } from "../../components/status-mark/index.ts";
import { calendarDate } from "../../internal/when.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  ConnectionsV2Alert,
  healthWording,
  providesLabel,
  type ConnectionV2Health,
  type ConnectionV2Summary,
  type ConnectionsV2Action,
  type ConnectionsV2Failure,
} from "./wording.tsx";
import * as s from "./connections-v2.css.ts";

const healthMarks = {
  healthy: "available",
  unauthorized: "blocked",
  misconfigured: "blocked",
  unavailable: "attention",
} as const satisfies Record<ConnectionV2Health["status"], StatusMarkKind>;

export interface ConnectionV2PaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  /** The connection, once it has loaded. */
  readonly connection?: ConnectionV2Summary;
  /** In place of the page, while it loads or when it cannot show. */
  readonly status?: "loading" | "failed" | "unavailable";
  readonly onRetry?: () => void;
  /** Opens the full list of connections, from one that is gone. */
  readonly onBrowse?: () => void;
  /** The name being edited. */
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** The name differs from the saved one and can be saved. */
  readonly nameChanged: boolean;
  readonly onSaveName: () => void;
  /** A setting's value being edited, by key, as its field shows it. */
  readonly value: (key: string) => string;
  readonly onValueChange: (key: string, value: string) => void;
  /** Why a setting's value would be refused. */
  readonly issue?: (key: string) => FormIssue | undefined;
  /** The settings differ from the saved ones and can be saved. */
  readonly settingsChanged: boolean;
  readonly onSaveSettings: () => void;
  /** Asks for a new key in place of the saved one. */
  readonly onReplaceKey?: () => void;
  /** Asks the connection's system whether it works as set up. */
  readonly onCheck?: () => void;
  /** What the last check found, until the page closes. */
  readonly health?: ConnectionV2Health;
  /** Asks to remove the connection. */
  readonly onRemove?: () => void;
  /** The change or check running, if any. */
  readonly pending?: ConnectionsV2Action | "refresh";
  /** A failed change made here, or a read that failed. */
  readonly failure?: ConnectionsV2Failure;
  readonly onRefresh?: () => void;
}

/**
 * A connection's page in the main content, in one column: a notice when it cannot be used, a
 * check of whether it works, its name and settings as separate saves, how it authenticates, its
 * details, and removal. Its key is only ever replaced, never shown. A reader who may not manage
 * it sees the same values without the actions; one whose integration is gone can only remove it.
 */
export function ConnectionV2Pane(props: ConnectionV2PaneProps) {
  const nameForm = `connection-name-${createUniqueId()}`;
  const settingsForm = `connection-settings-${createUniqueId()}`;
  const manageable = () => props.connection?.manageable ?? false;
  const installed = () => props.connection?.integration !== undefined;
  const busy = () => props.pending !== undefined;
  /** Why its integration refuses its setup, while it does. */
  const refusal = () => {
    const readiness = props.connection?.readiness;
    return readiness?.state === "invalid" ? readiness.description : undefined;
  };
  const alert = (action: ConnectionsV2Action | "refresh") => (
    <Show when={props.failure?.action === action && props.failure}>
      {(failure) => (
        <ConnectionsV2Alert
          failure={failure()}
          onRefresh={props.onRefresh}
          refreshing={props.pending === "refresh"}
        />
      )}
    </Show>
  );
  return (
    <Pane.Root class={s.pane}>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkConnections} context={props.workspaceName}>
          {props.connection?.name ?? "Connection"}
        </Pane.Title>
      </Pane.Header>
      <Switch>
        <Match when={props.status === "loading"}>
          <Pane.Body>
            <p class={s.visuallyHidden} role="status">
              Loading connection…
            </p>
          </Pane.Body>
        </Match>
        <Match when={props.status === "unavailable"}>
          <Pane.Body>
            <EmptyState
              art="held-back"
              title="Connections aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState
              art="came-apart"
              title="Couldn’t load connections"
              lines={["Try again once the host is reachable."]}
            >
              <Show when={props.onRetry}>
                {(retry) => <Button onClick={() => retry()()}>Retry</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={!props.connection}>
          <Pane.Body>
            <EmptyState
              art="lost-thread"
              title="This connection isn’t here"
              lines={["It may have been removed, or you can no longer see it."]}
            >
              <Show when={props.onBrowse}>
                {(browse) => <Button onClick={() => browse()()}>Show all connections</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={props.connection}>
          {(connection) => (
            <Pane.Body>
              <Pane.Column>
                <Switch>
                  <Match when={connection().readiness.state === "uninstalled"}>
                    <Notice tone="danger" title="Its integration isn’t installed on this host">
                      Nothing can use this connection. Its settings stay until it is removed.
                    </Notice>
                  </Match>
                  <Match when={refusal()}>
                    {(description) => (
                      <Notice
                        title={`${connection().integration?.name ?? "Its integration"} refuses this setup`}
                      >
                        {description()}
                      </Notice>
                    )}
                  </Match>
                </Switch>
                {alert("refresh")}
                {alert("remove")}
                <Show when={manageable() && connection().readiness.state === "ready"}>
                  <section class={s.section} aria-label="Check">
                    <Heading>Check</Heading>
                    <div role="status">
                      <Switch
                        fallback={
                          <p class={s.note}>
                            Ask {connection().integration?.name} whether this connection works as it
                            is set up.
                          </p>
                        }
                      >
                        <Match when={props.pending === "check"}>
                          <p class={s.note}>Checking with {connection().integration?.name}…</p>
                        </Match>
                        <Match when={props.health}>
                          {(health) => (
                            <div class={s.health}>
                              <StatusMark
                                mark={healthMarks[health().status]}
                                class={s.healthMark}
                              />
                              <p class={s.title}>{healthWording[health().status].title}</p>
                              <p class={s.healthLine}>
                                {health().description ?? healthWording[health().status].line}
                              </p>
                            </div>
                          )}
                        </Match>
                      </Switch>
                    </div>
                    {alert("check")}
                    <Show when={props.onCheck}>
                      {(check) => (
                        <Button class={s.start} disabled={busy()} onClick={() => check()()}>
                          {props.health ? "Check again" : "Check connection"}
                        </Button>
                      )}
                    </Show>
                  </section>
                </Show>
                <form
                  id={nameForm}
                  class={s.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (props.nameChanged && !busy()) props.onSaveName();
                  }}
                >
                  <Field.Root>
                    <Field.Label>Connection name</Field.Label>
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
                    <Button type="submit" class={s.start} disabled={!props.nameChanged || busy()}>
                      Save name
                    </Button>
                  </Show>
                </form>
                <Show
                  when={installed() && connection().fields.length > 0}
                  fallback={
                    <Show when={!installed() && Object.keys(connection().settings).length > 0}>
                      <section class={s.section} aria-label="Saved settings">
                        <Heading>Saved settings</Heading>
                        <dl class={s.detailList}>
                          <For each={Object.entries(connection().settings)}>
                            {([key, value]) => (
                              <div class={s.detail}>
                                <dt class={s.detailName}>{key}</dt>
                                <dd class={s.detailValue}>{value}</dd>
                              </div>
                            )}
                          </For>
                        </dl>
                      </section>
                    </Show>
                  }
                >
                  <form
                    id={settingsForm}
                    class={s.form}
                    aria-label="Settings"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (props.settingsChanged && !busy()) props.onSaveSettings();
                    }}
                  >
                    <FormFields
                      fields={connection().fields}
                      value={props.value}
                      onChange={props.onValueChange}
                      issue={props.issue}
                      disabled={!manageable() || busy()}
                    />
                    {alert("configure")}
                    <Show when={manageable()}>
                      <Button
                        type="submit"
                        class={s.start}
                        disabled={!props.settingsChanged || busy()}
                      >
                        Save settings
                      </Button>
                    </Show>
                  </form>
                </Show>
                <section class={s.section} aria-label="Authentication">
                  <Heading>Authentication</Heading>
                  <Show
                    when={connection().auth === "apiKey"}
                    fallback={
                      <div class={s.lines}>
                        <p class={s.title}>No authentication</p>
                        <p class={s.note}>Requests through this connection carry no credentials.</p>
                      </div>
                    }
                  >
                    <div class={s.lines}>
                      <p class={s.title}>API key saved</p>
                      <p class={s.note}>The stored key cannot be viewed or copied.</p>
                    </div>
                    {alert("replace-key")}
                    <Show when={manageable() && installed() && props.onReplaceKey}>
                      {(replace) => (
                        <div class={s.actions}>
                          <Button disabled={busy()} onClick={() => replace()()}>
                            Replace key
                          </Button>
                        </div>
                      )}
                    </Show>
                  </Show>
                </section>
                <section class={s.section} aria-label="Details">
                  <Heading>Details</Heading>
                  <dl class={s.detailList}>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Integration</dt>
                      <dd class={s.detailValue}>
                        <Show
                          when={connection().integration}
                          fallback={`${connection().integrationId} · Not installed`}
                        >
                          {(integration) => (
                            <>
                              {integration().name}
                              <Show when={integration().docs}>
                                {(docs) => (
                                  <>
                                    {" · "}
                                    <a
                                      class={s.link}
                                      href={docs()}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Documentation
                                    </a>
                                  </>
                                )}
                              </Show>
                            </>
                          )}
                        </Show>
                      </dd>
                    </div>
                    <Show when={connection().integration}>
                      {(integration) => (
                        <div class={s.detail}>
                          <dt class={s.detailName}>Gives</dt>
                          <dd class={s.detailValue}>{providesLabel(integration().provides)}</dd>
                        </div>
                      )}
                    </Show>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Created by</dt>
                      <dd class={s.detailValue}>
                        {`${connection().createdBy} · ${calendarDate(connection().createdAt)}`}
                      </dd>
                    </div>
                  </dl>
                </section>
                <Show when={manageable() && props.onRemove}>
                  {(remove) => (
                    <section class={s.section} aria-label="Removal">
                      <Heading>Removal</Heading>
                      <p class={s.note}>
                        {connection().auth === "apiKey"
                          ? "Removing this connection removes it from the workspace, along with its saved key."
                          : "Removing this connection removes it from the workspace."}
                      </p>
                      <Button class={s.start} disabled={busy()} onClick={() => remove()()}>
                        Remove connection
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

function Heading(props: { readonly children: string }) {
  return (
    <div class={s.heading}>
      <h4 class={s.headingText}>{props.children}</h4>
      <Divider class={s.headingStitch} />
    </div>
  );
}
