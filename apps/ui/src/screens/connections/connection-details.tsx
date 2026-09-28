import { For, Show, createUniqueId } from "solid-js";
import { IconMarkConnections } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { calendarDate } from "../../internal/when.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  ConnectionsAlert,
  SetupStatus,
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

export interface ConnectionDetailsProps {
  readonly workspaceName: string;
  readonly connection: ConnectionSummary;
  readonly onClose: () => void;
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
 * A connection in the side panel: its provider and setup, its name and settings as separate
 * saves, and its key, which is only ever replaced or removed, never shown. A reader who may not
 * manage it sees the same details without the actions. On phones it fills the screen.
 */
export function ConnectionDetails(props: ConnectionDetailsProps) {
  const nameForm = `connection-name-${createUniqueId()}`;
  const settingsForm = `connection-settings-${createUniqueId()}`;
  const manageable = () => props.connection.manageable;
  const available = () => props.connection.setup !== "unavailable";
  const busy = () => props.pending !== undefined;
  const failureOf = (...actions: ReadonlyArray<ConnectionsAction | "refresh">) => {
    const failure = props.failure;
    return failure && actions.includes(failure.action) ? failure : undefined;
  };
  const alert = (...actions: ReadonlyArray<ConnectionsAction | "refresh">) => (
    <Show when={failureOf(...actions)}>
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
    <Shell.Aside aria-label="Connection details" onClose={() => props.onClose()}>
      <Pane.Root variant="side">
        <Pane.Header>
          <Pane.Back onClick={() => props.onClose()}>Connections</Pane.Back>
          <Pane.Title>Connection details</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close connection details" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.details}>
            <div class={s.identity}>
              <div class={s.identityRow}>
                <span class={s.identityTile} aria-hidden="true">
                  <IconMarkConnections class={s.identityIcon} />
                </span>
                <div class={s.identityText}>
                  <h3 class={s.identityName}>{props.connection.name}</h3>
                  <span class={s.identityDetail}>{providerLine(props.connection)}</span>
                </div>
              </div>
              <div class={s.status}>
                <SetupStatus setup={props.connection.setup} />
                <p class={s.note}>{setupNote(props.connection)}</p>
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
                <Button type="submit" class={s.end} disabled={!props.nameChanged || busy()}>
                  Save name
                </Button>
              </Show>
            </form>
            <Show when={props.connection.settings.length > 0}>
              <form
                id={settingsForm}
                class={s.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (props.settingsChanged && !busy()) props.onSaveSettings();
                }}
              >
                <For each={props.connection.settings}>
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
                    class={s.end}
                    disabled={!available() || !props.settingsChanged || busy()}
                  >
                    Save settings
                  </Button>
                </Show>
              </form>
            </Show>
            <section class={s.section} aria-label="Authentication">
              <div class={s.heading}>
                <h4 class={s.headingText}>Authentication</h4>
                <Divider class={s.headingStitch} />
              </div>
              <Show
                when={props.connection.method === "api-key"}
                fallback={
                  <div class={s.credential}>
                    <p class={s.credentialTitle}>No authentication</p>
                    <p class={s.note}>Requests to this provider carry no credentials.</p>
                  </div>
                }
              >
                <div class={s.credential}>
                  <p class={s.credentialTitle}>
                    {props.connection.keySaved ? "API key saved" : "API key needed"}
                  </p>
                  <p class={s.note}>
                    {props.connection.keySaved
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
                          {props.connection.keySaved ? "Replace key" : "Add API key"}
                        </Button>
                      )}
                    </Show>
                    <Show when={props.connection.keySaved && props.onRemoveKey}>
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
            <p class={s.note}>
              Created by {props.connection.createdBy} · {calendarDate(props.connection.createdAt)}
            </p>
          </div>
        </Pane.Body>
        <Show when={manageable() && props.onRemove}>
          {(remove) => (
            <div class={s.danger}>
              <Button variant="quiet" disabled={busy()} onClick={() => remove()()}>
                Remove connection
              </Button>
            </div>
          )}
        </Show>
      </Pane.Root>
    </Shell.Aside>
  );
}
