import { For, Match, Show, Switch, createUniqueId } from "solid-js";
import { IconMarkConnections } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Notice } from "../../components/notice/index.ts";
import { calendarDate } from "../../internal/when.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  ConnectionsAlert,
  providerLine,
  setupNote,
  type ConnectionSettingField,
  type ConnectionSummary,
  type ConnectionsAction,
  type ConnectionsError,
} from "./wording.tsx";
import * as s from "./connections.css.ts";

/** "API URL · Optional" for a setting the provider does not require. */
export const settingLabel = (setting: ConnectionSettingField) =>
  setting.required ? setting.label : `${setting.label} · Optional`;

export interface ConnectionPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  /** The connection, once it has loaded. */
  readonly connection?: ConnectionSummary;
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
  /** A setting's value being edited, by key. */
  readonly value: (key: string) => string;
  readonly onValueChange: (key: string, value: string) => void;
  /** Why a setting's value would be refused. */
  readonly issue?: (key: string) => "url" | undefined;
  /** The settings differ from the saved ones and can be saved. */
  readonly settingsChanged: boolean;
  readonly onSaveSettings: () => void;
  /** Asks for a key, or a new one in place of the saved key. */
  readonly onSetKey?: () => void;
  /** Asks to remove the saved key. */
  readonly onRemoveKey?: () => void;
  /** Asks to remove the connection. */
  readonly onRemove?: () => void;
  /** The change running, if any. */
  readonly pending?: ConnectionsAction | "refresh";
  /** A failed change made here, or a read that failed. */
  readonly failure?: {
    readonly action: ConnectionsAction | "refresh";
    readonly error: ConnectionsError;
  };
  readonly onRefresh?: () => void;
}

/**
 * A connection's page in the main content, in one column: a notice with what setup still needs
 * when it cannot be used, then its name and settings as separate saves, its key, which is only ever replaced or removed, never shown, its details, and
 * removal. A reader who may not manage it sees the same values without the actions.
 */
export function ConnectionPane(props: ConnectionPaneProps) {
  const nameForm = `connection-name-${createUniqueId()}`;
  const settingsForm = `connection-settings-${createUniqueId()}`;
  const manageable = () => props.connection?.manageable ?? false;
  const available = () => props.connection?.setup !== "unavailable";
  const busy = () => props.pending !== undefined;
  const alert = (action: ConnectionsAction | "refresh") => (
    <Show when={props.failure?.action === action && props.failure}>
      {(failure) => (
        <ConnectionsAlert
          action={failure().action}
          error={failure().error}
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
                <Show when={connection().setup !== "configured"}>
                  <Notice
                    tone={connection().setup === "unavailable" ? "danger" : "caution"}
                    title={setupNote(connection())}
                  />
                </Show>
                {alert("refresh")}
                {alert("remove")}
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
                <Show when={connection().settings.length > 0}>
                  <form
                    id={settingsForm}
                    class={s.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (props.settingsChanged && !busy()) props.onSaveSettings();
                    }}
                  >
                    <For each={connection().settings}>
                      {(setting) => (
                        <Field.Root
                          hint={
                            available()
                              ? setting.description
                              : "Provider settings can be edited when it is available again."
                          }
                          error={
                            props.issue?.(setting.key) === "url"
                              ? "Enter an http or https URL."
                              : undefined
                          }
                        >
                          <Field.Label>
                            {available() ? settingLabel(setting) : `Saved ${setting.label}`}
                          </Field.Label>
                          <Input
                            type={setting.kind === "url" ? "url" : "text"}
                            value={props.value(setting.key)}
                            onInput={(event) =>
                              props.onValueChange(setting.key, event.currentTarget.value)
                            }
                            placeholder={setting.placeholder}
                            autocomplete="off"
                            spellcheck={false}
                            disabled={!manageable() || !available() || busy()}
                            required={setting.required}
                          />
                        </Field.Root>
                      )}
                    </For>
                    {alert("configure")}
                    <Show when={manageable()}>
                      <Button
                        type="submit"
                        class={s.start}
                        disabled={!available() || !props.settingsChanged || busy()}
                      >
                        Save settings
                      </Button>
                    </Show>
                  </form>
                </Show>
                <section class={s.section} aria-label="Authentication">
                  <Heading>Authentication</Heading>
                  <Show
                    when={connection().method === "api-key"}
                    fallback={
                      <div class={s.credential}>
                        <p class={s.credentialTitle}>No authentication</p>
                        <p class={s.note}>Requests to this provider carry no credentials.</p>
                      </div>
                    }
                  >
                    <div class={s.credential}>
                      <p class={s.credentialTitle}>
                        {connection().keySaved ? "API key saved" : "API key needed"}
                      </p>
                      <p class={s.note}>
                        {connection().keySaved
                          ? "The stored key cannot be viewed or copied."
                          : "This connection uses API key authentication."}
                      </p>
                    </div>
                    {alert("clear-key")}
                    <Show when={manageable()}>
                      <div class={s.credentialActions}>
                        <Show when={available() && props.onSetKey}>
                          {(set) => (
                            <Button disabled={busy()} onClick={() => set()()}>
                              {connection().keySaved ? "Replace key" : "Add API key"}
                            </Button>
                          )}
                        </Show>
                        <Show when={connection().keySaved && props.onRemoveKey}>
                          {(remove) => (
                            <Button variant="quiet" disabled={busy()} onClick={() => remove()()}>
                              Remove key
                            </Button>
                          )}
                        </Show>
                      </div>
                    </Show>
                  </Show>
                </section>
                <section class={s.section} aria-label="Details">
                  <Heading>Details</Heading>
                  <dl class={s.detailList}>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Provider</dt>
                      <dd class={s.detailValue}>{providerLine(connection())}</dd>
                    </div>
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
                        {connection().keySaved
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
