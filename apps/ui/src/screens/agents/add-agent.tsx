import { Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Select } from "../../components/select/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { InstructionsField, ModelFields, type ModelFieldsProps } from "./configuration-fields.tsx";
import {
  AgentsAlert,
  problemMessage,
  type AgentProblem,
  type AgentRoleOption,
  type AgentsError,
} from "./wording.tsx";
import * as s from "./agents.css.ts";

export interface AddAgentProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Under the title. */
  readonly workspaceName: string;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** The roles the reader may give; one is shown as fixed, several as a choice. */
  readonly roles: readonly AgentRoleOption[];
  readonly roleId: string | undefined;
  readonly onRoleChange: (roleId: string) => void;
  /** The model access and environment being chosen. */
  readonly configuration: Omit<ModelFieldsProps, "problems" | "purpose" | "disabled"> & {
    readonly instructions: string;
    readonly onInstructionsChange: (instructions: string) => void;
  };
  /** Everything is complete, so the agent can be created. */
  readonly ready: boolean;
  readonly onCreate: () => void;
  readonly pending?: boolean;
  /** Why creating failed; the draft stays and retrying does not create it twice. */
  readonly error?: AgentsError;
  readonly problems?: readonly AgentProblem[];
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/**
 * Adding an agent: its name and initial role, then its model access, where it starts, and its
 * instructions. An environment that still needs setup can be chosen and finished later; one that
 * cannot run the model cannot.
 */
export function AddAgent(props: AddAgentProps) {
  const formId = `add-agent-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  const roleDenied = () => (props.problems ?? []).find((problem) => problem.kind === "role-denied");
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Add agent" size="wide">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Add agent</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.fields}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.ready && !busy()) props.onCreate();
            }}
          >
            <div class={s.pair}>
              <Field.Root>
                <Field.Label>Name</Field.Label>
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
              <Field.Root error={roleDenied() && problemMessage(roleDenied()!)}>
                <Field.Label>Workspace role</Field.Label>
                <Show
                  when={props.roles.length > 1}
                  fallback={
                    <Input
                      value={props.roles.find((role) => role.id === props.roleId)?.name ?? "Member"}
                      readOnly
                    />
                  }
                >
                  <Select
                    options={props.roles.map((role) => ({ value: role.id, label: role.name }))}
                    value={props.roleId}
                    onChange={props.onRoleChange}
                    disabled={busy()}
                  />
                </Show>
              </Field.Root>
            </div>
            <ModelFields
              {...props.configuration}
              purpose="create"
              problems={props.problems}
              disabled={busy()}
            />
            <InstructionsField
              value={props.configuration.instructions}
              onChange={props.configuration.onInstructionsChange}
              disabled={busy()}
            />
            <Show when={props.error && (props.problems ?? []).length === 0 && props.error}>
              {(error) => (
                <AgentsAlert
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
          <Button class={s.leading} onClick={close} disabled={busy()}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            class={s.primary}
            disabled={!props.ready || busy()}
          >
            Create agent
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface ConfirmRemoveAgentProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly name: string;
  /** Under the title. */
  readonly workspaceName: string;
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly error?: AgentsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms removing an agent: its membership ends, and its record stays in history. */
export function ConfirmRemoveAgent(props: ConfirmRemoveAgentProps) {
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Remove agent" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>{`Remove ${props.name}?`}</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.stack}>
            <p class={s.confirm}>
              {`${props.name} will lose access to this workspace and its groups. The agent’s record stays in history.`}
            </p>
            <p class={s.confirm}>
              A removed agent can’t be restored; create a new agent if needed.
            </p>
            <Show when={props.error}>
              {(error) => (
                <AgentsAlert
                  action="remove"
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
            Remove agent
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
