import { For, Show, createEffect, createSignal, createUniqueId, on } from "solid-js";
import { IconMarkConnections } from "@amends-dev/icons";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { FormFields, type FormIssue } from "../../components/form-fields/index.ts";
import { Input, SearchField } from "../../components/input/index.ts";
import { Select } from "../../components/select/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import {
  ConnectionsAlert,
  authLabels,
  authOptionsLabel,
  capabilityNouns,
  providesLabel,
  type AuthMethod,
  type ConnectionsFailure,
  type IntegrationCapability,
  type IntegrationOption,
} from "./wording.tsx";
import * as s from "./connections.css.ts";

export interface ChooseIntegrationProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceName: string;
  /** What the new connection should give, when it was asked for from one capability. */
  readonly capability?: IntegrationCapability;
  /** The integrations this host installs that give it. */
  readonly integrations: ReadonlyArray<IntegrationOption>;
  readonly onChoose: (integrationId: string) => void;
}

/**
 * The first step of adding a connection: which installed integration it goes through, narrowed
 * by a search of their names, since a host may install a hundred model providers.
 */
export function ChooseIntegration(props: ChooseIntegrationProps) {
  const [query, setQuery] = createSignal("");
  createEffect(
    on(
      () => props.open,
      () => setQuery(""),
    ),
  );
  const words = () => query().trim().toLowerCase();
  const shown = () =>
    props.integrations.filter(
      (integration) =>
        words() === "" ||
        integration.name.toLowerCase().includes(words()) ||
        integration.id.includes(words()),
    );
  const title = () =>
    props.capability === undefined
      ? "Add connection"
      : `Add ${capabilityNouns[props.capability]} connection`;
  return (
    <Modal.Root open={props.open} onClose={props.onClose} aria-label={title()}>
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>{title()}</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Show
          when={props.integrations.length > 0}
          fallback={
            <Pane.Body>
              <div class={s.lines}>
                <p class={s.title}>No integrations available</p>
                <p class={s.note}>
                  This host installs no integration
                  {props.capability === undefined
                    ? ""
                    : ` that gives ${capabilityNouns[props.capability]}s`}
                  .
                </p>
              </div>
            </Pane.Body>
          }
        >
          <Pane.Toolbar>
            <SearchField
              placeholder="Search integrations…"
              aria-label="Search integrations"
              class={s.chooseSearch}
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              autofocus
            />
          </Pane.Toolbar>
          <Pane.Body>
            <Show
              when={shown().length > 0}
              fallback={
                <div class={s.empty}>
                  <p class={s.emptyText}>No integrations match “{query().trim()}”.</p>
                  <Button variant="quiet" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                </div>
              }
            >
              <ul class={s.integrations} aria-label="Integrations">
                <For each={shown()}>
                  {(integration) => (
                    <li>
                      <button
                        type="button"
                        class={s.integration}
                        onClick={() => props.onChoose(integration.id)}
                      >
                        <span class={s.tile} aria-hidden="true">
                          <IconMarkConnections class={s.tileIcon} />
                        </span>
                        <span class={s.integrationText}>
                          <span class={s.integrationName}>{integration.name}</span>
                          <span class={s.integrationDetail}>
                            {`${providesLabel(integration.provides)} · ${authOptionsLabel(integration.auth)}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Pane.Body>
        </Show>
        <Modal.Actions>
          <Button onClick={() => props.onClose()}>Cancel</Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface ConfigureConnectionProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Returns to the integrations. */
  readonly onBack: () => void;
  readonly integration: IntegrationOption;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** A setting's value as its field shows it. */
  readonly value: (key: string) => string;
  readonly onValueChange: (key: string, value: string) => void;
  /** Why a setting's value would be refused, once it has one. */
  readonly issue?: (key: string) => FormIssue | undefined;
  readonly auth: AuthMethod;
  readonly onAuthChange: (auth: AuthMethod) => void;
  /** The key being entered, for API key authentication. */
  readonly apiKey: string;
  readonly onApiKeyChange: (apiKey: string) => void;
  /** The draft has a name, every required, well-formed setting, and its key. */
  readonly ready: boolean;
  readonly onCreate: () => void;
  readonly pending?: boolean;
  /** Why creating failed; the draft stays and retrying does not create it twice. */
  readonly failure?: ConnectionsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/**
 * The second step: the connection's name, the settings its integration's form asks for, how it
 * authenticates, and its key, all created together. Closing discards the key that was typed.
 */
export function ConfigureConnection(props: ConfigureConnectionProps) {
  const formId = `configure-connection-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Configure connection" size="form">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Configure connection</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>
            {`${props.integration.name} · ${providesLabel(props.integration.provides)}`}
          </Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.ready && !busy()) props.onCreate();
            }}
          >
            <Field.Root hint="A name your workspace will recognize.">
              <Field.Label>Connection name</Field.Label>
              <Input
                value={props.name}
                onInput={(event) => props.onNameChange(event.currentTarget.value)}
                maxLength={80}
                autocomplete="off"
                disabled={busy()}
                autofocus
                required
              />
            </Field.Root>
            <FormFields
              fields={props.integration.fields}
              value={props.value}
              onChange={props.onValueChange}
              issue={props.issue}
              disabled={busy()}
            />
            <Show
              when={props.integration.auth.length > 1}
              fallback={
                <div class={s.lines}>
                  <p class={s.title}>{authLabels[props.auth]}</p>
                  <p class={s.note}>
                    {props.auth === "apiKey"
                      ? `${props.integration.name} takes an API key.`
                      : "Requests through this connection carry no credentials."}
                  </p>
                </div>
              }
            >
              <Field.Root
                hint={
                  props.auth === "none"
                    ? "Use this only when the system accepts requests without credentials."
                    : undefined
                }
              >
                <Field.Label>Authentication</Field.Label>
                <Select
                  options={props.integration.auth.map((method) => ({
                    value: method,
                    label: authLabels[method],
                  }))}
                  value={props.auth}
                  onChange={(value) => props.onAuthChange(value as AuthMethod)}
                  disabled={busy()}
                />
              </Field.Root>
            </Show>
            <Show when={props.auth === "apiKey"}>
              <Field.Root hint="Stored securely. Once saved, it cannot be viewed or copied.">
                <Field.Label>API key</Field.Label>
                <Input
                  type="password"
                  value={props.apiKey}
                  onInput={(event) => props.onApiKeyChange(event.currentTarget.value)}
                  autocomplete="off"
                  spellcheck={false}
                  disabled={busy()}
                  required
                />
              </Field.Root>
            </Show>
            <Show when={props.failure}>
              {(failure) => (
                <ConnectionsAlert
                  failure={failure()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button class={s.leading} onClick={() => props.onBack()} disabled={busy()}>
            Back
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            class={s.primary}
            disabled={!props.ready || busy()}
          >
            Create connection
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface ReplaceKeyProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The connection, by name. */
  readonly name: string;
  readonly apiKey: string;
  readonly onApiKeyChange: (apiKey: string) => void;
  readonly onSave: () => void;
  readonly pending?: boolean;
  /** Why saving failed; the connection keeps its earlier key. */
  readonly failure?: ConnectionsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/**
 * Entering a new key, masked, in place of the saved one, which stays until the new one is saved.
 * Closing discards what was typed.
 */
export function ReplaceKey(props: ReplaceKeyProps) {
  const formId = `replace-key-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Replace API key" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Replace API key</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.name}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.apiKey.trim() && !busy()) props.onSave();
            }}
          >
            <p class={s.intro}>The current key stays in place until the new key is saved.</p>
            <Field.Root hint="Stored securely. Once saved, it cannot be viewed or copied.">
              <Field.Label>New API key</Field.Label>
              <Input
                type="password"
                value={props.apiKey}
                onInput={(event) => props.onApiKeyChange(event.currentTarget.value)}
                autocomplete="off"
                spellcheck={false}
                disabled={busy()}
                autofocus
                required
              />
            </Field.Root>
            <Show when={props.failure}>
              {(failure) => (
                <ConnectionsAlert
                  failure={failure()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button class={s.leading} onClick={close} disabled={busy()}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            class={s.primary}
            disabled={!props.apiKey.trim() || busy()}
          >
            Replace key
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface ConfirmRemoveConnectionProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly name: string;
  /** It has a saved key, which is deleted with it. */
  readonly keySaved: boolean;
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly failure?: ConnectionsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms removing a connection and deleting its key. */
export function ConfirmRemoveConnection(props: ConfirmRemoveConnectionProps) {
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Remove connection?" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Remove connection?</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.name}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.stack}>
            <p class={s.confirm}>
              {props.keySaved
                ? `${props.name} will be removed from the workspace, along with its saved key.`
                : `${props.name} will be removed from the workspace.`}
            </p>
            <Show when={props.failure}>
              {(failure) => (
                <ConnectionsAlert
                  failure={failure()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </div>
        </Pane.Body>
        <Modal.Actions>
          <Button class={s.leading} onClick={close} disabled={busy()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            class={s.primary}
            disabled={busy()}
            onClick={() => props.onConfirm()}
          >
            Remove connection
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
