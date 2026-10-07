import { Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Select } from "../../components/select/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { SetupFields, type SetupFieldsProps } from "./setup-fields.tsx";
import {
  AgentsAlert,
  setupProblems,
  type AgentRoleOption,
  type AgentsFailure,
} from "./wording.tsx";
import * as s from "./agents.css.ts";

export interface AddAgentProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Under the title. */
  readonly workspaceName: string;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** The roles it may start with; the reader may give only those marked assignable. */
  readonly roles: readonly AgentRoleOption[];
  readonly roleId: string | undefined;
  readonly onRoleChange: (roleId: string) => void;
  /** The setup being drafted, with what each part may be. */
  readonly setup: Omit<SetupFieldsProps, "problems" | "disabled">;
  /** The draft has a name, a role, a harness, and a model. */
  readonly ready: boolean;
  readonly onCreate: () => void;
  readonly pending?: boolean;
  /** Why creating failed; the draft stays and retrying does not create it twice. */
  readonly failure?: AgentsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/**
 * Adding an agent: its name and the role it starts with, as a member's, then how it is set up,
 * created together. What the host refuses shows beside the field it concerns.
 */
export function AddAgent(props: AddAgentProps) {
  const formId = `add-agent-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Add agent" size="form">
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
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.ready && !busy()) props.onCreate();
            }}
          >
            <Field.Root hint="How the workspace calls and mentions it.">
              <Field.Label>Agent name</Field.Label>
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
            <Field.Root
              hint="What it may do in the workspace, as a member with this role."
              error={
                props.failure?.error === "role-denied" ? "You can’t give this role." : undefined
              }
            >
              <Field.Label>Role</Field.Label>
              <Select
                options={props.roles.map((role) => ({
                  value: role.id,
                  label: role.name,
                  disabled: !role.assignable,
                  description: role.assignable ? undefined : "Only the owner can give this role",
                }))}
                value={props.roleId}
                onChange={props.onRoleChange}
                placeholder="Choose a role"
                disabled={busy()}
              />
            </Field.Root>
            <SetupFields
              {...props.setup}
              problems={setupProblems(props.failure)}
              disabled={busy()}
            />
            <Show when={props.failure}>
              {(failure) => (
                <AgentsAlert
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
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly failure?: AgentsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms removing an agent, which ends its membership. */
export function ConfirmRemoveAgent(props: ConfirmRemoveAgentProps) {
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Remove agent?" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Remove agent?</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.name}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.stack}>
            <p class={s.confirm}>
              {`${props.name} will leave the workspace. Its messages stay in their threads.`}
            </p>
            <Show when={props.failure}>
              {(failure) => (
                <AgentsAlert
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
            Remove agent
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
