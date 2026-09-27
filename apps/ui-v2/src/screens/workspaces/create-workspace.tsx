import { Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import * as s from "./workspaces.css.ts";

/** Why a workspace was not created. */
export type CreateWorkspaceError =
  | "invalid-name"
  | "invalid-member-name"
  | "denied"
  | "request-reused"
  | "request-failed";

const errors: { readonly [Error in CreateWorkspaceError]: string } = {
  "invalid-name": "Enter a workspace name.",
  "invalid-member-name": "Use up to 80 characters.",
  denied: "This identity can’t create workspaces.",
  "request-reused":
    "This request was already used for a different name. Close this and start again.",
  "request-failed":
    "We couldn’t confirm creation. Try again with this name to safely check the same request.",
};

export interface CreateWorkspaceProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** What people there will call the reader; empty shows their identity. */
  readonly memberName: string;
  readonly onMemberNameChange: (name: string) => void;
  readonly pending?: boolean;
  readonly error?: CreateWorkspaceError;
  readonly onCreate: () => void;
  /** The workspace exists and the list is reloading before it opens. */
  readonly created?: {
    readonly name: string;
    readonly pending: boolean;
    readonly refreshFailed: boolean;
  };
  /** Reload the list after `created.refreshFailed`. */
  readonly onRetry?: () => void;
}

/** Naming a new workspace and what people there call the reader; the reader becomes its owner. */
export function CreateWorkspace(props: CreateWorkspaceProps) {
  const formId = `create-workspace-${createUniqueId()}`;
  const busy = () => props.pending || props.created?.pending;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Create workspace" size="compact">
      <Pane.Root variant="modal">
        <Show
          when={props.created}
          fallback={
            <>
              <Pane.Header>
                <Pane.Title>Create workspace</Pane.Title>
                <Pane.Actions>
                  <Pane.Close label="Close" onClick={close} />
                </Pane.Actions>
                <Pane.Subtitle>A shared place for your team.</Pane.Subtitle>
              </Pane.Header>
              <Pane.Body>
                <form
                  id={formId}
                  class={s.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (props.name.trim() && !props.pending) props.onCreate();
                  }}
                >
                  <Field.Root
                    hint="You’ll be the owner of this workspace."
                    error={props.error === "invalid-name" ? errors["invalid-name"] : undefined}
                  >
                    <Field.Label>Workspace name</Field.Label>
                    <Input
                      value={props.name}
                      onInput={(event) => props.onNameChange(event.currentTarget.value)}
                      autocomplete="organization"
                      disabled={props.pending}
                      autofocus
                      required
                    />
                  </Field.Root>
                  <Field.Root
                    hint="What people there will call you. You can change it later."
                    error={
                      props.error === "invalid-member-name"
                        ? errors["invalid-member-name"]
                        : undefined
                    }
                  >
                    <Field.Label>Your name</Field.Label>
                    <Input
                      value={props.memberName}
                      onInput={(event) => props.onMemberNameChange(event.currentTarget.value)}
                      autocomplete="name"
                      maxLength={80}
                      disabled={props.pending}
                    />
                  </Field.Root>
                  <Show
                    when={
                      props.error &&
                      props.error !== "invalid-name" &&
                      props.error !== "invalid-member-name" &&
                      props.error
                    }
                  >
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
                  disabled={!props.name.trim() || props.pending}
                >
                  Create workspace
                </Button>
              </Modal.Actions>
            </>
          }
        >
          {(created) => (
            <>
              <Pane.Header>
                <Pane.Title>Workspace created</Pane.Title>
                <Pane.Actions>
                  <Pane.Close label="Close" onClick={close} />
                </Pane.Actions>
                <Pane.Subtitle>{created().name} is ready.</Pane.Subtitle>
              </Pane.Header>
              <Pane.Body>
                <p class={s.status} role="status">
                  {created().pending ? "Opening your workspace…" : ""}
                </p>
                <Show when={created().refreshFailed}>
                  <Field.Alert>
                    Your workspace was created, but we couldn’t refresh the list. Try again to open
                    it.
                  </Field.Alert>
                </Show>
              </Pane.Body>
              <Modal.Actions>
                <Button onClick={close} disabled={created().pending}>
                  Close
                </Button>
                <Show when={created().refreshFailed}>
                  <Button
                    variant="primary"
                    disabled={created().pending}
                    onClick={() => props.onRetry?.()}
                  >
                    Try again
                  </Button>
                </Show>
              </Modal.Actions>
            </>
          )}
        </Show>
      </Pane.Root>
    </Modal.Root>
  );
}
