import { For, Show, createUniqueId } from "solid-js";
import { IconMarkConnections, IconMarkForward } from "@amends/icons";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Notice } from "../../components/notice/index.ts";
import { Select } from "../../components/select/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { settingLabel } from "./connection-details.tsx";
import {
  ConnectionsAlert,
  connectionsMessage,
  methodLabels,
  methodsLabel,
  type ConnectionMethod,
  type ConnectionProviderOption,
  type ConnectionsError,
} from "./wording.tsx";
import * as s from "./connections.css.ts";

export interface ChooseProviderProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceName: string;
  /** The providers this server installed. */
  readonly providers: readonly ConnectionProviderOption[];
  readonly onChoose: (providerId: string) => void;
}

/** The first step of adding a connection: which installed provider it goes through. */
export function ChooseProvider(props: ChooseProviderProps) {
  return (
    <Modal.Root
      open={props.open}
      onClose={props.onClose}
      aria-label="Add connection"
      size="compact"
    >
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Add connection</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <Show
            when={props.providers.length > 0}
            fallback={
              <div class={s.stack}>
                <p class={s.credentialTitle}>No providers available</p>
                <p class={s.note}>
                  Ask an administrator to add a connection provider to this server.
                </p>
              </div>
            }
          >
            <div class={s.stack}>
              <p class={s.intro}>Choose what to connect.</p>
              <ul class={s.providers} aria-label="Providers">
                <For each={props.providers}>
                  {(provider) => (
                    <li>
                      <button
                        type="button"
                        class={s.provider}
                        onClick={() => props.onChoose(provider.id)}
                      >
                        <span class={s.tile} aria-hidden="true">
                          <IconMarkConnections class={s.tileIcon} />
                        </span>
                        <span class={s.providerText}>
                          <span class={s.providerName}>{provider.name}</span>
                          <span class={s.providerDescription}>{provider.description}</span>
                          <span class={s.providerMethods}>{methodsLabel(provider.methods)}</span>
                        </span>
                        <IconMarkForward class={s.providerArrow} />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
        </Pane.Body>
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
  /** Returns to the providers. */
  readonly onBack: () => void;
  readonly provider: ConnectionProviderOption;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly value: (key: string) => string;
  readonly onValueChange: (key: string, value: string) => void;
  /** Why a setting's value would be refused, once it has one. */
  readonly issue?: (key: string) => "url" | undefined;
  readonly method: ConnectionMethod;
  readonly onMethodChange: (method: ConnectionMethod) => void;
  /** The draft has a name and every required, well-formed setting. */
  readonly ready: boolean;
  readonly onCreate: () => void;
  readonly pending?: boolean;
  /** Why creating failed; the draft stays and retrying does not create it twice. */
  readonly error?: ConnectionsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  /**
   * The environment this connection is being created for, which the flow returns to: the dialog
   * is titled for creating the provider's connection and leads back to it.
   */
  readonly returnTo?: string;
}

/**
 * The second step: the connection's name, the settings its provider declares, and how it
 * authenticates. A key, when it takes one, is added next, so the connection exists first.
 */
export function ConfigureConnection(props: ConfigureConnectionProps) {
  const formId = `configure-connection-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  const keyed = () => props.method === "api-key";
  return (
    <Modal.Root
      open={props.open}
      onClose={close}
      aria-label={
        props.returnTo === undefined
          ? "Configure connection"
          : `Create ${props.provider.name} connection`
      }
      size="compact"
    >
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>
            {props.returnTo === undefined
              ? "Configure connection"
              : `Create ${props.provider.name} connection`}
          </Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>
            {props.returnTo !== undefined
              ? `For ${props.returnTo}${keyed() ? " · 1 of 2" : ""}`
              : keyed()
                ? `${props.provider.name} · Step 1 of 2`
                : props.provider.name}
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
            <For each={props.provider.settings}>
              {(setting) => (
                <Field.Root
                  hint={setting.description}
                  error={
                    props.issue?.(setting.key) === "url" ? "Enter an http or https URL." : undefined
                  }
                >
                  <Field.Label>{settingLabel(setting)}</Field.Label>
                  <Input
                    type={setting.kind === "url" ? "url" : "text"}
                    value={props.value(setting.key)}
                    onInput={(event) => props.onValueChange(setting.key, event.currentTarget.value)}
                    placeholder={setting.placeholder}
                    autocomplete="off"
                    spellcheck={false}
                    disabled={busy()}
                    required={setting.required}
                  />
                </Field.Root>
              )}
            </For>
            <Show
              when={props.returnTo !== undefined && props.provider.methods.length === 1 && keyed()}
              fallback={
                <Field.Root
                  hint={
                    keyed()
                      ? "You’ll add the API key in the next step."
                      : "Use this only when the endpoint accepts requests without credentials."
                  }
                >
                  <Field.Label>Authentication</Field.Label>
                  <Show
                    when={props.provider.methods.length > 1}
                    fallback={<Input value={methodLabels[props.method]} readOnly />}
                  >
                    <Select
                      options={props.provider.methods.map((method) => ({
                        value: method,
                        label: methodLabels[method],
                      }))}
                      value={props.method}
                      onChange={(value) => props.onMethodChange(value as ConnectionMethod)}
                      disabled={busy()}
                    />
                  </Show>
                </Field.Root>
              }
            >
              <p class={s.note}>
                API key authentication. Add the key next, then return to your environment.
              </p>
            </Show>
            <Show when={props.error}>
              {(error) => (
                <ConnectionsAlert
                  action="create"
                  error={error()}
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
            {keyed() ? "Create & continue" : "Create connection"}
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface ConnectionKeyProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The connection, by name. */
  readonly name: string;
  /**
   * `setup` right after creating it, `add` for a connection without a key, or `replace` for one
   * whose saved key stays until the new one is saved.
   */
  readonly mode: "setup" | "add" | "replace";
  readonly secret: string;
  readonly onSecretChange: (secret: string) => void;
  readonly onSave: () => void;
  readonly pending?: boolean;
  /** Why saving failed; the connection keeps any earlier key. */
  readonly error?: ConnectionsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  /** The environment the flow returns to once the key is saved, with this connection chosen. */
  readonly returnTo?: string;
}

/**
 * Entering a key, masked. It is stored write-only: once saved it cannot be viewed or copied, and
 * saving does not test it with the provider. Closing discards what was typed.
 */
export function ConnectionKey(props: ConnectionKeyProps) {
  const formId = `connection-key-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  const replacing = () => props.mode === "replace";
  const unsaved = () =>
    props.error === "storage-unavailable" || props.error === "failed" ? props.error : undefined;
  return (
    <Modal.Root
      open={props.open}
      onClose={close}
      aria-label={replacing() ? "Replace API key" : "Add API key"}
      size="compact"
    >
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>{replacing() ? "Replace API key" : "Add API key"}</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>
            {props.mode === "setup"
              ? `${props.name} · ${props.returnTo === undefined ? "Step 2 of 2" : "2 of 2"}`
              : props.name}
          </Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.keyForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.secret.trim() && !busy()) props.onSave();
            }}
          >
            <p class={s.intro}>
              {props.mode === "setup" && props.returnTo !== undefined
                ? "The connection is created. Save its key to finish setup."
                : props.mode === "setup"
                  ? "Your connection is created. Add its API key to finish setup."
                  : replacing()
                    ? "The current key stays in place until the new key is saved."
                    : "Add its API key to finish setup."}
            </p>
            <Field.Root
              hint="Stored securely. Once saved, it cannot be viewed or copied."
              error={
                props.error === "invalid" ? connectionsMessage("set-key", "invalid") : undefined
              }
            >
              <Field.Label>{replacing() ? "New API key" : "API key"}</Field.Label>
              <Input
                type="password"
                value={props.secret}
                onInput={(event) => props.onSecretChange(event.currentTarget.value)}
                autocomplete="off"
                spellcheck={false}
                disabled={busy()}
                autofocus
                required
              />
            </Field.Root>
            <Show
              when={unsaved()}
              fallback={
                <>
                  <p class={s.note}>
                    {props.returnTo === undefined
                      ? "Saving a key does not test it with the provider."
                      : `You’ll return to ${props.returnTo} with this connection selected.`}
                  </p>
                  <Show when={props.error && props.error !== "invalid" && props.error}>
                    {(error) => (
                      <ConnectionsAlert
                        action="set-key"
                        error={error()}
                        onRefresh={props.onRefresh}
                        refreshing={props.refreshing}
                      />
                    )}
                  </Show>
                </>
              }
            >
              {(error) => (
                <Notice title="API key wasn’t saved" alert>
                  {connectionsMessage("set-key", error())}
                </Notice>
              )}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button class={s.leading} onClick={close} disabled={busy()}>
            {props.mode === "setup" ? "Finish later" : "Cancel"}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            class={s.primary}
            disabled={!props.secret.trim() || busy()}
          >
            {unsaved()
              ? "Try again"
              : replacing()
                ? "Replace key"
                : props.returnTo === undefined
                  ? "Save key"
                  : "Save key & return"}
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
  readonly error?: ConnectionsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms removing a connection and deleting its key. */
export function ConfirmRemoveConnection(props: ConfirmRemoveConnectionProps) {
  return (
    <Confirm
      open={props.open}
      onClose={props.onClose}
      title="Remove connection?"
      subtitle={props.name}
      body={
        props.keySaved
          ? `${props.name} will be removed from the workspace, along with its saved key.`
          : `${props.name} will be removed from the workspace.`
      }
      confirm="Remove connection"
      action="remove"
      onConfirm={props.onConfirm}
      pending={props.pending}
      error={props.error}
      onRefresh={props.onRefresh}
      refreshing={props.refreshing}
    />
  );
}

export interface ConfirmRemoveKeyProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly name: string;
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly error?: ConnectionsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms deleting a connection's saved key, after which it needs a new one. */
export function ConfirmRemoveKey(props: ConfirmRemoveKeyProps) {
  return (
    <Confirm
      open={props.open}
      onClose={props.onClose}
      title="Remove API key?"
      subtitle={props.name}
      body={`The saved key will be deleted. ${props.name} will need a new key before it can be used.`}
      confirm="Remove key"
      action="clear-key"
      onConfirm={props.onConfirm}
      pending={props.pending}
      error={props.error}
      onRefresh={props.onRefresh}
      refreshing={props.refreshing}
    />
  );
}

function Confirm(props: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle: string;
  readonly body: string;
  readonly confirm: string;
  readonly action: "remove" | "clear-key";
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly error?: ConnectionsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}) {
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label={props.title} size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>{props.title}</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.subtitle}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.stack}>
            <p class={s.confirm}>{props.body}</p>
            <Show when={props.error}>
              {(error) => (
                <ConnectionsAlert
                  action={props.action}
                  error={error()}
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
            {props.confirm}
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
