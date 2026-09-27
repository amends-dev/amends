import { Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Choice } from "../../components/choice/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { MemberPicker, type PickerPerson } from "../../components/member-picker/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import type { GroupChangeError, GroupVisibility } from "./group-settings.tsx";
import * as s from "./settings.css.ts";

const createErrors: { readonly [Error in GroupChangeError]: string } = {
  changed: "Something changed while you were choosing. Try again.",
  denied: "You can no longer create groups here.",
  gone: "Someone you added is no longer in this workspace. Remove them and try again.",
  invalid: "Check the name and try again.",
  failed: "The group could not be created. Try again when the host is available.",
};

export interface CreateGroupProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly nameError?: string;
  readonly visibility: GroupVisibility;
  readonly onVisibilityChange: (visibility: GroupVisibility) => void;
  /** The reader, always included. */
  readonly you: PickerPerson;
  readonly candidates: readonly PickerPerson[];
  readonly selected: readonly string[];
  readonly onSelectedChange: (ids: string[]) => void;
  readonly creating?: boolean;
  /** Why the last attempt failed; the form stays for another try. */
  readonly error?: GroupChangeError;
  readonly onCreate: () => void;
}

const visibilityHints: Record<GroupVisibility, string> = {
  public: "Anyone in the workspace can find this group and join it.",
  private: "Only people added to this group can find it.",
};

/** Creating a group in a modal: its name, visibility, and first members, with the reader included. */
export function CreateGroup(props: CreateGroupProps) {
  const formId = `create-group-${createUniqueId()}`;
  const count = () => props.selected.length + 1;
  return (
    <Modal.Root open={props.open} onClose={() => props.onClose()} aria-label="Create group">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Create group</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>Set a name, visibility, and members.</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.name.trim() && !props.creating) props.onCreate();
            }}
          >
            <Field.Root error={props.nameError}>
              <Field.Label>Group name</Field.Label>
              <Input
                value={props.name}
                placeholder="e.g. release-planning"
                onInput={(event) => props.onNameChange(event.currentTarget.value)}
                autocomplete="off"
                autofocus
                required
              />
            </Field.Root>
            <Choice.Group
              label="Visibility"
              value={props.visibility}
              onChange={(value) => props.onVisibilityChange(value as GroupVisibility)}
              hint={visibilityHints[props.visibility]}
            >
              <Choice.Option value="public">Public</Choice.Option>
              <Choice.Option value="private">Private</Choice.Option>
            </Choice.Group>
            <Field.Root
              hint={
                props.selected.length === 0
                  ? "You’re included automatically. Add others now or later."
                  : `${count()} members, including you.`
              }
            >
              <Field.Label>Members</Field.Label>
              <MemberPicker
                locked={[props.you]}
                candidates={props.candidates}
                selected={props.selected}
                onSelectedChange={props.onSelectedChange}
              />
            </Field.Root>
            <Show when={props.error}>
              {(error) => <Field.Alert>{createErrors[error()]}</Field.Alert>}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button onClick={() => props.onClose()}>Cancel</Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!props.name.trim() || props.creating}
          >
            Create group
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
