import { Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import * as s from "./account.css.ts";

/** Why a name was not saved. */
export type ChangeNameError = "changed" | "denied" | "gone" | "invalid" | "failed";

const errors: { readonly [Error in ChangeNameError]: string } = {
  changed: "Your name changed meanwhile. Try again.",
  denied: "You can no longer change your name here.",
  gone: "You are no longer in this workspace.",
  invalid: "Use 1 to 80 characters.",
  failed: "Your name could not be saved. Try again when the host is available.",
};

export interface ChangeNameProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceName: string;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** The name is valid and differs from the saved one. */
  readonly ready: boolean;
  readonly pending?: boolean;
  readonly error?: ChangeNameError;
  readonly onSave: () => void;
}

/** What people in one workspace call the reader, in a compact modal. */
export function ChangeName(props: ChangeNameProps) {
  const formId = `change-name-${createUniqueId()}`;
  const close = () => {
    if (!props.pending) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Your name" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title context={props.workspaceName}>Your name</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>
            What people in this workspace call you. Others keep their own.
          </Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.ready && !props.pending) props.onSave();
            }}
          >
            <Field.Root error={props.error === "invalid" ? errors.invalid : undefined}>
              <Field.Label>Name</Field.Label>
              <Input
                value={props.name}
                onInput={(event) => props.onNameChange(event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
                autocomplete="name"
                maxLength={80}
                disabled={props.pending}
                autofocus
              />
            </Field.Root>
            <Show when={props.error && props.error !== "invalid" && props.error}>
              {(error) => <Field.Alert>{errors[error()]}</Field.Alert>}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button onClick={close} disabled={props.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!props.ready || props.pending}
          >
            Save name
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
